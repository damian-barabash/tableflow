// Availability engine — the single source of "when is who free", used by the AI tools and by the panel.
// free = working hours (resource's own, else the business's) − time off (business + resource) − bookings (+buffer)
import { rows, fold } from './shared.ts'
import { addDays, parts, toMin, weekday, zoned, hhmm, localDate } from './time.ts'

export interface Settings {
  company_id: string; assistant_name: string; timezone: string; slot_step_min: number; min_notice_min: number; max_days_ahead: number
  ai_booking_status: 'confirmed' | 'pending'; allow_cancel: boolean; allow_reschedule: boolean; cancel_notice_min: number; offer_loyalty: boolean
  [k: string]: any
}
export interface Resource { id: string; kind: string; name: string; title: string | null; capacity: number; min_capacity: number; ai_bookable: boolean; active: boolean; sort: number; color: string; description: string | null }
export interface Service {
  id: string; name: string; category: string | null; description: string | null; duration_min: number; buffer_min: number; price_from: number | null; price_to: number | null; price_note: string | null
  resource_kind: string; party_min: number; party_max: number; min_notice_min: number | null; ai_bookable: boolean; active: boolean; sort: number
}
export interface Hours { resource_id: string | null; weekday: number; opens: string; closes: string }
interface Busy { resource_id: string | null; from: number; to: number; booking_id?: string }

export const DEFAULT_SETTINGS = {
  assistant_name: 'Ania', timezone: 'Europe/Warsaw', slot_step_min: 15, min_notice_min: 60, max_days_ahead: 60, ai_booking_status: 'confirmed',
  allow_cancel: true, allow_reschedule: true, cancel_notice_min: 120, offer_loyalty: true, ask_name: true, language: 'pl', extra_languages: ['en', 'uk'],
  tone: 'warm', voice_quality: 'natural', voice_speed: 1, voice_stability: 0.6,
}

export interface Catalog { settings: Settings; resources: Resource[]; services: Service[]; links: { service_id: string; resource_id: string }[]; hours: Hours[] }
const catCache = new Map<string, { at: number; cat: Promise<Catalog> }>()
/** Cached for 20 s — one phone call makes several tool calls in a row; bookings are never cached. */
export function loadCatalog(cid: string): Promise<Catalog> {
  const hit = catCache.get(cid)
  if (hit && Date.now() - hit.at < 20_000) return hit.cat
  const cat = fetchCatalog(cid)
  catCache.set(cid, { at: Date.now(), cat })
  cat.catch(() => catCache.delete(cid))
  return cat
}
async function fetchCatalog(cid: string): Promise<Catalog> {
  const [s, resources, services, links, hours] = await Promise.all([
    rows<Settings>(`rc_settings?company_id=eq.${cid}&select=*`),
    rows<Resource>(`rc_resources?company_id=eq.${cid}&select=*&order=sort.asc,name.asc`),
    rows<Service>(`rc_services?company_id=eq.${cid}&select=*&order=sort.asc,name.asc`),
    rows<{ service_id: string; resource_id: string }>(`rc_service_resources?company_id=eq.${cid}&select=service_id,resource_id`),
    rows<Hours>(`rc_hours?company_id=eq.${cid}&select=resource_id,weekday,opens,closes&order=opens.asc`),
  ])
  return { settings: { ...DEFAULT_SETTINGS, ...(s[0] ?? {}), company_id: cid } as Settings, resources, services, links, hours }
}

/** Resources that can perform a service (explicit links, else all of the service's kind). */
export function performers(cat: Catalog, svc: Service, forAi: boolean): Resource[] {
  const linked = cat.links.filter(l => l.service_id === svc.id).map(l => l.resource_id)
  return cat.resources.filter(r => r.active && (!forAi || r.ai_bookable) && (linked.length ? linked.includes(r.id) : r.kind === svc.resource_kind))
}

