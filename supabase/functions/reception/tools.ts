// Webhook tools the ElevenLabs agent calls during a conversation. They answer in short Polish JSON the LLM
// can read out loud. Every tool body carries agent_id + conversation_id (system dynamic variables) and
// caller_phone (our dynamic variable, from the call-start webhook or the panel's test console).
import { db, insertRow, normPhone, one, patch, prettyPhone, rows } from './shared.ts'
import { findSlots, loadCatalog, matchByName, minutesText, performers, pickResource, priceText, speakable, type Catalog, type Service } from './availability.ts'
import { addDays, hhmm, isDate, localDate, localTime, spoken, toMin, zoned } from './time.ts'
import { clientByPhone, ensureCall, loyaltyFor } from './memory.ts'

export interface ToolCtx { cid: string; agentId: string; conversationId: string | null; callerPhone: string | null; channel: 'phone' | 'test' }
type Args = Record<string, any>
type Out = Record<string, unknown>

// ---------------------------------------------------------------- definitions (shared by all agents)
const str = (description: string) => ({ type: 'string', description })
const int = (description: string) => ({ type: 'integer', description })
const SYS = {
  agent_id: { type: 'string', dynamic_variable: 'system__agent_id' },
  conversation_id: { type: 'string', dynamic_variable: 'system__conversation_id' },
  caller_phone: { type: 'string', dynamic_variable: 'caller_phone' },
  channel: { type: 'string', dynamic_variable: 'channel' },
}
function def(name: string, description: string, props: Record<string, unknown>, required: string[], extra: Record<string, unknown> = {}) {
  return { name, description, props, required, extra }
}
export const TOOL_DEFS = [
  def('check_availability', 'Sprawdza wolne terminy w kalendarzu firmy dla usługi. Używaj ZAWSZE przed podaniem klientowi jakiejkolwiek godziny. Jeśli w wybranym dniu nie ma miejsc, narzędzie samo podaje najbliższe dni z wolnymi terminami.', {
    service: str('Nazwa usługi dokładnie tak, jak w ofercie (np. "Strzyżenie męskie", "Rezerwacja stolika").'),
    date: str('Dzień w formacie YYYY-MM-DD. Przelicz "jutro", "w piątek" itp. na datę na podstawie dzisiejszej daty.'),
    time: str('Preferowana godzina HH:MM, jeśli klient ją podał. Opcjonalnie.'),
    staff: str('Imię pracownika lub nazwa zasobu (stolik, sala), jeśli klient ma preferencję. Opcjonalnie.'),
    party_size: int('Liczba osób (stolik, catering, zajęcia grupowe). Opcjonalnie, domyślnie 1.'),
  }, ['service', 'date'], { pre_tool_speech: 'force' }),
  def('book_appointment', 'Tworzy rezerwację w kalendarzu. Wywołuj dopiero, gdy klient potwierdził usługę, dzień, godzinę i podał imię. Numer telefonu dzwoniącego jest znany automatycznie — pytaj o numer tylko, jeśli jest nieznany albo klient chce podać inny.', {
    service: str('Nazwa usługi.'),
    date: str('Dzień YYYY-MM-DD.'),
    time: str('Godzina rozpoczęcia HH:MM — jedna z wolnych godzin zwróconych przez check_availability.'),
    staff: str('Pracownik/zasób, jeśli klient wybrał. Opcjonalnie — inaczej dobierzemy automatycznie.'),
    customer_name: str('Imię (i nazwisko, jeśli podane) klienta.'),
    customer_phone: str('Numer telefonu klienta, tylko jeśli inny niż numer, z którego dzwoni, albo gdy numer dzwoniącego jest nieznany.'),
    party_size: int('Liczba osób, jeśli dotyczy.'),
    notes: str('Ważne uwagi klienta do rezerwacji (np. alergia, okazja, prośba). Opcjonalnie.'),
  }, ['service', 'date', 'time', 'customer_name'], { pre_tool_speech: 'force', interruption_mode: 'disable_during_tool' }),
  def('find_bookings', 'Wyszukuje nadchodzące rezerwacje klienta (po numerze dzwoniącego albo podanym numerze). Użyj, gdy klient chce odwołać, przełożyć albo sprawdzić swoją wizytę.', {
    customer_phone: str('Numer telefonu, jeśli klient podał inny niż ten, z którego dzwoni. Opcjonalnie.'),
  }, []),
  def('cancel_booking', 'Odwołuje rezerwację klienta. Najpierw znajdź ją przez find_bookings i upewnij się, że klient potwierdził, którą wizytę odwołać.', {
    booking_id: str('Identyfikator rezerwacji z find_bookings (nie czytaj go klientowi).'),
    reason: str('Krótki powód, jeśli klient go podał. Opcjonalnie.'),
  }, ['booking_id'], { interruption_mode: 'disable_during_tool' }),
  def('reschedule_booking', 'Przekłada istniejącą rezerwację na nowy termin. Najpierw sprawdź wolne terminy przez check_availability.', {
    booking_id: str('Identyfikator rezerwacji z find_bookings.'),
    date: str('Nowy dzień YYYY-MM-DD.'),
    time: str('Nowa godzina HH:MM.'),
    staff: str('Pracownik/zasób, jeśli klient chce zmienić. Opcjonalnie.'),
  }, ['booking_id', 'date', 'time'], { pre_tool_speech: 'force', interruption_mode: 'disable_during_tool' }),
  def('save_client', 'Zapisuje w bazie klientów imię dzwoniącego i ważne informacje na przyszłość (preferencje, np. "woli Kasię", "alergia na orzechy", "przychodzi z psem"). Wywołaj, gdy tylko poznasz imię nowego klienta albo usłyszysz coś wartego zapamiętania.', {
    name: str('Imię (i nazwisko) klienta. Opcjonalnie.'),
    note: str('Krótka informacja do zapamiętania. Opcjonalnie.'),
    email: str('Adres e-mail, jeśli klient go podał. Opcjonalnie.'),
  }, []),
  def('leave_message', 'Zostawia wiadomość dla zespołu z prośbą o oddzwonienie — gdy nie potrafisz pomóc, klient prosi o kontakt z człowiekiem albo sprawa wymaga decyzji właściciela.', {
    message: str('O co chodzi — konkretnie, w 1–3 zdaniach.'),
    name: str('Imię klienta, jeśli znane.'),
    callback_phone: str('Numer do oddzwonienia, jeśli inny niż numer dzwoniącego.'),
    urgent: { type: 'boolean', description: 'Czy sprawa jest pilna.' },
  }, ['message']),
] as const

