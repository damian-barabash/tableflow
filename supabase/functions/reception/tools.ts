// Webhook tools the ElevenLabs agent calls during a conversation. They answer in short Polish JSON the LLM
// can read out loud. Every tool body carries agent_id + conversation_id (system dynamic variables) and
// caller_phone (our dynamic variable, from the call-start webhook or the panel's test console).
import { db, insertRow, normPhone, one, patch, prettyPhone, rows } from './shared.ts'
import { findSlots, loadCatalog, matchByName, minutesText, performers, pickResource, priceText, speakable, type Catalog, type DaySlots, type Resource, type Service } from './availability.ts'
import { addDays, hhmm, isDate, localDate, parts, sayTime, spoken, toMin, zoned } from './time.ts'
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
    date: str('Dzień w formacie YYYY-MM-DD. Datę dla "jutro", "w piątek", "w przyszły wtorek" odczytaj z kalendarza w instrukcji — nie licz jej samodzielnie.'),
    time: str('Preferowana godzina HH:MM, jeśli klient ją podał. Opcjonalnie.'),
    second_service: str('Druga usługa dla DRUGIEJ osoby, która przychodzi razem z klientem (np. "Strzyżenie dziecięce" dla syna). Wtedy wynik zawiera tylko godziny pasujące obu osobom. Opcjonalnie.'),
    staff: str('Imię pracownika lub nazwa zasobu (stolik, sala), jeśli klient ma preferencję. Opcjonalnie.'),
    party_size: int('Liczba osób (stolik, catering, zajęcia grupowe). Opcjonalnie, domyślnie 1.'),
  }, ['service', 'date'], { pre_tool_speech: 'auto' }),
  def('book_appointment', 'Tworzy rezerwację w kalendarzu. Wywołuj dopiero, gdy klient potwierdził usługę, dzień i godzinę, podał imię i (jeśli numer dzwoniącego jest nieznany) numer telefonu. Numer telefonu dzwoniącego jest znany automatycznie — pytaj o numer tylko, jeśli jest nieznany albo klient chce podać inny.', {
    service: str('Nazwa usługi.'),
    date: str('Dzień YYYY-MM-DD.'),
    time: str('Godzina rozpoczęcia HH:MM — jedna z wolnych godzin zwróconych przez check_availability.'),
    staff: str('Pracownik/zasób, jeśli klient wybrał. Opcjonalnie — inaczej dobierzemy automatycznie.'),
    second_service: str('Druga usługa dla drugiej osoby przychodzącej razem — tak samo jak w check_availability. Zapisuje obie wizyty naraz. Opcjonalnie.'),
    second_name: str('Imię drugiej osoby (np. dziecka), jeśli padło. Opcjonalnie.'),
    customer_name: str('Imię (i nazwisko, jeśli podane) klienta.'),
    customer_phone: str('Numer telefonu klienta, tylko jeśli inny niż numer, z którego dzwoni, albo gdy numer dzwoniącego jest nieznany.'),
    party_size: int('Liczba osób, jeśli dotyczy.'),
    notes: str('Ważne uwagi klienta do rezerwacji (np. alergia, okazja, prośba). Opcjonalnie.'),
  }, ['service', 'date', 'time', 'customer_name'], { pre_tool_speech: 'auto', interruption_mode: 'disable_during_tool' }),
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
  }, ['booking_id', 'date', 'time'], { pre_tool_speech: 'auto', interruption_mode: 'disable_during_tool' }),
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
const step = (cat: Catalog) => cat.settings.slot_step_min || 15

/** Times when two services for two people coming together fit: side by side with two different people,
 *  otherwise the second one right after the first. */