/** Two words are the same modulo Polish inflection: "Tomka" ≈ "Tomek", "Kasi" ≈ "Kasia", "strzyżenia" ≈ "strzyżenie". */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i >= 3 && i >= Math.min(a.length, b.length) - 2
}
/** Best match for a spoken service / person name. */
export function matchByName<T extends { name: string; title?: string | null; category?: string | null }>(list: T[], q: unknown): T | null {
  const s = fold(String(q ?? ''))
  if (!s) return null
  const scored = list.map(x => {
    const n = fold(x.name), extra = fold(`${x.title ?? ''} ${x.category ?? ''}`)
    let score = 0
    if (n === s) score = 100
    else if (n.startsWith(s) || s.startsWith(n)) score = 80
    else if (n.includes(s) || s.includes(n)) score = 70
    else {
      const qt = s.split(' ').filter(w => w.length > 2), nt = `${n} ${extra}`.split(' ').filter(w => w.length > 2)
      const hit = qt.filter(w => nt.some(t => sameStem(w, t)))
      const nameHit = n.split(' ').filter(w => w.length > 2 && qt.some(q2 => sameStem(q2, w))).length
      score = qt.length ? Math.round(60 * hit.length / qt.length) + (nameHit ? 10 : 0) : 0
    }
    return { x, score }
  }).filter(v => v.score >= 40).sort((a, b) => b.score - a.score)
  return scored[0]?.x ?? null
}

export interface DaySlots { date: string; closed: boolean; reason?: string; slots: { start: Date; min: number; resources: Resource[] }[] }

/** Free start times for a service on [from, from+days) — per slot, the resources that can take it. */
export async function findSlots(cat: Catalog, svc: Service, opts: { from: string; days: number; party?: number; resourceIds?: string[]; forAi: boolean; excludeBooking?: string; now?: Date }): Promise<DaySlots[]> {
  const tz = cat.settings.timezone, step = cat.settings.slot_step_min || 15
  const now = opts.now ?? new Date()
  const notice = svc.min_notice_min ?? cat.settings.min_notice_min ?? 0
  const earliest = now.getTime() + notice * 60000
  const horizon = zoned(addDays(localDate(now, tz), cat.settings.max_days_ahead + 1), 0, tz).getTime()
  const party = Math.max(1, opts.party ?? svc.party_min ?? 1)
  let res = performers(cat, svc, opts.forAi)
  if (opts.resourceIds?.length) res = res.filter(r => opts.resourceIds!.includes(r.id))
  if (svc.party_max > 1) res = res.filter(r => r.capacity >= party && r.min_capacity <= party)

  const start = zoned(opts.from, 0, tz), end = zoned(addDays(opts.from, opts.days), 0, tz)
  const [off, booked] = await Promise.all([
    rows<{ resource_id: string | null; starts_at: string; ends_at: string }>(`rc_time_off?company_id=eq.${cat.settings.company_id}&starts_at=lt.${end.toISOString()}&ends_at=gt.${start.toISOString()}&select=resource_id,starts_at,ends_at`),
    rows<{ id: string; resource_id: string | null; starts_at: string; block_until: string }>(`rc_bookings?company_id=eq.${cat.settings.company_id}&status=in.(pending,confirmed)&starts_at=lt.${end.toISOString()}&block_until=gt.${start.toISOString()}&select=id,resource_id,starts_at,block_until`),
  ])
  const busy: Busy[] = [
    ...off.map(o => ({ resource_id: o.resource_id, from: Date.parse(o.starts_at), to: Date.parse(o.ends_at) })),
    ...booked.filter(b => b.id !== opts.excludeBooking).map(b => ({ resource_id: b.resource_id, from: Date.parse(b.starts_at), to: Date.parse(b.block_until), booking_id: b.id })),
  ]
  const businessHours = cat.hours.filter(h => !h.resource_id)
  const out: DaySlots[] = []
  for (let i = 0; i < opts.days; i++) {
    const date = addDays(opts.from, i), wd = weekday(date)
    const dayStart = zoned(date, 0, tz).getTime(), dayEnd = zoned(addDays(date, 1), 0, tz).getTime()
    const bizToday = businessHours.filter(h => h.weekday === wd)
    const closedAll = busy.some(b => !b.resource_id && b.from <= dayStart + 6 * 3600000 && b.to >= dayEnd - 3600000)
    const day: DaySlots = { date, closed: false, slots: [] }
    if (dayStart >= horizon) { day.closed = true; day.reason = 'poza okresem rezerwacji'; out.push(day); continue }
    if (!res.length) { day.closed = true; day.reason = 'brak osób/zasobów wykonujących tę usługę'; out.push(day); continue }
    const map = new Map<number, Resource[]>()
    for (const r of res) {
      const own = cat.hours.filter(h => h.resource_id === r.id)
      const ranges = (own.length ? own.filter(h => h.weekday === wd) : bizToday)
      for (const h of ranges) {
        const o = toMin(h.opens.slice(0, 5))!, c = toMin(h.closes.slice(0, 5))!
        const block = (svc.duration_min + svc.buffer_min) * 60000
        for (let m = Math.ceil(o / step) * step; m + svc.duration_min <= c; m += step) {
          const t = zoned(date, m, tz).getTime()
          if (t < earliest || t >= horizon) continue
          const clash = busy.some(b => (b.resource_id === null || b.resource_id === r.id) && b.from < t + block && b.to > t)
          if (clash) continue
          const list = map.get(m) ?? []; if (!list.includes(r)) list.push(r); map.set(m, list)
        }
      }
    }
    day.slots = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([min, rs]) => ({ min, start: zoned(date, min, tz), resources: rs }))
    if (!day.slots.length) { day.closed = !bizToday.length || closedAll; day.reason = closedAll ? 'firma nieczynna (urlop/święto)' : !bizToday.length && !res.some(r => cat.hours.some(h => h.resource_id === r.id && h.weekday === wd)) ? 'firma nieczynna w ten dzień' : 'brak wolnych terminów' }
    out.push(day)
  }
  return out
}

