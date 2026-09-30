// Conversations → rc_calls (post-call webhook, or pulled from the API when the panel opens "Rozmowy").
import { db, normPhone, one, patch, rows } from './shared.ts'
import { el } from './el.ts'
import { clientByPhone } from './memory.ts'

const OUTCOMES = ['booked', 'rescheduled', 'cancelled', 'info', 'callback', 'other']

const agentCache = new Map<string, { at: number; cid: string }>()
export async function companyByAgent(agentId: string | null | undefined): Promise<string | null> {
  if (!agentId) return null
  const hit = agentCache.get(agentId)
  if (hit && Date.now() - hit.at < 300_000) return hit.cid
  const cid = (await one<{ company_id: string }>(`rc_agents?agent_id=eq.${encodeURIComponent(agentId)}&select=company_id`))?.company_id ?? null
  if (cid) agentCache.set(agentId, { at: Date.now(), cid })
  return cid
}

/** Store / update one conversation (the ElevenLabs "GET conversation" shape, also sent by the post-call webhook). */
export async function ingest(conv: any): Promise<string | null> {
  const cid = await companyByAgent(conv?.agent_id)
  if (!cid || !conv?.conversation_id) return null
  const meta = conv.metadata ?? {}
  const pc = meta.phone_call ?? null
  const dyn = conv.conversation_initiation_client_data?.dynamic_variables ?? {}
  const channel = pc ? 'phone' : (dyn.channel === 'phone' ? 'phone' : 'test')
  const caller = normPhone(pc?.external_number ?? dyn.caller_phone ?? null)
  const dc = conv.analysis?.data_collection_results ?? {}
  const val = (k: string) => { const v = dc[k]?.value; return v === '' || v == null ? null : v }
  const existing = await one<{ id: string; outcome: string | null; needs_callback: boolean; callback_note: string | null; client_id: string | null; customer_name: string | null }>(`rc_calls?conversation_id=eq.${encodeURIComponent(conv.conversation_id)}&select=id,outcome,needs_callback,callback_note,client_id,customer_name`)
  const name = (val('customer_name') as string | null) ?? existing?.customer_name ?? null
  let clientId = existing?.client_id ?? null
  if (!clientId && caller) clientId = (await clientByPhone(cid, caller, { source: channel === 'test' ? 'ai_test' : 'phone', name }))?.id ?? null
  if (clientId && name) {
    const c = await one<{ name: string | null }>(`rc_clients?id=eq.${clientId}&select=name`)
    if (c && !c.name) await patch('rc_clients', `id=eq.${clientId}`, { name })
  }
  const aiOutcome = val('outcome') as string | null
  const outcome = existing?.outcome ?? (aiOutcome && OUTCOMES.includes(aiOutcome) ? aiOutcome : null)
  const transcript = (conv.transcript ?? []).map((t: any) => ({
    role: t.role, text: t.message ?? null, t: t.time_in_call_secs ?? null,
    tools: (t.tool_calls ?? []).map((x: any) => ({ name: x.tool_name, params: safeJson(x.params_as_json) })),
    results: (t.tool_results ?? []).map((x: any) => ({ name: x.tool_name, error: !!x.is_error, value: String(x.result_value ?? '').slice(0, 1500) })),
  })).filter((t: any) => t.text || t.tools.length || t.results.length)
  const status = conv.status === 'done' ? 'done' : conv.status === 'failed' ? 'failed' : 'in_progress'
  const row = {
    company_id: cid, conversation_id: conv.conversation_id, agent_id: conv.agent_id, channel, caller_phone: caller, called_number: normPhone(pc?.agent_number) ? `+${normPhone(pc?.agent_number)}` : null,
    client_id: clientId, started_at: meta.start_time_unix_secs ? new Date(meta.start_time_unix_secs * 1000).toISOString() : undefined, duration_s: meta.call_duration_secs ?? null, status,
    title: conv.analysis?.call_summary_title ?? null, summary: conv.analysis?.transcript_summary ?? null, outcome, customer_name: name, transcript,
    has_audio: !!conv.has_audio, needs_callback: !!existing?.needs_callback || val('needs_callback') === true,
    callback_note: existing?.callback_note ?? (val('callback_reason') as string | null), cost_usd: meta.cost_fiat ?? null,
  }
  const r = await db('/rest/v1/rc_calls?on_conflict=conversation_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row) })
  return r.ok ? r.body?.[0]?.id ?? null : null
}

/** A phone call that never reached the agent (busy, error) — still a missed call worth calling back. */
export async function ingestFailure(data: any) {
  const cid = await companyByAgent(data?.agent_id)
  if (!cid) return
  const body = data?.metadata?.body ?? {}
  const caller = normPhone(body.From ?? body.from ?? null)
  const client = caller ? await clientByPhone(cid, caller, { source: 'phone' }) : null
  await db('/rest/v1/rc_calls?on_conflict=conversation_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({
    company_id: cid, conversation_id: data.conversation_id ?? `fail-${crypto.randomUUID()}`, agent_id: data.agent_id, channel: 'phone', caller_phone: caller, client_id: client?.id ?? null,
    status: 'failed', title: 'Nieodebrane połączenie', summary: `Połączenie nie zostało obsłużone (${data.failure_reason ?? 'błąd'}). Oddzwoń do klienta.`, needs_callback: !!caller, outcome: 'callback',
  }) })
}

/** Pull recent conversations of a company's agent that we have not stored as finished yet. */
export async function pullCalls(cid: string, only?: string): Promise<number> {
  const a = await one<{ agent_id: string | null }>(`rc_agents?company_id=eq.${cid}&select=agent_id`)
  if (!a?.agent_id) return 0
  let ids: string[] = []
  if (only) ids = [only]
  else {
    const list = await el<{ conversations: { conversation_id: string; status: string }[] }>(`/v1/convai/conversations?agent_id=${a.agent_id}&page_size=30`)
    const known = await rows<{ conversation_id: string; status: string }>(`rc_calls?company_id=eq.${cid}&conversation_id=in.(${list.conversations.map(c => `"${c.conversation_id}"`).join(',') || '""'})&select=conversation_id,status`)
    ids = list.conversations.filter(c => !known.some(k => k.conversation_id === c.conversation_id && k.status !== 'in_progress')).map(c => c.conversation_id)
  }
  let n = 0
  for (const id of ids.slice(0, 15)) {
    try { const conv = await el(`/v1/convai/conversations/${id}`); if (await ingest(conv)) n++ } catch { /* keep going */ }
  }
  return n
}

function safeJson(s: string) { try { return JSON.parse(s) } catch { return s } }
