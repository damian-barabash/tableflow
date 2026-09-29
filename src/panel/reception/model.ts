/**
 * Reception module (AI phone reception + calendar + CRM): types, time-zone helpers, labels and
 * industry templates. The availability engine itself lives in the edge function "reception",
 * so the panel and the AI agent always see exactly the same free slots.
 */
import { fn, get } from '../../app/api'

// ---------------------------------------------------------------- types
export type ResourceKind = 'staff' | 'table' | 'room' | 'team' | 'equipment'
export interface Resource {
  id: string; company_id: string; kind: ResourceKind; name: string; title: string | null; description: string | null; capacity: number; min_capacity: number
  color: string; member_user_id: string | null; ai_bookable: boolean; active: boolean; sort: number
}
export interface Service {
  id: string; company_id: string; name: string; category: string | null; description: string | null; duration_min: number; buffer_min: number
  price_from: number | null; price_to: number | null; price_note: string | null; resource_kind: ResourceKind; party_min: number; party_max: number
  min_notice_min: number | null; ai_bookable: boolean; active: boolean; sort: number
}
export interface HoursRow { id?: string; company_id?: string; resource_id: string | null; weekday: number; opens: string; closes: string }
export interface TimeOff { id: string; company_id: string; resource_id: string | null; starts_at: string; ends_at: string; reason: string | null }
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
export interface Booking {
  id: string; company_id: string; service_id: string | null; resource_id: string | null; client_id: string | null; call_id: string | null; service_name: string | null
  starts_at: string; ends_at: string; block_until: string; party_size: number; status: BookingStatus; source: string
  customer_name: string | null; customer_phone: string | null; customer_email: string | null; notes: string | null; internal_note: string | null; price: number | null
  cancel_reason: string | null; created_at: string
}
export interface Client {
  id: string; name: string | null; phone: string | null; email: string | null; notes: string | null; tags: string[]; source: string; marketing_consent: boolean; created_at: string
  visits?: number; no_shows?: number; next_at?: string | null; calls?: number; last_at?: string | null
  loyalty?: { stamps: number; required: number; code: string; program: string } | null
}
export interface Call {
  id: string; conversation_id: string | null; channel: 'phone' | 'test'; caller_phone: string | null; called_number: string | null; client_id: string | null
  started_at: string; duration_s: number | null; status: 'in_progress' | 'done' | 'failed'; title: string | null; summary: string | null
  outcome: 'booked' | 'rescheduled' | 'cancelled' | 'info' | 'callback' | 'other' | null; customer_name: string | null
  transcript: { role: 'user' | 'agent'; text: string | null; t: number | null; tools: { name: string; params: unknown }[]; results: { name: string; error: boolean; value: string }[] }[] | null
  has_audio: boolean; needs_callback: boolean; callback_note: string | null; handled_at: string | null; note: string | null
}
export interface Knowledge { id: string; company_id: string; kind: 'faq' | 'info' | 'policy'; question: string; answer: string; active: boolean; sort: number }
export interface Settings {
  company_id: string; assistant_name: string; voice_id: string | null; voice_name: string | null; voice_speed: number; voice_stability: number; voice_quality: 'natural' | 'fast'
  language: string; extra_languages: string[]; greeting: string | null; tone: 'warm' | 'professional' | 'casual'; business_description: string | null; instructions: string | null
  timezone: string; slot_step_min: number; min_notice_min: number; max_days_ahead: number; ai_booking_status: 'confirmed' | 'pending'; allow_cancel: boolean
  allow_reschedule: boolean; cancel_notice_min: number; offer_loyalty: boolean; ask_name: boolean; transfer_phone: string | null; after_hours_message: string | null
}
export interface Voice { voice_id: string; name: string; gender: string | null; accent: string | null; description: string | null; preview_url: string | null; enabled: boolean; sort: number }
export interface Status {
  platform_ok: boolean; webhooks_ok: boolean; stale: boolean; test_mode: boolean
  agent: { agent_id: string | null; synced_at: string | null; config_changed_at: string; sync_error: string | null; last_test_at: string | null } | null
  numbers: { phone_number: string; label: string | null; el_phone_id: string | null; last_error: string | null }[]
}