/** ElevenLabs tool_config for one definition (URL carries the shared hook token). */
export function toolConfig(d: typeof TOOL_DEFS[number], url: string) {
  return {
    type: 'webhook', name: d.name, description: d.description, response_timeout_secs: 20,
    ...d.extra,
    api_schema: {
      url, method: 'POST',
      request_body_schema: { type: 'object', description: d.description, properties: { ...SYS, ...d.props }, required: ['agent_id', 'conversation_id', 'caller_phone', 'channel', ...d.required] },
    },
  }
}

// ---------------------------------------------------------------- helpers
function service(cat: Catalog, q: unknown): Service | null {
  return matchByName(cat.services.filter(s => s.active && s.ai_bookable), q)
}
const offer = (cat: Catalog) => cat.services.filter(s => s.active && s.ai_bookable).map(s => `${s.name} (${minutesText(s.duration_min)}${priceText(s) ? `, ${priceText(s)}` : ''})`)
function svcLabel(s: Service) { return `${s.name} — ${minutesText(s.duration_min)}${priceText(s) ? `, ${priceText(s)}` : ''}` }
const today = (cat: Catalog) => localDate(new Date(), cat.settings.timezone)

async function bookingsFor(cid: string, phone: string | null, clientId: string | null) {
  if (!phone && !clientId) return []
  const now = new Date(Date.now() - 3600000).toISOString()
  const or = [clientId ? `client_id.eq.${clientId}` : null, phone ? `customer_phone.eq.${phone}` : null].filter(Boolean).join(',')
  return rows<{ id: string; starts_at: string; ends_at: string; service_name: string | null; status: string; party_size: number; customer_name: string | null; service_id: string | null; resource: { id: string; name: string } | null }>(
    `rc_bookings?company_id=eq.${cid}&or=(${or})&status=in.(pending,confirmed)&starts_at=gte.${now}&select=id,starts_at,ends_at,service_name,status,party_size,customer_name,service_id,resource:rc_resources(id,name)&order=starts_at.asc&limit=10`)
}

