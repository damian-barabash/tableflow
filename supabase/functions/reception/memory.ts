// Client memory: who is calling (by phone), their visits, upcoming bookings, notes and loyalty card.
// Used when a call starts (dynamic variables for the agent) and by the tools.
import { db, insertRow, normPhone, one, rows } from './shared.ts'
import { localDate, localTime, spoken } from './time.ts'

export interface Client { id: string; company_id: string; name: string | null; phone: string | null; email: string | null; notes: string | null; tags: string[]; source: string }

/** Find or create the CRM record for a phone number (new callers are saved immediately). */
export async function clientByPhone(cid: string, phone: string | null, create: { source: string; name?: string | null } | null): Promise<Client | null> {
  const p = normPhone(phone)
  if (!p) return null
  const found = await one<Client>(`rc_clients?company_id=eq.${cid}&phone=eq.${p}&select=*`)
  if (found || !create) return found
  const r = await insertRow<Client>('rc_clients', { company_id: cid, phone: p, name: create.name?.trim() || null, source: create.source })
  if (r.ok) return r.row
  return one<Client>(`rc_clients?company_id=eq.${cid}&phone=eq.${p}&select=*`)   // created in parallel
}

export async function loyaltyFor(cid: string, phone: string | null) {
  const p = normPhone(phone)
  const programs = await rows<{ id: string; name: string; reward: string; stamps_required: number; status: string; published_at: string | null }>(`loyalty_programs?company_id=eq.${cid}&status=eq.active&published_at=not.is.null&select=id,name,reward,stamps_required,status,published_at&order=published_at.desc`)
  const program = programs[0] ?? null
  const card = p && program ? await one<{ stamps: number; code: string; rewards_redeemed: number }>(`loyalty_cards?company_id=eq.${cid}&phone=eq.${p}&status=eq.active&select=stamps,code,rewards_redeemed&order=created_at.desc`) : null
  return { program, card }
}

/** Short Polish description of the client for the agent's prompt. */
export async function clientContext(cid: string, tz: string, client: Client | null, offerLoyalty: boolean): Promise<string> {
  const lines: string[] = []
  if (!client) {
    lines.push('Numer dzwoniącego jest nieznany (np. zastrzeżony). Jeśli klient chce się umówić, poproś o imię i numer telefonu.')
  } else {
    const now = new Date().toISOString()
    const [past, next, calls] = await Promise.all([
      rows<{ starts_at: string; service_name: string | null; status: string; resource: { name: string } | null }>(`rc_bookings?client_id=eq.${client.id}&starts_at=lt.${now}&status=in.(confirmed,completed,no_show)&select=starts_at,service_name,status,resource:rc_resources(name)&order=starts_at.desc&limit=5`),
      rows<{ id: string; starts_at: string; service_name: string | null; status: string; resource: { name: string } | null }>(`rc_bookings?client_id=eq.${client.id}&starts_at=gte.${now}&status=in.(pending,confirmed)&select=id,starts_at,service_name,status,resource:rc_resources(name)&order=starts_at.asc&limit=3`),
      rows<{ started_at: string; summary: string | null }>(`rc_calls?client_id=eq.${client.id}&status=eq.done&select=started_at,summary&order=started_at.desc&limit=2`),
    ])
    if (!client.name && !past.length && !next.length && !client.notes) lines.push('To prawdopodobnie nowy klient — dzwoni pierwszy raz. Zapytaj naturalnie o imię i zapisz je narzędziem save_client.')
    else lines.push(`Stały/znany klient${client.name ? `: ${client.name}` : ' (imię nieznane — zapytaj i zapisz)'}.`)
    if (past.length) {
      const done = past.filter(b => b.status !== 'no_show')
      lines.push(`Wizyty w historii: ${done.length}${past.length === 5 ? '+' : ''}. Ostatnie: ${done.slice(0, 3).map(b => `${spoken(localDate(new Date(b.starts_at), tz))} — ${b.service_name ?? 'wizyta'}${b.resource ? ` (u: ${b.resource.name})` : ''}`).join('; ')}.`)
      const last = done.find(b => b.resource?.name)?.resource?.name
      const fav = mostCommon(done.map(b => b.resource?.name).filter(Boolean) as string[])
      if (last) lines.push(`Ostatnią wizytę miał(a) u osoby: ${last}${fav && fav !== last && done.length >= 3 ? ` (a najczęściej u: ${fav})` : ''}. Gdy umawia podobną usługę, zapytaj naturalnie, czy znowu do tej osoby (np. „Do ${last}, jak ostatnio?” — odmień imię poprawnie), czy tym razem do kogoś innego.`)
      const noShows = past.filter(b => b.status === 'no_show').length
      if (noShows) lines.push(`Uwaga: ${noShows} nieobecność(ci) bez odwołania.`)
    }
    if (next.length) lines.push(`Ma już zaplanowane: ${next.map(b => `${spoken(localDate(new Date(b.starts_at), tz))} o ${localTime(new Date(b.starts_at), tz)} — ${b.service_name ?? 'wizyta'}${b.resource ? ` u ${b.resource.name}` : ''} [id: ${b.id}]`).join('; ')}.`)
    if (client.notes) lines.push(`Notatki o kliencie: ${client.notes.slice(0, 500)}`)
    if (calls[0]?.summary) lines.push(`Poprzednia rozmowa (${spoken(localDate(new Date(calls[0].started_at), tz))}): ${calls[0].summary.replace(/wirtualn\S*\s*/gi, '').slice(0, 220)}`)
  }
  if (offerLoyalty) {
    const { program, card } = await loyaltyFor(cid, client?.phone ?? null)
    if (program && card) lines.push(`Ma kartę lojalnościową „${program.name}”: ${card.stamps % program.stamps_required}/${program.stamps_required} pieczątek (nagroda: ${program.reward}).${card.stamps >= program.stamps_required ? ' Ma nagrodę do odebrania — możesz o tym wspomnieć!' : ''}`)
    else if (program) lines.push(`Nie ma jeszcze karty lojalnościowej „${program.name}” (${program.stamps_required} pieczątek = ${program.reward}).`)
  }
  return lines.join('\n')
}

function mostCommon(list: string[]): string | null {
  const m = new Map<string, number>()
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** Ensure an rc_calls row exists for a live conversation (tools link bookings/clients to it). */
export async function ensureCall(cid: string, conversationId: string | null, agentId: string | null, fields: Record<string, unknown> = {}): Promise<string | null> {
  if (!conversationId) return null
  const r = await db('/rest/v1/rc_calls?on_conflict=conversation_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ company_id: cid, conversation_id: conversationId, agent_id: agentId, ...fields }) })
  return r.ok ? r.body?.[0]?.id ?? null : null
}