export const DEFAULT_SETTINGS: Omit<Settings, 'company_id'> = {
  assistant_name: 'Ania', voice_id: null, voice_name: null, voice_speed: 1, voice_stability: 0.45, voice_quality: 'natural', language: 'pl', extra_languages: ['en', 'uk'],
  greeting: null, tone: 'warm', business_description: null, instructions: null, timezone: 'Europe/Warsaw', slot_step_min: 15, min_notice_min: 60, max_days_ahead: 60,
  ai_booking_status: 'confirmed', allow_cancel: true, allow_reschedule: true, cancel_notice_min: 120, offer_loyalty: true, ask_name: true, transfer_phone: null, after_hours_message: null,
}

// ---------------------------------------------------------------- data
export async function loadSetup(cid: string) {
  const [settings, resources, services, links, hours] = await Promise.all([
    get<Settings[]>(`rc_settings?company_id=eq.${cid}&select=*`),
    get<Resource[]>(`rc_resources?company_id=eq.${cid}&select=*&order=sort.asc,name.asc`),
    get<Service[]>(`rc_services?company_id=eq.${cid}&select=*&order=sort.asc,name.asc`),
    get<{ service_id: string; resource_id: string }[]>(`rc_service_resources?company_id=eq.${cid}&select=service_id,resource_id`),
    get<HoursRow[]>(`rc_hours?company_id=eq.${cid}&select=*&order=weekday.asc,opens.asc`),
  ])
  return { settings: { ...DEFAULT_SETTINGS, ...(settings[0] ?? {}), company_id: cid } as Settings, hasSettings: !!settings[0], resources, services, links, hours }
}
export type Setup = Awaited<ReturnType<typeof loadSetup>>

export const reception = <T>(action: string, body: Record<string, unknown>) => fn<T>('reception', { action, ...body })
export const status = (cid: string) => reception<Status>('status', { company_id: cid })
export const syncAgent = (cid: string) => reception<{ ok: boolean; agent_id: string; warnings: string[] }>('sync', { company_id: cid })
export interface DaySlots { date: string; closed: boolean; reason: string | null; slots: { time: string; start: string; resources: string[] }[] }
export const slots = (cid: string, o: { service_id: string; date: string; days?: number; party?: number; resource_id?: string; exclude?: string }) => reception<DaySlots[]>('slots', { company_id: cid, ...o })