function pairSlots(a: DaySlots, b: DaySlots, first: Service, stepMin: number) {
  const out: { min: number; minB: number; ra: Resource[]; rb: Resource[] }[] = []
  const after = Math.ceil((first.duration_min + first.buffer_min) / stepMin) * stepMin
  for (const s of a.slots) {
    const same = b.slots.find(x => x.min === s.min)
    if (same && s.resources.some(r => same.resources.some(q => q.id !== r.id))) { out.push({ min: s.min, minB: s.min, ra: s.resources, rb: same.resources }); continue }
    const next = b.slots.find(x => x.min === s.min + after)
    if (next) out.push({ min: s.min, minB: next.min, ra: s.resources, rb: next.resources })
  }
  return out
}

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
      const svc2 = a.second_service ? service(cat, a.second_service) : null
      if (a.second_service && !svc2) return { ok: false, error: `Nie znaleziono usługi „${a.second_service}”.`, oferta: offer(cat) }
      const date = isDate(a.date) ? a.date : today(cat)
      if (date < today(cat)) return { ok: false, error: `Ta data już minęła. Dziś jest ${spoken(today(cat))} (${today(cat)}).` }
      const party = Number(a.party_size) > 0 ? Number(a.party_size) : svc.party_min
      if (party > svc.party_max || party < svc.party_min) return { ok: false, error: `Ta usługa jest dla ${svc.party_min}–${svc.party_max} osób.` }
      const who = a.staff ? matchByName(performers(cat, svc, true), a.staff) : null
      if (a.staff && !who) return { ok: false, error: `Nie znaleziono „${a.staff}” wśród osób wykonujących tę usługę.`, kto_wykonuje: performers(cat, svc, true).map(r => r.name) }
      const wish = toMin(a.time)
      const names = (rs: Resource[]) => [...new Set(rs.map(r => r.name))].join(' lub ')
      // one option = a start time + how to say it; for two services it is a time that works for both people
      type Day = { date: string; reason?: string; opts: { min: number; text: string }[] }
      const load = async (from: string, days: number): Promise<Day[]> => {
        const [A, B] = await Promise.all([
          findSlots(cat, svc, { from, days, party, resourceIds: who ? [who.id] : undefined, forAi: true }),
          svc2 ? findSlots(cat, svc2, { from, days, forAi: true }) : null,
        ])
        if (!svc2 || !B) return A.map(d => ({ date: d.date, reason: d.reason, opts: d.slots.map(x => ({ min: x.min, text: `${sayTime(x.min)}${who || svc.party_max > 1 ? '' : ` — ${names(x.resources)}`}` })) }))
        return A.map((d, k) => ({
          date: d.date, reason: d.reason ?? B[k].reason ?? 'brak wspólnego terminu na obie usługi',
          opts: pairSlots(d, B[k], svc, step(cat)).map(p => ({ min: p.min, text: p.min === p.minB ? `${sayTime(p.min)} — obie wizyty równocześnie` : `${sayTime(p.min)} — jedna po drugiej, ${svc2.name} o ${sayTime(p.minB)}` })),
        }))
      }
      const [day] = await load(date, 1)
      const pick = (d: Day) => humanPick(d.opts.map(o => o.min), wish).map(m => d.opts.find(o => o.min === m)!.text)
      const range = (d: Day) => {
        // "wolne 09:00–12:00, 14:00–17:15" — lets her answer "a później?" without reading a list
        const mins = d.opts.map(x => x.min), parts: string[] = []
        let a0 = mins[0], prev = mins[0]
        for (const m of [...mins.slice(1), Infinity]) { if (m - prev > step(cat)) { parts.push(a0 === prev ? hhmm(a0) : `${hhmm(a0)}–${hhmm(prev)}`); a0 = m } prev = m }
        return parts.slice(0, 4).join(', ')
      }
      const out: Out = { ok: true, usluga: svc2 ? `${svcLabel(svc)} + ${svcLabel(svc2)}` : svcLabel(svc), dzien: `${spoken(date)} (${date})`, osob: svc.party_max > 1 ? party : undefined, pracownik: who?.name }
      if (day.opts.length) {
        out.propozycje = pick(day)
        out.wolne_przedzialy = range(day)
        out.wskazowka = 'Zaproponuj 2–3 godziny z „propozycje” i wypowiedz je dokładnie tak, jak w cudzysłowie (godzina i minuty, bez „kwadrans” i „wpół do”). Nie czytaj przedziałów, chyba że klient pyta o inną porę.'
        if (wish != null) {
          const exact = day.opts.find(o => o.min === wish)
          out.prosba = exact ? `Godzina ${sayTime(wish)} jest wolna.` : `Godzina ${sayTime(wish)} jest zajęta — najbliższe wolne: ${[...day.opts].sort((x, y) => Math.abs(x.min - wish) - Math.abs(y.min - wish)).slice(0, 3).sort((x, y) => x.min - y.min).map(o => sayTime(o.min)).join(', ')}.`
        }
      } else {
        out.propozycje = []
        out.powod = day.reason
        const next = await load(addDays(date, 1), 14)
        out.najblizsze_dni = next.filter(d => d.opts.length).slice(0, 2).map(d => ({ dzien: `${spoken(d.date)} (${d.date})`, propozycje: pick(d) }))
        out.wskazowka = 'Powiedz krótko, że tego dnia się nie da, i zaproponuj najbliższy dzień z jedną, dwiema godzinami.'
      }
      return out
    }

    case 'book_appointment': {
      const svc = service(cat, a.service)
      if (!svc) return { ok: false, error: 'Nie znaleziono takiej usługi.', oferta: offer(cat) }
      const svc2 = a.second_service ? service(cat, a.second_service) : null
      if (a.second_service && !svc2) return { ok: false, error: `Nie znaleziono usługi „${a.second_service}”.`, oferta: offer(cat) }
      if (!isDate(a.date)) return { ok: false, error: 'Podaj datę w formacie YYYY-MM-DD.' }
      const min = toMin(a.time)
      if (min == null) return { ok: false, error: 'Podaj godzinę w formacie HH:MM.' }
      const name = String(a.customer_name ?? '').trim()
      if (name.length < 2) return { ok: false, error: 'Zapytaj klienta o imię.' }
      const phone = normPhone(a.customer_phone) ?? caller
      if (!phone) return { ok: false, error: 'Numer telefonu klienta jest nieznany — poproś o numer, powtórz go do potwierdzenia i dopiero wtedy zapisz. Nie mów klientowi o błędzie.' }
      const party = Number(a.party_size) > 0 ? Number(a.party_size) : svc.party_min
      const who = a.staff ? matchByName(performers(cat, svc, true), a.staff) : null
      const [[day], dayB] = await Promise.all([
        findSlots(cat, svc, { from: a.date, days: 1, party, resourceIds: who ? [who.id] : undefined, forAi: true }),
        svc2 ? findSlots(cat, svc2, { from: a.date, days: 1, forAi: true }).then(d => d[0]) : null,
      ])
      const slot = day.slots.find(s => s.min === min)
      const pairs = svc2 && dayB ? pairSlots(day, dayB, svc, step(cat)) : []
      const pair = pairs.find(p => p.min === min) ?? null
      if (!slot || (svc2 && !pair)) return { ok: false, error: `Termin ${sayTime(min)}, ${spoken(a.date)}, nie jest już wolny${svc2 ? ' na obie usługi' : ''}.`, wolne_godziny: speakable((svc2 ? pairs : day.slots).map(s => s.min), min, 6).map(sayTime) }
      const loyaltyP = cat.settings.offer_loyalty ? loyaltyFor(ctx.cid, phone) : Promise.resolve({ program: null, card: null })
      // two people at once need two different people behind the chair
      const together = pair && pair.min === pair.minB
      const [res, client, callId] = await Promise.all([
        pickResource(cat, svc, together ? slot.resources.filter(r => pair!.rb.some(q => q.id !== r.id)) : slot.resources, a.date, party),
        clientByPhone(ctx.cid, phone, { source: ctx.channel === 'test' ? 'ai_test' : 'phone', name }),
        ensureCall(ctx.cid, ctx.conversationId, ctx.agentId, { outcome: 'booked', channel: ctx.channel, customer_name: name }),
      ])
      void Promise.all([
        client && !client.name ? patch('rc_clients', `id=eq.${client.id}`, { name }) : null,
        client && callId ? patch('rc_calls', `id=eq.${callId}`, { client_id: client.id }) : null,
      ])
      const source = ctx.channel === 'test' ? 'ai_test' : 'phone'
      const row = (v: Service, r: Resource, starts: Date, who2: string, notes: string | null, people: number) => {
        const ends = new Date(starts.getTime() + v.duration_min * 60000)
        return {
          company_id: ctx.cid, service_id: v.id, resource_id: r.id, client_id: client?.id ?? null, call_id: callId, service_name: v.name,
          starts_at: starts.toISOString(), ends_at: ends.toISOString(), block_until: new Date(ends.getTime() + v.buffer_min * 60000).toISOString(), party_size: people,
          status: cat.settings.ai_booking_status, source, customer_name: who2, customer_phone: phone, notes, price: v.price_from, created_by: null,
        }
      }
      const fail = (code?: string): Out => code === '23P01'
        ? { ok: false, error: 'Ktoś właśnie zajął ten termin. Sprawdź dostępność jeszcze raz i zaproponuj inny.' }
        : { ok: false, error: 'Nie udało się zapisać rezerwacji — przeproś i zaproponuj, że zespół oddzwoni (leave_message).' }
      const notes = a.notes ? String(a.notes).slice(0, 1000) : null
      const r = await insertRow<{ id: string }>('rc_bookings', row(svc, res, slot.start, name, notes, party))
      if (!r.ok) return fail(r.error?.code)
      let second = ''
      if (svc2 && pair) {
        const res2 = together ? await pickResource(cat, svc2, pair.rb.filter(q => q.id !== res.id), a.date, 1) : pair.rb.find(q => q.id === res.id) ?? await pickResource(cat, svc2, pair.rb, a.date, 1)
        const name2 = String(a.second_name ?? '').trim()
        const r2 = await insertRow<{ id: string }>('rc_bookings', row(svc2, res2, zoned(a.date, pair.minB, tz), name2 ? `${name2} (z: ${name})` : name, [`Wizyta razem z: ${svc.name}, ${hhmm(min)}`, notes].filter(Boolean).join(' · '), svc2.party_min))
        if (!r2.ok) {
          await db(`/rest/v1/rc_bookings?id=eq.${r.row?.id}`, { method: 'DELETE' })   // never leave half of a joint visit
          return fail(r2.error?.code)
        }
        second = `; ${svc2.name}${name2 ? ` (${name2})` : ''}, godz. ${sayTime(pair.minB)}${res2.kind === 'staff' ? `, u: ${res2.name}` : ''}`
      }
      const out: Out = {
        ok: true, status: cat.settings.ai_booking_status === 'pending' ? 'wstępna — zespół potwierdzi' : 'potwierdzona',
        podsumowanie: `${svc.name}, ${spoken(a.date)}, godz. ${sayTime(min)}${svc.party_max > 1 ? `, ${party} os.` : ''}${res.kind === 'staff' ? `, u: ${res.name}` : res.kind === 'table' ? '' : `, ${res.name}`}${second}`,
        czas_trwania: minutesText(svc.duration_min), telefon: prettyPhone(phone), booking_id: r.row?.id,
        wskazowka: 'Potwierdź jednym krótkim zdaniem (dzień, godzina, u kogo). Nie obiecuj SMS-a ani e-maila z potwierdzeniem.',
      }
      if (cat.settings.offer_loyalty) {
        const { program, card } = await loyaltyP
        if (program && card) out.karta_lojalnosciowa = `Klient ma już kartę „${program.name}”: ${card.stamps % program.stamps_required}/${program.stamps_required} pieczątek${card.stamps >= program.stamps_required ? ' i nagrodę do odebrania' : ''}. Przypomnij jednym krótkim zdaniem, żeby pokazał ją na wizycie — dostanie pieczątkę.`
        else if (program) out.karta_lojalnosciowa = `Klient nie ma jeszcze karty stałego klienta. Wspomnij o tym jednym krótkim, luźnym zdaniem: na wizycie może poprosić o kartę — za ${program.stamps_required} pieczątek jest ${program.reward}. NIE mów, że założyłaś kartę.`
      }
      return out
    }

    case 'find_bookings': {
      const phone = normPhone(a.customer_phone) ?? caller
      const client = phone ? await clientByPhone(ctx.cid, phone, null) : null
      const list = await bookingsFor(ctx.cid, phone, client?.id ?? null)
      if (!phone) return { ok: false, error: 'Numer dzwoniącego jest nieznany — zapytaj o numer telefonu użyty przy rezerwacji.' }
      if (!list.length) return { ok: true, rezerwacje: [], info: `Brak nadchodzących rezerwacji na numer ${prettyPhone(phone)}.` }
      return { ok: true, rezerwacje: list.map(b => ({ booking_id: b.id, kiedy: `${spoken(localDate(new Date(b.starts_at), tz))}, ${sayAt(b.starts_at, tz)}`, usluga: b.service_name, u: b.resource?.name, osob: b.party_size > 1 ? b.party_size : undefined, status: b.status === 'pending' ? 'wstępna' : 'potwierdzona' })) }
    }

    case 'cancel_booking': {
      const b = await one<{ id: string; starts_at: string; status: string; client_id: string | null; customer_phone: string | null; service_name: string | null }>(`rc_bookings?id=eq.${uuid(a.booking_id)}&company_id=eq.${ctx.cid}&select=id,starts_at,status,client_id,customer_phone,service_name`)
      if (!b || !['pending', 'confirmed'].includes(b.status)) return { ok: false, error: 'Nie znaleziono aktywnej rezerwacji o tym identyfikatorze.' }
      if (!cat.settings.allow_cancel) return { ok: false, error: 'Odwołania przez telefon z asystentem są wyłączone — użyj leave_message, zespół oddzwoni.' }
      if (Date.parse(b.starts_at) - Date.now() < cat.settings.cancel_notice_min * 60000) return { ok: false, error: `Na odwołanie jest już za późno (wymagane ${minutesText(cat.settings.cancel_notice_min)} wcześniej). Zostaw wiadomość dla zespołu (leave_message).` }
      if (caller && b.customer_phone && b.customer_phone !== caller && ctx.channel === 'phone') return { ok: false, error: 'Ta rezerwacja jest na inny numer telefonu — ze względów bezpieczeństwa odwołanie tylko z numeru rezerwacji albo przez zespół (leave_message).' }
      const callId = await ensureCall(ctx.cid, ctx.conversationId, ctx.agentId, { outcome: 'cancelled', channel: ctx.channel })
      await patch('rc_bookings', `id=eq.${b.id}`, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: `Telefon (AI)${a.reason ? `: ${String(a.reason).slice(0, 300)}` : ''}`, call_id: callId })
      return { ok: true, info: `Odwołano: ${b.service_name ?? 'wizyta'}, ${spoken(localDate(new Date(b.starts_at), tz))}, ${sayAt(b.starts_at, tz)}.` }
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
      if (!slot) return { ok: false, error: `Termin ${sayTime(min)} nie jest wolny.`, wolne_godziny: speakable(day.slots.map(s => s.min), min, 6).map(sayTime) }
      const keep = slot.resources.find(r => r.id === b.resource_id)
      const res = keep ?? await pickResource(cat, svc, slot.resources, a.date, b.party_size)
      const ends = new Date(slot.start.getTime() + svc.duration_min * 60000)
      const callId = await ensureCall(ctx.cid, ctx.conversationId, ctx.agentId, { outcome: 'rescheduled', channel: ctx.channel })
      const r = await patch('rc_bookings', `id=eq.${b.id}`, { starts_at: slot.start.toISOString(), ends_at: ends.toISOString(), block_until: new Date(ends.getTime() + svc.buffer_min * 60000).toISOString(), resource_id: res.id, call_id: callId })
      if (!r.ok) return { ok: false, error: 'Ten termin właśnie się zajął — sprawdź dostępność ponownie.' }
      return { ok: true, info: `Przełożono na ${spoken(a.date)}, godz. ${sayTime(min)}${res.kind === 'staff' ? `, u: ${res.name}` : ''}.` }
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

const sayAt = (iso: string, tz: string) => { const p = parts(new Date(iso), tz); return sayTime(p.h * 60 + p.mi) }

function uuid(v: unknown): string {
  const s = String(v ?? '').trim()
  return /^[0-9a-f-]{36}$/i.test(s) ? s : '00000000-0000-0000-0000-000000000000'
}
export { zoned }