/** Choose who takes the booking: preferred → smallest fitting table → least busy person that day. */
export async function pickResource(cat: Catalog, svc: Service, candidates: Resource[], date: string, party: number): Promise<Resource> {
  if (candidates.length === 1) return candidates[0]
  if (svc.party_max > 1) return [...candidates].sort((a, b) => a.capacity - b.capacity || a.sort - b.sort)[0]
  const tz = cat.settings.timezone
  const from = zoned(date, 0, tz).toISOString(), to = zoned(addDays(date, 1), 0, tz).toISOString()
  const b = await rows<{ resource_id: string }>(`rc_bookings?company_id=eq.${cat.settings.company_id}&status=in.(pending,confirmed)&starts_at=gte.${from}&starts_at=lt.${to}&select=resource_id`)
  const load = (id: string) => b.filter(x => x.resource_id === id).length
  void party
  return [...candidates].sort((a, b2) => load(a.id) - load(b2.id) || a.sort - b2.sort)[0]
}

export function priceText(s: Service): string {
  const f = (n: number) => `${Number(n).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł`
  if (s.price_from != null && s.price_to != null && Number(s.price_to) !== Number(s.price_from)) return `${f(s.price_from)}–${f(s.price_to)}${s.price_note ? ` (${s.price_note})` : ''}`
  if (s.price_from != null) return `${f(s.price_from)}${s.price_note ? ` (${s.price_note})` : ''}`
  return s.price_note ?? ''
}
export const minutesText = (m: number) => m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`

/** Thin a long list of times to what can be said on the phone: first/last + spread + around the wish. */
export function speakable(times: number[], wish: number | null, max = 10): number[] {
  if (times.length <= max) return times
  const pick = new Set<number>()
  if (wish != null) [...times].sort((a, b) => Math.abs(a - wish) - Math.abs(b - wish)).slice(0, 4).forEach(t => pick.add(t))
  const stepN = Math.max(1, Math.floor(times.length / (max - pick.size)))
  for (let i = 0; i < times.length && pick.size < max; i += stepN) pick.add(times[i])
  return [...pick].sort((a, b) => a - b)
}
export { hhmm, parts }