// ---------------------------------------------------------------- time (business time zone)
export const TZ = 'Europe/Warsaw'
const fmtCache = new Map<string, Intl.DateTimeFormat>()
function f(tz: string) {
  let x = fmtCache.get(tz)
  if (!x) { x = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); fmtCache.set(tz, x) }
  return x
}
export function parts(d: Date, tz = TZ) {
  const o: Record<string, number> = {}
  for (const p of f(tz).formatToParts(d)) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return { y: o.year, m: o.month, d: o.day, h: o.hour, mi: o.minute }
}
const pad = (n: number) => String(n).padStart(2, '0')
export const dayOf = (d: Date | string, tz = TZ) => { const p = parts(typeof d === 'string' ? new Date(d) : d, tz); return `${p.y}-${pad(p.m)}-${pad(p.d)}` }
export const timeOf = (d: Date | string, tz = TZ) => { const p = parts(typeof d === 'string' ? new Date(d) : d, tz); return `${pad(p.h)}:${pad(p.mi)}` }
export const minOf = (d: Date | string, tz = TZ) => { const p = parts(typeof d === 'string' ? new Date(d) : d, tz); return p.h * 60 + p.mi }
function offset(d: Date, tz: string) { const p = parts(d, tz); return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(d.getTime() / 60000) * 60000) / 60000 }
/** instant of local "YYYY-MM-DD" + minutes */
export function at(date: string, minutes: number, tz = TZ): Date {
  const [y, m, d] = date.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d, 0, minutes)
  const o1 = offset(new Date(t), tz); let r = t - o1 * 60000
  const o2 = offset(new Date(r), tz); if (o2 !== o1) r = t - o2 * 60000
  return new Date(r)
}
export function addDays(date: string, n: number) { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` }
export const weekdayOf = (date: string) => { const [y, m, d] = date.split('-').map(Number); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 }
export const today = () => dayOf(new Date())
export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
export const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
export const WEEKDAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela']
export const WD_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']
export function dateLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('pl-PL', { ...opts, timeZone: 'UTC' })
}
export function relDay(date: string) {
  const t = today()
  if (date === t) return 'Dziś'
  if (date === addDays(t, 1)) return 'Jutro'
  if (date === addDays(t, -1)) return 'Wczoraj'
  return dateLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })
}
export const mondayOf = (date: string) => addDays(date, -weekdayOf(date))

// ---------------------------------------------------------------- labels
export const KIND: Record<ResourceKind, { one: string; many: string; add: string; hint: string; icon: string }> = {
  staff: { one: 'Pracownik', many: 'Zespół', add: 'Dodaj pracownika', hint: 'Fryzjer, barber, lekarz, trener, mechanik…', icon: '👤' },
  table: { one: 'Stolik', many: 'Stoliki', add: 'Dodaj stolik', hint: 'Restauracja, kawiarnia, bar — liczba miejsc przy stoliku.', icon: '🪑' },
  room: { one: 'Sala / stanowisko', many: 'Sale i stanowiska', add: 'Dodaj salę lub stanowisko', hint: 'Gabinet, sala zabiegowa, stanowisko w warsztacie, kort, sala zajęć.', icon: '🚪' },
  team: { one: 'Ekipa', many: 'Ekipy', add: 'Dodaj ekipę', hint: 'Catering, ekipa sprzątająca, montażowa — ile osób/gości obsłuży.', icon: '🚐' },
  equipment: { one: 'Sprzęt', many: 'Sprzęt', add: 'Dodaj sprzęt', hint: 'Wypożyczany sprzęt, auto zastępcze, łódź, symulator.', icon: '🧰' },
}
export const STATUS_LABEL: Record<BookingStatus, { label: string; tone: 'ok' | 'warn' | 'err' | 'neutral' | 'brand' }> = {
  pending: { label: 'Do potwierdzenia', tone: 'warn' }, confirmed: { label: 'Potwierdzona', tone: 'ok' }, completed: { label: 'Zrealizowana', tone: 'neutral' },
  cancelled: { label: 'Odwołana', tone: 'err' }, no_show: { label: 'Nieobecność', tone: 'err' },
}
export const SOURCE_LABEL: Record<string, string> = { phone: 'Telefon · AI', ai_test: 'Test AI', panel: 'Panel', web: 'Strona', booksy: 'Booksy', versum: 'Versum', loyalty: 'Karta lojalnościowa', import: 'Import' }
export const OUTCOME: Record<string, { label: string; tone: 'ok' | 'warn' | 'err' | 'neutral' | 'brand' }> = {
  booked: { label: 'Rezerwacja', tone: 'ok' }, rescheduled: { label: 'Przełożenie', tone: 'brand' }, cancelled: { label: 'Odwołanie', tone: 'warn' },
  info: { label: 'Informacja', tone: 'neutral' }, callback: { label: 'Oddzwonić', tone: 'err' }, other: { label: 'Inne', tone: 'neutral' },
}
export const TOOL_LABEL: Record<string, string> = {
  check_availability: 'Sprawdzono kalendarz', book_appointment: 'Zapisano rezerwację', find_bookings: 'Wyszukano rezerwacje', cancel_booking: 'Odwołano wizytę',
  reschedule_booking: 'Przełożono wizytę', save_client: 'Zapamiętano klienta', leave_message: 'Wiadomość do zespołu', end_call: 'Zakończono rozmowę',
  language_detection: 'Zmiana języka', transfer_to_number: 'Przełączenie do człowieka',
}
export const COLORS = ['#464f96', '#6f6396', '#a784a3', '#2a7d6f', '#c07a2c', '#b34d5e', '#3a7bb8', '#7c8a3a', '#1a1916', '#8a5a0b']

export const minutesText = (m: number) => m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`
export const money = (n: number | null | undefined) => n == null ? '' : `${Number(n).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł`
export function priceText(s: Pick<Service, 'price_from' | 'price_to' | 'price_note'>) {
  if (s.price_from != null && s.price_to != null && Number(s.price_to) !== Number(s.price_from)) return `${money(s.price_from)} – ${money(s.price_to)}`
  if (s.price_from != null) return money(s.price_from)
  return s.price_note ?? ''
}
export function prettyPhone(d: string | null | undefined) {
  if (!d) return ''
  const x = d.replace(/\D/g, '')
  if (x.startsWith('48') && x.length === 11) return `+48 ${x.slice(2, 5)} ${x.slice(5, 8)} ${x.slice(8)}`
  return `+${x}`
}
export function normPhone(p: string) { const d = p.replace(/\D/g, ''); return d.length === 9 ? '48' + d : d.length >= 10 && d.length <= 15 ? d : null }
export const performersOf = (s: Setup, svc: Service, onlyActive = true) => {
  const linked = s.links.filter(l => l.service_id === svc.id).map(l => l.resource_id)
  return s.resources.filter(r => (!onlyActive || r.active) && (linked.length ? linked.includes(r.id) : r.kind === svc.resource_kind))
}

// ---------------------------------------------------------------- industry templates
export interface Template {
  id: string; label: string; hint: string; emoji: string
  resources: { kind: ResourceKind; name: string; title?: string; capacity?: number; min_capacity?: number }[]
  services: { name: string; category?: string; duration_min: number; buffer_min?: number; price_from?: number; price_to?: number; resource_kind: ResourceKind; party_min?: number; party_max?: number; min_notice_min?: number; description?: string }[]
  hours: [number, string, string][]
}
const WEEK = (o: string, c: string, days = [0, 1, 2, 3, 4]): [number, string, string][] => days.map(d => [d, o, c])
export const TEMPLATES: Template[] = [
  { id: 'barber', label: 'Barbershop / fryzjer', hint: 'Pracownicy, usługi z czasem trwania', emoji: '💈',
    resources: [{ kind: 'staff', name: 'Pracownik 1', title: 'Barber' }, { kind: 'staff', name: 'Pracownik 2', title: 'Barber' }],
    services: [
      { name: 'Strzyżenie męskie', category: 'Włosy', duration_min: 45, buffer_min: 15, price_from: 80, resource_kind: 'staff' },
      { name: 'Strzyżenie + broda', category: 'Włosy', duration_min: 75, buffer_min: 15, price_from: 130, resource_kind: 'staff' },
      { name: 'Trymowanie brody', category: 'Broda', duration_min: 30, buffer_min: 10, price_from: 60, resource_kind: 'staff' },
      { name: 'Strzyżenie dziecięce', category: 'Włosy', duration_min: 30, buffer_min: 10, price_from: 60, resource_kind: 'staff' },
    ], hours: [...WEEK('09:00', '19:00'), [5, '09:00', '15:00']] },
  { id: 'beauty', label: 'Salon beauty / kosmetyczka', hint: 'Zabiegi, stylistki, gabinety', emoji: '💅',
    resources: [{ kind: 'staff', name: 'Stylistka 1', title: 'Stylistka' }, { kind: 'staff', name: 'Stylistka 2', title: 'Kosmetolożka' }],
    services: [
      { name: 'Manicure hybrydowy', category: 'Paznokcie', duration_min: 75, buffer_min: 15, price_from: 120, resource_kind: 'staff' },
      { name: 'Pedicure', category: 'Paznokcie', duration_min: 60, buffer_min: 15, price_from: 140, resource_kind: 'staff' },
      { name: 'Henna brwi i rzęs', category: 'Twarz', duration_min: 30, buffer_min: 10, price_from: 60, resource_kind: 'staff' },
      { name: 'Oczyszczanie twarzy', category: 'Twarz', duration_min: 60, buffer_min: 15, price_from: 180, resource_kind: 'staff' },
    ], hours: [...WEEK('09:00', '20:00'), [5, '09:00', '16:00']] },
  { id: 'restaurant', label: 'Restauracja / kawiarnia', hint: 'Stoliki z liczbą miejsc, czas rezerwacji', emoji: '🍽️',
    resources: [
      { kind: 'table', name: 'Stolik 1', title: 'Przy oknie', capacity: 2 }, { kind: 'table', name: 'Stolik 2', capacity: 2 },
      { kind: 'table', name: 'Stolik 3', capacity: 4, min_capacity: 2 }, { kind: 'table', name: 'Stolik 4', capacity: 4, min_capacity: 2 },
      { kind: 'table', name: 'Stół 5', title: 'Duży stół', capacity: 8, min_capacity: 5 },
    ],
    services: [{ name: 'Rezerwacja stolika', category: 'Stoliki', duration_min: 120, buffer_min: 15, resource_kind: 'table', party_min: 1, party_max: 8, description: 'Stolik rezerwujemy na 2 godziny.' }],
    hours: [...WEEK('12:00', '22:00', [0, 1, 2, 3]), [4, '12:00', '23:00'], [5, '12:00', '23:00'], [6, '12:00', '21:00']] },
  { id: 'catering', label: 'Catering / eventy', hint: 'Ekipy, liczba gości, rezerwacja z wyprzedzeniem', emoji: '🥂',
    resources: [{ kind: 'team', name: 'Ekipa A', title: 'Obsługa eventów', capacity: 120, min_capacity: 10 }, { kind: 'team', name: 'Ekipa B', title: 'Catering', capacity: 60, min_capacity: 10 }],
    services: [
      { name: 'Catering okolicznościowy', category: 'Eventy', duration_min: 300, buffer_min: 120, resource_kind: 'team', party_min: 10, party_max: 120, min_notice_min: 7 * 1440, description: 'Menu ustalamy indywidualnie, cena za osobę od 120 zł.' },
      { name: 'Lunch firmowy', category: 'Firmy', duration_min: 120, buffer_min: 60, resource_kind: 'team', party_min: 10, party_max: 60, min_notice_min: 3 * 1440 },
      { name: 'Degustacja menu', category: 'Spotkania', duration_min: 60, resource_kind: 'staff', min_notice_min: 1440 },
    ],
    hours: [...WEEK('08:00', '22:00', [0, 1, 2, 3, 4, 5, 6])] },
  { id: 'clinic', label: 'Gabinet / fizjoterapia / lekarz', hint: 'Specjaliści, wizyty, gabinety', emoji: '🩺',
    resources: [{ kind: 'staff', name: 'Specjalista 1', title: 'Fizjoterapeuta' }, { kind: 'staff', name: 'Specjalista 2', title: 'Fizjoterapeutka' }],
    services: [
      { name: 'Konsultacja', category: 'Wizyty', duration_min: 30, buffer_min: 10, price_from: 150, resource_kind: 'staff' },
      { name: 'Terapia manualna', category: 'Terapia', duration_min: 50, buffer_min: 10, price_from: 200, resource_kind: 'staff' },
      { name: 'Masaż leczniczy', category: 'Terapia', duration_min: 60, buffer_min: 10, price_from: 180, resource_kind: 'staff' },
    ], hours: WEEK('08:00', '20:00') },
  { id: 'garage', label: 'Warsztat / serwis', hint: 'Stanowiska, usługi na czas', emoji: '🔧',
    resources: [{ kind: 'room', name: 'Stanowisko 1', title: 'Podnośnik' }, { kind: 'room', name: 'Stanowisko 2', title: 'Wymiana opon' }],
    services: [
      { name: 'Wymiana opon', category: 'Opony', duration_min: 45, buffer_min: 15, price_from: 120, resource_kind: 'room' },
      { name: 'Wymiana oleju', category: 'Serwis', duration_min: 60, price_from: 150, resource_kind: 'room' },
      { name: 'Przegląd przed sezonem', category: 'Serwis', duration_min: 90, price_from: 250, resource_kind: 'room' },
    ], hours: [...WEEK('08:00', '18:00'), [5, '08:00', '13:00']] },
  { id: 'studio', label: 'Studio / zajęcia grupowe', hint: 'Sale, zajęcia dla kilku osób', emoji: '🧘',
    resources: [{ kind: 'room', name: 'Sala duża', capacity: 16 }, { kind: 'staff', name: 'Instruktor 1', title: 'Trener personalny' }],
    services: [
      { name: 'Trening personalny', category: 'Treningi', duration_min: 60, price_from: 150, resource_kind: 'staff' },
      { name: 'Wynajem sali', category: 'Sala', duration_min: 60, price_from: 120, resource_kind: 'room', party_min: 1, party_max: 16 },
    ], hours: WEEK('07:00', '21:00', [0, 1, 2, 3, 4, 5]) },
]
