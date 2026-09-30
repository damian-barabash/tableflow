// Supabase Edge Function "reception" (verify_jwt = false: ElevenLabs calls the webhooks with our token;
// panel/admin actions check the user's JWT themselves).
//
//  POST /reception/tool/{name}?k=TOKEN   ← agent tools during a call (availability, booking, CRM…)
//  POST /reception/init?k=TOKEN          ← call start (Twilio): who is calling → dynamic variables
//  POST /reception/hook?k=TOKEN          ← post-call webhook: transcript, summary, analysis
//  POST /reception  {action, …}          ← panel (/panel) and admin (/admin) actions
import { CORS, FN_URL, HttpError, audit, db, fail, json, normPhone, one, patch, rows, secret, setSecret, userCan, userId } from './shared.ts'
import { el, elJson, elKey, elMessage, forgetKey, ElError } from './el.ts'
import { TOOL_DEFS, runTool } from './tools.ts'
import { hookToken, linkNumbers, platform, setupAccount, syncCompany } from './agent.ts'
import { companyByAgent, ingest, ingestFailure, pullCalls } from './calls.ts'
import { clientByPhone, clientContext } from './memory.ts'
import { findSlots, loadCatalog } from './availability.ts'
import { hhmm, isDate } from './time.ts'

async function tokenOk(url: URL) {
  const k = url.searchParams.get('k') ?? ''
  const t = await secret('rc_hook_token')
  return !!t && k === t
}
async function hmacOk(req: Request, raw: string): Promise<boolean> {
  const sec = await secret('rc_postcall_secret')
  if (!sec) return true
  const h = req.headers.get('elevenlabs-signature') ?? ''
  const t = h.match(/t=(\d+)/)?.[1], v = h.match(/v0=([0-9a-f]+)/)?.[1]
  if (!t || !v || Math.abs(Date.now() / 1000 - Number(t)) > 1800) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(sec), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)))
  return Array.from(sig, b => b.toString(16).padStart(2, '0')).join('') === v
}

async function dynamicVars(cid: string, phone: string | null, channel: 'phone' | 'test') {
  const cat = await loadCatalog(cid)
  const client = phone ? await clientByPhone(cid, phone, { source: channel === 'test' ? 'ai_test' : 'phone' }) : null
  return {
    caller_phone: phone ? `+${phone}` : 'nieznany',
    client_name: client?.name ?? '',
    client_context: await clientContext(cid, cat.settings.timezone, client, cat.settings.offer_loyalty),
    channel,
  }
}

async function reverify(key: string) {
  // the agents API is what we really need; user info is optional (key may be restricted)
  await el('/v1/convai/agents?page_size=1', { key })
  let account: string | null = null, billing: string | null = null
  try {
    const s = await el<{ tier?: string; status?: string; character_count?: number; character_limit?: number; has_open_invoices?: boolean; open_invoices?: { amount_due_cents?: number }[] }>('/v1/user/subscription', { key })
    account = s.tier ? `plan ${s.tier} · ${s.character_count ?? 0}/${s.character_limit ?? 0} kredytów` : null
    // an unpaid invoice blocks every new conversation ("payment_issue") — show it in the admin
    if (s.status === 'past_due' || s.status === 'unpaid' || s.has_open_invoices) {
      const due = (s.open_invoices ?? []).reduce((a, i) => a + (i.amount_due_cents ?? 0), 0)
      billing = `Zaległa płatność w ElevenLabs${due ? ` (${(due / 100).toFixed(2)} USD)` : ''} — rozmowy są zablokowane, dopóki faktura nie zostanie opłacona (ElevenLabs → Billing).`
    }
  } catch { /* optional */ }
  return { account, billing }
}

/** Import (or re-import after an account switch) a Twilio number into the current ElevenLabs account. */
async function importNumber(phone: string, label: string, sid?: string | null, token?: string | null) {
  const s = sid || await secret('rc_twilio_sid'), t = token || await secret('rc_twilio_token')
  if (!s || !t) throw new HttpError('Podaj Twilio Account SID i Auth Token (albo zapisz je w ustawieniach Twilio).')
  const r = await elJson<{ phone_number_id: string }>('/v1/convai/phone-numbers', 'POST', { provider: 'twilio', phone_number: phone, label, sid: s, token: t })
  return r.phone_number_id
}