// ---------------------------------------------------------------- handlers
export async function runTool(name: string, a: Args, ctx: ToolCtx): Promise<Out> {
  const cat = await loadCatalog(ctx.cid)
  const tz = cat.settings.timezone
  const caller = normPhone(ctx.callerPhone)

  switch (name) {
    case 'check_availability': {
      const svc = service(cat, a.service)
      if (!svc) return { ok: false, error: 'Nie znaleziono takiej usługi.', oferta: offer(cat) }
      const date = isDate(a.date) ? a.date : today(cat)
      if (date < today(cat)) return { ok: false, error: `Ta data już minęła. Dziś jest ${spoken(today(cat))} (${today(cat)}).` }
      const party = Number(a.party_size) > 0 ? Number(a.party_size) : svc.party_min
      if (party > svc.party_max || party < svc.party_min) return { ok: false, error: `Ta usługa jest dla ${svc.party_min}–${svc.party_max} osób.` }
      const who = a.staff ? matchByName(performers(cat, svc, true), a.staff) : null
      if (a.staff && !who) return { ok: false, error: `Nie znaleziono „${a.staff}” wśród osób wykonujących tę usługę.`, kto_wykonuje: performers(cat, svc, true).map(r => r.name) }
      const wish = toMin(a.time)
      const first = await findSlots(cat, svc, { from: date, days: 1, party, resourceIds: who ? [who.id] : undefined, forAi: true })
      const day = first[0]
      const who3 = (d: typeof day, m: number) => { const x = d.slots.find(v => v.min === m); return who || svc.party_max > 1 || !x ? '' : ` (${[...new Set(x.resources.map(r => r.name))].join(' lub ')})` }
      const pick = (d: typeof day) => humanPick(d.slots.map(s => s.min), wish).map(m => `${hhmm(m)}${who3(d, m)}`)
      const range = (d: typeof day) => {
        // "wolne 9:00–12:00 i 14:00–17:15" — lets her answer "a później?" without reading a list
        const mins = d.slots.map(x => x.min), parts: string[] = []
        let a0 = mins[0], prev = mins[0]
        for (const m of [...mins.slice(1), Infinity]) { if (m - prev > (cat.settings.slot_step_min || 15)) { parts.push(a0 === prev ? hhmm(a0) : `${hhmm(a0)}–${hhmm(prev)}`); a0 = m } prev = m }
        return parts.slice(0, 4).join(', ')
      }
      const out: Out = { ok: true, usluga: svcLabel(svc), dzien: `${spoken(date)} (${date})`, osob: svc.party_max > 1 ? party : undefined, pracownik: who?.name }
      if (day.slots.length) {
        out.propozycje = pick(day)
        out.wolne_przedzialy = range(day)
        out.wskazowka = 'Zaproponuj klientowi 2–3 godziny z „propozycje”. Nie czytaj przedziałów, chyba że klient pyta o inną porę.'
        if (wish != null) {
          const exact = day.slots.find(s => s.min === wish)
          out.prosba = exact ? `Godzina ${hhmm(wish)} jest wolna${who3(day, wish)}.` : `Godzina ${hhmm(wish)} jest zajęta — najbliższe wolne: ${[...day.slots].sort((x, y) => Math.abs(x.min - wish) - Math.abs(y.min - wish)).slice(0, 3).map(s => hhmm(s.min)).sort().join(', ')}.`
        }
      } else {
        out.propozycje = []
        out.powod = day.reason
        const next = await findSlots(cat, svc, { from: addDays(date, 1), days: 14, party, resourceIds: who ? [who.id] : undefined, forAi: true })
        out.najblizsze_dni = next.filter(d => d.slots.length).slice(0, 2).map(d => ({ dzien: `${spoken(d.date)} (${d.date})`, propozycje: pick(d) }))
      }
      return out
    }

    case 'book_appointment': {
      const svc = service(cat, a.service)
      if (!svc) return { ok: false, error: 'Nie znaleziono takiej usługi.', oferta: offer(cat) }
      if (!isDate(a.date)) return { ok: false, error: 'Podaj datę w formacie YYYY-MM-DD.' }
      const min = toMin(a.time)
      if (min == null) return { ok: false, error: 'Podaj godzinę w formacie HH:MM.' }
      const name = String(a.customer_name ?? '').trim()
      if (name.length < 2) return { ok: false, error: 'Zapytaj klienta o imię.' }
      const phone = normPhone(a.customer_phone) ?? caller
      if (!phone) return { ok: false, error: 'Numer telefonu klienta jest nieznany — poproś o numer i powtórz go klientowi do potwierdzenia.' }
      const party = Number(a.party_size) > 0 ? Number(a.party_size) : svc.party_min
      const who = a.staff ? matchByName(performers(cat, svc, true), a.staff) : null
      const [day] = await findSlots(cat, svc, { from: a.date, days: 1, party, resourceIds: who ? [who.id] : undefined, forAi: true })
      const slot = day.slots.find(s => s.min === min)
      if (!slot) return { ok: false, error: `Termin ${hhmm(min)} ${spoken(a.date)} nie jest już wolny.`, wolne_godziny: speakable(day.slots.map(s => s.min), min, 6).map(hhmm) }
      const loyaltyP = cat.settings.offer_loyalty ? loyaltyFor(ctx.cid, phone) : Promise.resolve({ program: null, card: null })
      const [res, client, callId] = await Promise.all([
        pickResource(cat, svc, slot.resources, a.date, party),
        clientByPhone(ctx.cid, phone, { source: ctx.channel === 'test' ? 'ai_test' : 'phone', name }),
        ensureCall(ctx.cid, ctx.conversationId, ctx.agentId, { outcome: 'booked', channel: ctx.channel, customer_name: name }),
      ])
      void Promise.all([
        client && !client.name ? patch('rc_clients', `id=eq.${client.id}`, { name }) : null,
        client && callId ? patch('rc_calls', `id=eq.${callId}`, { client_id: client.id }) : null,
      ])
      const starts = slot.start, ends = new Date(starts.getTime() + svc.duration_min * 60000), block = new Date(ends.getTime() + svc.buffer_min * 60000)
      const r = await insertRow<{ id: string }>('rc_bookings', {
        company_id: ctx.cid, service_id: svc.id, resource_id: res.id, client_id: client?.id ?? null, call_id: callId, service_name: svc.name,
        starts_at: starts.toISOString(), ends_at: ends.toISOString(), block_until: block.toISOString(), party_size: party,
        status: cat.settings.ai_booking_status, source: ctx.channel === 'test' ? 'ai_test' : 'phone', customer_name: name, customer_phone: phone,
        notes: a.notes ? String(a.notes).slice(0, 1000) : null, price: svc.price_from, created_by: null,
      })
      if (!r.ok) {
        if (r.error?.code === '23P01') return { ok: false, error: 'Ktoś właśnie zajął ten termin. Sprawdź dostępność jeszcze raz i zaproponuj inny.' }
        return { ok: false, error: 'Nie udało się zapisać rezerwacji — przeproś i zaproponuj, że zespół oddzwoni (leave_message).' }
      }
      const out: Out = {
        ok: true, status: cat.settings.ai_booking_status === 'pending' ? 'wstępna — zespół potwierdzi' : 'potwierdzona',
        podsumowanie: `${svc.name}, ${spoken(a.date)}, godz. ${hhmm(min)}${svc.party_max > 1 ? `, ${party} os.` : ''}${res.kind === 'staff' ? `, u: ${res.name}` : res.kind === 'table' ? '' : `, ${res.name}`}`,
        czas_trwania: minutesText(svc.duration_min), telefon: prettyPhone(phone), booking_id: r.row?.id,
      }
      if (cat.settings.offer_loyalty) {
        const { program, card } = await loyaltyP
        const who = res.kind === 'staff' ? res.name : 'obsłudze'
        if (program && card) out.karta_lojalnosciowa = `Klient ma już kartę „${program.name}”: ${card.stamps % program.stamps_required}/${program.stamps_required} pieczątek${card.stamps >= program.stamps_required ? ' i nagrodę do odebrania' : ''}. Przypomnij krótko, żeby pokazał ją ${who} przy wizycie — dostanie pieczątkę.`
        else if (program) out.karta_lojalnosciowa = `Nie widzisz u siebie karty stałego klienta na ten numer. Powiedz to naturalnie (np. „nie widzę u siebie Pana karty stałego klienta”) i przypomnij, żeby przy wizycie powiedział ${who}, że chce kartę — za ${program.stamps_required} pieczątek jest ${program.reward}. NIE mów, że założyłaś kartę.`
      }
      return out
    }

    case 'find_bookings': {
      const phone = normPhone(a.customer_phone) ?? caller
      const client = phone ? await clientByPhone(ctx.cid, phone, null) : null
      const list = await bookingsFor(ctx.cid, phone, client?.id ?? null)
      if (!phone) return { ok: false, error: 'Numer dzwoniącego jest nieznany — zapytaj o numer telefonu użyty przy rezerwacji.' }
      if (!list.length) return { ok: true, rezerwacje: [], info: `Brak nadchodzących rezerwacji na numer ${prettyPhone(phone)}.` }
      return { ok: true, rezerwacje: list.map(b => ({ booking_id: b.id, kiedy: `${spoken(localDate(new Date(b.starts_at), tz))}, ${localTime(new Date(b.starts_at), tz)}`, usluga: b.service_name, u: b.resource?.name, osob: b.party_size > 1 ? b.party_size : undefined, status: b.status === 'pending' ? 'wstępna' : 'potwierdzona' })) }
    }

    case 'cancel_booking': {
      const b = await one<{ id: string; starts_at: string; status: string; client_id: string | null; customer_phone: string | null; service_name: string | null }>(`rc_bookings?id=eq.${uuid(a.booking_id)}&company_id=eq.${ctx.cid}&select=id,starts_at,status,client_id,customer_phone,service_name`)
      if (!b || !['pending', 'confirmed'].includes(b.status)) return { ok: false, error: 'Nie znaleziono aktywnej rezerwacji o tym identyfikatorze.' }
      if (!cat.settings.allow_cancel) return { ok: false, error: 'Odwołania przez telefon z asystentem są wyłączone — użyj leave_message, zespół oddzwoni.' }
      if (Date.parse(b.starts_at) - Date.now() < cat.settings.cancel_notice_min * 60000) return { ok: false, error: `Na odwołanie jest już za późno (wymagane ${minutesText(cat.settings.cancel_notice_min)} wcześniej). Zostaw wiadomość dla zespołu (leave_message).` }
      if (caller && b.customer_phone && b.customer_phone !== caller && ctx.channel === 'phone') return { ok: false, error: 'Ta rezerwacja jest na inny numer telefonu — ze względów bezpieczeństwa odwołanie tylko z numeru rezerwacji albo przez zespół (leave_message).' }
      const callId = await ensureCall(ctx.cid, ctx.conversationId, ctx.agentId, { outcome: 'cancelled', channel: ctx.channel })
      await patch('rc_bookings', `id=eq.${b.id}`, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: `Telefon (AI)${a.reason ? `: ${String(a.reason).slice(0, 300)}` : ''}`, call_id: callId })
      return { ok: true, info: `Odwołano: ${b.service_name ?? 'wizyta'}, ${spoken(localDate(new Date(b.starts_at), tz))} ${localTime(new Date(b.starts_at), tz)}.` }
    }

    case 'reschedule_booking': {
      const b = await one<{ id: string; starts_at: string; status: string; service_id: string | null; resource_id: string | null; party_size: number; customer_phone: string | null }>(`rc_bookings?id=eq.${uuid(a.booking_id)}&company_id=eq.${ctx.cid}&select=id,starts_at,status,service_id,resource_id,party_size,customer_phone`)
      if (!b || !['pending', 'confirmed'].includes(b.status)) return { ok: false, error: 'Nie znaleziono aktywnej rezerwacji.' }
      if (!cat.settings.allow_reschedule) return { ok: false, error: 'Przekładanie wizyt przez asystenta jest wyłączone — użyj leave_message.' }
      if (caller && b.customer_phone && b.customer_phone !== caller && ctx.channel === 'phone') return { ok: false, error: 'Ta rezerwacja jest na inny numer telefonu — przełożenie tylko przez zespół (leave_message).' }
      const svc = cat.services.find(s => s.id === b.service_id)
      if (!svc) return { ok: false, error: 'Tej usługi nie ma już w ofercie — zostaw wiadomość dla zespołu.' }
      if (!isDate(a.date) || toMin(a.time) == null) return { ok: false, error: 'Podaj nowy dzień (YYYY-MM-DD) i godzinę (HH:MM).' }
      const min = toMin(a.time)!
      const who = a.staff ? matchByName(performers(cat, svc, true), a.staff) : null
      const [day] = await findSlots(cat, svc, { from: a.date, days: 1, party: b.party_size, resourceIds: who ? [who.id] : undefined, forAi: true, excludeBooking: b.id })
      const slot = day.slots.find(s => s.min === min)
      if (!slot) return { ok: false, error: `Termin ${hhmm(min)} nie jest wolny.`, wolne_godziny: speakable(day.slots.map(s => s.min), min, 6).map(hhmm) }
      const keep = slot.resources.find(r => r.id === b.resource_id)
      const res = keep ?? await pickResource(cat, svc, slot.resources, a.date, b.party_size)
      const ends = new Date(slot.start.getTime() + svc.duration_min * 60000)
      const callId = await ensureCall(ctx.cid, ctx.conversationId, ctx.agentId, { outcome: 'rescheduled', channel: ctx.channel })
      const r = await patch('rc_bookings', `id=eq.${b.id}`, { starts_at: slot.start.toISOString(), ends_at: ends.toISOString(), block_until: new Date(ends.getTime() + svc.buffer_min * 60000).toISOString(), resource_id: res.id, call_id: callId })
      if (!r.ok) return { ok: false, error: 'Ten termin właśnie się zajął — sprawdź dostępność ponownie.' }
      return { ok: true, info: `Przełożono na ${spoken(a.date)}, godz. ${hhmm(min)}${res.kind === 'staff' ? `, u: ${res.name}` : ''}.` }
    }

    case 'save_client': {
      if (!caller) return { ok: true, info: 'Numer dzwoniącego jest nieznany — dane zapiszemy razem z rezerwacją.' }
      const client = await clientByPhone(ctx.cid, caller, { source: ctx.channel === 'test' ? 'ai_test' : 'phone', name: a.name })
      if (!client) return { ok: false }
      const upd: Record<string, unknown> = {}
      if (a.name && String(a.name).trim().length >= 2) upd.name = String(a.name).trim().slice(0, 120)
      if (a.email && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(a.email))) upd.email = String(a.email).trim().toLowerCase()
      if (a.note) {
        const stamp = localDate(new Date(), tz)
        upd.notes = [client.notes, `${stamp}: ${String(a.note).trim().slice(0, 300)}`].filter(Boolean).join('\n').slice(-3000)
      }
      if (Object.keys(upd).length) await patch('rc_clients', `id=eq.${client.id}`, upd)
      await ensureCall(ctx.cid, ctx.conversationId, ctx.agentId, { client_id: client.id, channel: ctx.channel, ...(upd.name ? { customer_name: upd.name } : {}) })
      return { ok: true, info: 'Zapisano.' }
    }

    case 'leave_message': {
      const phone = normPhone(a.callback_phone) ?? caller
      const client = phone ? await clientByPhone(ctx.cid, phone, { source: ctx.channel === 'test' ? 'ai_test' : 'phone', name: a.name }) : null
      const note = `${a.urgent ? 'PILNE: ' : ''}${String(a.message ?? '').slice(0, 800)}${a.name ? ` — ${a.name}` : ''}${phone ? ` (tel. ${prettyPhone(phone)})` : ''}`
      const id = await ensureCall(ctx.cid, ctx.conversationId, ctx.agentId, { needs_callback: true, callback_note: note, outcome: 'callback', client_id: client?.id ?? null, channel: ctx.channel, caller_phone: phone })
      if (!id) await db('/rest/v1/rc_calls', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: ctx.cid, needs_callback: true, callback_note: note, outcome: 'callback', channel: ctx.channel, caller_phone: phone, status: 'done' }) })
      return { ok: true, info: 'Wiadomość przekazana zespołowi — ktoś oddzwoni.' + (phone ? '' : ' Uwaga: nie mamy numeru telefonu — poproś o niego.') }
    }
  }
  return { ok: false, error: 'unknown_tool' }
}

/** Three times a receptionist would offer: the wish (or nearest) + spread alternatives ≥ 45 min apart,
 *  or without a wish — morning / midday / afternoon. */
function humanPick(times: number[], wish: number | null, n = 3): number[] {
  if (times.length <= n) return times
  const out: number[] = []
  const far = (m: number) => out.every(x => Math.abs(x - m) >= 45)
  const order = wish != null
    ? [...times].sort((a, b) => Math.abs(a - wish) - Math.abs(b - wish))
    : [0, .5, .85].map(f => times[Math.min(times.length - 1, Math.round(f * (times.length - 1)))]).concat(times)
  for (const m of order) { if (out.length >= n) break; if (!out.includes(m) && far(m)) out.push(m) }
  for (const m of order) { if (out.length >= n) break; if (!out.includes(m)) out.push(m) }
  return out.sort((a, b) => a - b)
}

function uuid(v: unknown): string {
  const s = String(v ?? '').trim()
  return /^[0-9a-f-]{36}$/i.test(s) ? s : '00000000-0000-0000-0000-000000000000'
}
export { zoned }