/** The admin page reloads its own data (admin_reception needs the admin's JWT, not the service role). */
async function adminStatus() { return null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const route = parts.slice(parts.indexOf('reception') + 1)

  try {
    // ------------------------------------------------ ElevenLabs → us
    if (route[0] === 'tool') {
      if (!await tokenOk(url)) return fail('unauthorized', 401)
      const body = await req.json().catch(() => ({}))
      const cid = await companyByAgent(body.agent_id)
      if (!cid) return json({ ok: false, error: 'Asystent nie jest przypisany do firmy.' })
      const [comp] = await Promise.all([one<{ status: string }>(`companies?id=eq.${cid}&select=status`), loadCatalog(cid)])   // catalog warms the cache for the tool
      if (comp?.status === 'paused') return json({ ok: false, error: 'Rezerwacje są chwilowo wstrzymane — zostaw wiadomość dla zespołu.' })
      const phone = normPhone(body.caller_phone)
      const test = String(body.channel ?? '') === 'test'
      const out = await runTool(route[1], body, { cid, agentId: body.agent_id, conversationId: body.conversation_id ?? null, callerPhone: phone, channel: test ? 'test' : 'phone' })
      return json(out)
    }
    if (route[0] === 'init') {
      if (!await tokenOk(url)) return fail('unauthorized', 401)
      const body = await req.json().catch(() => ({}))
      let cid = await companyByAgent(body.agent_id)
      if (!cid && body.called_number) cid = (await one<{ company_id: string }>(`rc_numbers?phone_number=eq.${encodeURIComponent('+' + (normPhone(body.called_number) ?? ''))}&select=company_id`))?.company_id ?? null
      const phone = normPhone(body.caller_id)
      const vars = cid ? await dynamicVars(cid, phone, 'phone') : { caller_phone: phone ? `+${phone}` : 'nieznany', client_name: '', client_context: 'Brak danych o kliencie.', channel: 'phone' }
      return json({ type: 'conversation_initiation_client_data', dynamic_variables: vars })
    }
    if (route[0] === 'hook') {
      if (!await tokenOk(url)) return fail('unauthorized', 401)
      const raw = await req.text()
      if (!await hmacOk(req, raw)) return fail('bad_signature', 401)
      const ev = JSON.parse(raw)
      if (ev.type === 'post_call_transcription') await ingest(ev.data)
      else if (ev.type === 'call_initiation_failure') await ingestFailure(ev.data)
      return json({ ok: true })
    }

    // ------------------------------------------------ panel / admin
    if (req.method !== 'POST') return fail('method', 405)
    const auth = req.headers.get('Authorization')
    const b = await req.json().catch(() => ({})) as Record<string, any>
    const action = String(b.action ?? '')
    const cid = b.company_id ? String(b.company_id) : ''
    const needAccess = async () => { if (!cid || !await userCan(auth, 'can_access_company', cid)) throw new HttpError('forbidden', 403) }
    const needManage = async () => { if (!cid || !await userCan(auth, 'can_manage_company', cid)) throw new HttpError('forbidden', 403) }
    const needAdmin = async () => { if (!await userCan(auth, 'is_superadmin')) throw new HttpError('forbidden', 403) }

    switch (action) {
      // ---------- panel
      case 'status': {
        await needAccess()
        const [p, a, numbers] = await Promise.all([
          one<{ el_status: string; webhooks_ok: boolean }>('rc_platform?id=eq.1&select=el_status,webhooks_ok,el_generation'),
          one<{ agent_id: string | null; synced_at: string | null; config_changed_at: string; sync_error: string | null; el_generation: number | null; last_test_at: string | null }>(`rc_agents?company_id=eq.${cid}&select=*`),
          rows<{ phone_number: string; label: string | null; el_phone_id: string | null; last_error: string | null }>(`rc_numbers?company_id=eq.${cid}&select=phone_number,label,el_phone_id,last_error&order=created_at.asc`),
        ])
        const gen = (await platform()).el_generation
        const stale = !a?.agent_id || !a.synced_at || Date.parse(a.config_changed_at) > Date.parse(a.synced_at) || a.el_generation !== gen
        return json({ platform_ok: p?.el_status === 'ok', webhooks_ok: !!p?.webhooks_ok, agent: a, stale, numbers, test_mode: !numbers.some(n => n.el_phone_id) })
      }
      case 'sync': {
        await needManage()
        const r = await syncCompany(cid)
        return json({ ok: true, ...r })
      }
      case 'test_session': {
        await needAccess()
        const a = await one<{ agent_id: string | null; synced_at: string | null; config_changed_at: string; el_generation: number | null }>(`rc_agents?company_id=eq.${cid}&select=*`)
        const gen = (await platform()).el_generation
        let agentId = a?.agent_id ?? null
        if (!agentId || !a?.synced_at || Date.parse(a.config_changed_at) > Date.parse(a.synced_at) || a.el_generation !== gen) agentId = (await syncCompany(cid)).agent_id
        const phone = normPhone(b.caller_phone)
        const vars = await dynamicVars(cid, phone, 'test')
        const s = await el<{ signed_url: string }>(`/v1/convai/conversation/get-signed-url?agent_id=${agentId}`)
        await patch('rc_agents', `company_id=eq.${cid}`, { last_test_at: new Date().toISOString() })
        return json({ signed_url: s.signed_url, agent_id: agentId, dynamic_variables: vars })
      }
      case 'test_started': {
        // mark the conversation as a test before its first tool call (bookings get source "ai_test")
        await needAccess()
        if (!b.conversation_id) return fail('conversation_id')
        await db('/rest/v1/rc_calls?on_conflict=conversation_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ company_id: cid, conversation_id: String(b.conversation_id), channel: 'test', caller_phone: normPhone(b.caller_phone), status: 'in_progress' }) })
        return json({ ok: true })
      }
      case 'calls_pull': {
        await needAccess()
        const n = await pullCalls(cid, b.conversation_id ? String(b.conversation_id) : undefined).catch(() => 0)
        return json({ ok: true, updated: n })
      }
      case 'call_audio': {
        await needAccess()
        const c = await one<{ conversation_id: string }>(`rc_calls?id=eq.${b.call_id}&company_id=eq.${cid}&select=conversation_id`)
        if (!c) return fail('not_found', 404)
        const key = await elKey()
        const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${c.conversation_id}/audio`, { headers: { 'xi-api-key': key ?? '' } })
        if (!r.ok) return fail('no_audio', 404)
        return new Response(r.body, { headers: { ...CORS, 'Content-Type': r.headers.get('content-type') ?? 'audio/mpeg' } })
      }
      case 'slots': {
        await needAccess()
        const cat = await loadCatalog(cid)
        const svc = cat.services.find(s => s.id === b.service_id)
        if (!svc || !isDate(b.date)) return fail('bad_request')
        const days = await findSlots(cat, svc, { from: b.date, days: Math.min(7, Number(b.days) || 1), party: Number(b.party) || undefined, resourceIds: b.resource_id ? [String(b.resource_id)] : undefined, forAi: false, excludeBooking: b.exclude ? String(b.exclude) : undefined, now: new Date(Date.now() - 24 * 3600000 * (b.past ? 1 : 0)) })
        return json(days.map(d => ({ date: d.date, closed: d.closed, reason: d.reason ?? null, slots: d.slots.map(s => ({ time: hhmm(s.min), start: s.start.toISOString(), resources: s.resources.map(r => r.id) })) })))
      }

      // ---------- admin: ElevenLabs account
      case 'admin_status': {
        await needAdmin()
        return json(await adminStatus())
      }
      case 'admin_set_key': {
        await needAdmin()
        const key = String(b.key ?? '').trim()
        if (!/^sk_[A-Za-z0-9]{20,}$/.test(key)) return fail('Nieprawidłowy format klucza (sk_…).')
        let account: string | null, billing: string | null
        try { ({ account, billing } = await reverify(key)) } catch (e) { return fail(elMessage(e)) }
        const p = await platform()
        const hint = `${key.slice(0, 5)}…${key.slice(-5)}`
        const switched = !!p.el_key_hint && p.el_key_hint !== hint && !b.same_account
        await setSecret('rc_el_api_key', key); forgetKey()
        const upd: Record<string, unknown> = { el_key_hint: hint, el_account: account, el_status: 'ok', el_error: billing, el_checked_at: new Date().toISOString() }
        if (switched) Object.assign(upd, { el_generation: p.el_generation + 1, tools: {}, post_call_webhook_id: null, webhooks_ok: false })
        await patch('rc_platform', 'id=eq.1', upd)
        if (switched) { await setSecret('rc_postcall_secret', null); await db('/rest/v1/rc_numbers?el_phone_id=not.is.null', { method: 'PATCH', body: JSON.stringify({ el_phone_id: null, last_error: 'Nowe konto ElevenLabs — numer do ponownego importu' }) }) }
        const setup = await setupAccount().catch(e => ({ tools: 0, webhooks: false, warnings: [elMessage(e)] }))
        const uid = await userId(auth)
        await audit(uid, 'elevenlabs_key', 'platform', '1', { hint, switched })
        // after an account switch: numbers first (Twilio creds are in Vault), then every agent
        const report: string[] = [...setup.warnings]
        if (switched) {
          for (const n of await rows<{ id: string; phone_number: string; label: string | null }>('rc_numbers?select=id,phone_number,label')) {
            try { const id = await importNumber(n.phone_number, n.label ?? n.phone_number); await patch('rc_numbers', `id=eq.${n.id}`, { el_phone_id: id, last_error: null }) }
            catch (e) { report.push(`${n.phone_number}: ${elMessage(e)}`) }
          }
          for (const c of await rows<{ company_id: string }>('rc_agents?agent_id=not.is.null&select=company_id')) {
            try { await syncCompany(c.company_id) } catch (e) { report.push(`Agent ${c.company_id.slice(0, 8)}: ${elMessage(e)}`) }
          }
        }
        return json({ ok: true, switched, account, report, status: await adminStatus() })
      }
      case 'admin_check': {
        await needAdmin()
        const key = await elKey()
        if (!key) return json({ ok: false, status: await adminStatus() })
        try { const { account, billing } = await reverify(key); await patch('rc_platform', 'id=eq.1', { el_status: 'ok', el_error: billing, el_account: account, el_checked_at: new Date().toISOString() }) }
        catch (e) { await patch('rc_platform', 'id=eq.1', { el_status: 'error', el_error: elMessage(e), el_checked_at: new Date().toISOString() }) }
        return json({ ok: true, status: await adminStatus() })
      }
      case 'admin_setup': {
        await needAdmin()
        const r = await setupAccount()
        return json({ ok: true, ...r, status: await adminStatus() })
      }
      case 'admin_sync_all': {
        await needAdmin()
        const report: { company: string; ok: boolean; error?: string }[] = []
        const list = await rows<{ id: string; name: string }>('companies?modules=cs.{reception}&select=id,name')
        for (const c of list) { try { await syncCompany(c.id); report.push({ company: c.name, ok: true }) } catch (e) { report.push({ company: c.name, ok: false, error: elMessage(e) }) } }
        return json({ ok: true, report, status: await adminStatus() })
      }
      case 'admin_sync_company': {
        await needAdmin()
        const r = await syncCompany(String(b.target))
        return json({ ok: true, ...r, status: await adminStatus() })
      }
      case 'admin_twilio': {
        await needAdmin()
        const sid = String(b.sid ?? '').trim(), token = String(b.token ?? '').trim()
        if (!/^(AC|SK)[0-9a-f]{32}$/i.test(sid) || token.length < 20) return fail('Nieprawidłowy Account SID lub Auth Token.')
        await setSecret('rc_twilio_sid', sid); await setSecret('rc_twilio_token', token)
        await patch('rc_platform', 'id=eq.1', { twilio_sid_hint: `${sid.slice(0, 6)}…${sid.slice(-4)}` })
        return json({ ok: true, status: await adminStatus() })
      }

      // ---------- admin: numbers
      case 'numbers_pull': {
        await needAdmin()
        const list = await el<any[]>('/v1/convai/phone-numbers')
        const agents = await rows<{ company_id: string; agent_id: string }>('rc_agents?agent_id=not.is.null&select=company_id,agent_id')
        let added = 0
        for (const n of list) {
          const e164 = n.phone_number?.startsWith('+') ? n.phone_number : `+${normPhone(n.phone_number) ?? n.phone_number}`
          const ex = await one<{ id: string; company_id: string | null }>(`rc_numbers?phone_number=eq.${encodeURIComponent(e164)}&select=id,company_id`)
          const owner = agents.find(a => a.agent_id === n.assigned_agent?.agent_id)?.company_id ?? null
          if (ex) await patch('rc_numbers', `id=eq.${ex.id}`, { el_phone_id: n.phone_number_id, label: n.label, provider: n.provider ?? 'twilio', last_error: null, ...(ex.company_id ? {} : owner ? { company_id: owner, assigned_at: new Date().toISOString() } : {}) })
          else { await db('/rest/v1/rc_numbers', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ phone_number: e164, label: n.label, provider: n.provider ?? 'twilio', el_phone_id: n.phone_number_id, company_id: owner, assigned_at: owner ? new Date().toISOString() : null }) }); added++ }
        }
        // numbers assigned in our DB but not linked in ElevenLabs → link now
        for (const a of agents) await linkNumbers(a.company_id, a.agent_id, false)
        return json({ ok: true, added, total: list.length, status: await adminStatus() })
      }
      case 'number_import': {
        await needAdmin()
        const d = normPhone(b.phone_number)
        if (!d) return fail('Nieprawidłowy numer telefonu.')
        const e164 = `+${d}`
        if (b.sid && b.token && b.remember) { await setSecret('rc_twilio_sid', String(b.sid).trim()); await setSecret('rc_twilio_token', String(b.token).trim()); await patch('rc_platform', 'id=eq.1', { twilio_sid_hint: `${String(b.sid).slice(0, 6)}…${String(b.sid).slice(-4)}` }) }
        const id = await importNumber(e164, String(b.label || e164), b.sid, b.token)
        const ex = await one<{ id: string }>(`rc_numbers?phone_number=eq.${encodeURIComponent(e164)}&select=id`)
        if (ex) await patch('rc_numbers', `id=eq.${ex.id}`, { el_phone_id: id, label: b.label || null, last_error: null })
        else await db('/rest/v1/rc_numbers', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ phone_number: e164, label: b.label || null, el_phone_id: id }) })
        await audit(await userId(auth), 'number_import', 'number', e164, {})
        // a company waiting for a number gets it automatically
        const waiting = await rows<{ id: string }>('companies?modules=cs.{reception}&select=id')
        for (const c of waiting) {
          const has = await one(`rc_numbers?company_id=eq.${c.id}&select=id`)
          const ag = await one<{ agent_id: string | null }>(`rc_agents?company_id=eq.${c.id}&select=agent_id`)
          if (!has && ag?.agent_id) { await linkNumbers(c.id, ag.agent_id, true); break }
        }
        return json({ ok: true, status: await adminStatus() })
      }
      case 'number_assign': {
        await needAdmin()
        const n = await one<{ id: string; el_phone_id: string | null; phone_number: string }>(`rc_numbers?id=eq.${b.number_id}&select=id,el_phone_id,phone_number`)
        if (!n) return fail('not_found', 404)
        const target = b.target ? String(b.target) : null
        let agentId: string | null = null
        if (target) {
          const a = await one<{ agent_id: string | null; el_generation: number | null }>(`rc_agents?company_id=eq.${target}&select=agent_id,el_generation`)
          agentId = a?.agent_id && a.el_generation === (await platform()).el_generation ? a.agent_id : (await syncCompany(target)).agent_id
        }
        if (n.el_phone_id) await elJson(`/v1/convai/phone-numbers/${n.el_phone_id}`, 'PATCH', { agent_id: agentId })
        await patch('rc_numbers', `id=eq.${n.id}`, { company_id: target, assigned_at: target ? new Date().toISOString() : null, note: null, last_error: null })
        await audit(await userId(auth), 'number_assign', 'number', n.phone_number, { company_id: target }, target)
        return json({ ok: true, status: await adminStatus() })
      }
      case 'number_delete': {
        await needAdmin()
        const n = await one<{ id: string; el_phone_id: string | null; phone_number: string }>(`rc_numbers?id=eq.${b.number_id}&select=id,el_phone_id,phone_number`)
        if (!n) return fail('not_found', 404)
        if (n.el_phone_id && b.remote) await el(`/v1/convai/phone-numbers/${n.el_phone_id}`, { method: 'DELETE' }).catch(() => {})
        await db(`/rest/v1/rc_numbers?id=eq.${n.id}`, { method: 'DELETE' })
        await audit(await userId(auth), 'number_delete', 'number', n.phone_number, { remote: !!b.remote })
        return json({ ok: true, status: await adminStatus() })
      }

      // ---------- admin: voices offered to clients
      case 'voices_library': {
        await needAdmin()
        const q = new URLSearchParams({ page_size: '60', language: String(b.language || 'pl'), sort: 'trending' })
        if (b.search) q.set('search', String(b.search))
        if (b.gender) q.set('gender', String(b.gender))
        const [lib, mine] = await Promise.all([
          el<{ voices: any[] }>(`/v1/shared-voices?${q}`).catch(() => ({ voices: [] })),
          el<{ voices: any[] }>('/v1/voices').catch(() => ({ voices: [] })),
        ])
        const fromLib = lib.voices.map(v => ({ voice_id: v.voice_id, public_owner_id: v.public_owner_id, name: v.name, gender: v.gender, accent: v.accent, description: v.description || v.descriptive, preview_url: v.preview_url, source: 'library', use_case: v.use_case }))
        const own = mine.voices.map(v => ({ voice_id: v.voice_id, public_owner_id: null, name: v.name, gender: v.labels?.gender ?? null, accent: v.labels?.accent ?? null, description: v.description ?? v.labels?.description ?? null, preview_url: v.preview_url, source: v.category ?? 'account', use_case: v.labels?.use_case ?? null }))
        return json({ voices: [...fromLib, ...own] })
      }
      case 'voice_add': {
        await needAdmin()
        const v = b.voice ?? {}
        if (!v.voice_id || !v.name) return fail('bad_request')
        if (v.public_owner_id) await elJson(`/v1/voices/add/${v.public_owner_id}/${v.voice_id}`, 'POST', { new_name: String(v.name) }).catch(e => { if (!/already/i.test(elMessage(e))) throw e })
        await db('/rest/v1/rc_voices?on_conflict=voice_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ voice_id: v.voice_id, name: String(v.name).slice(0, 60), gender: v.gender ?? null, accent: v.accent ?? null, description: v.description ? String(v.description).slice(0, 300) : null, preview_url: v.preview_url ?? null, public_owner_id: v.public_owner_id ?? null, enabled: true }) })
        return json({ ok: true, status: await adminStatus() })
      }
    }
    return fail('unknown_action')
  } catch (e) {
    if (e instanceof HttpError) return fail(e.message, e.status)
    if (e instanceof ElError) return fail(elMessage(e), 502)
    console.error('reception', e)
    return fail(e instanceof Error ? e.message : 'error', 500)
  }
})

export { FN_URL, TOOL_DEFS, hookToken }
