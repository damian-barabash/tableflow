// Wall-clock ↔ instant conversion for a business time zone (Europe/Warsaw by default), without libraries.

export interface Parts { y: number; m: number; d: number; h: number; mi: number; wd: number }

const fmts = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string) {
  let f = fmts.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    fmts.set(tz, f)
  }
  return f
}
/** Local parts of an instant; wd: 0 = Monday … 6 = Sunday */
export function parts(date: Date, tz: string): Parts {
  const o: Record<string, number> = {}
  for (const p of fmt(tz).formatToParts(date)) if (p.type !== 'literal') o[p.type] = Number(p.value)
  const wd = (new Date(Date.UTC(o.year, o.month - 1, o.day)).getUTCDay() + 6) % 7
  return { y: o.year, m: o.month, d: o.day, h: o.hour, mi: o.minute, wd }
}
function offsetMin(date: Date, tz: string): number {
  const p = parts(date, tz)
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi)
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000)
}
/** Instant of a local wall-clock time. */
export function zoned(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d, 0, minutes)
  const o1 = offsetMin(new Date(t), tz)
  let r = t - o1 * 60000
  const o2 = offsetMin(new Date(r), tz)
  if (o2 !== o1) r = t - o2 * 60000
  return new Date(r)
}
export const pad = (n: number) => String(n).padStart(2, '0')
export const dateStr = (p: { y: number; m: number; d: number }) => `${p.y}-${pad(p.m)}-${pad(p.d)}`
export const localDate = (date: Date, tz: string) => dateStr(parts(date, tz))
export const localTime = (date: Date, tz: string) => { const p = parts(date, tz); return `${pad(p.h)}:${pad(p.mi)}` }
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}
/** "14:30" / "14.30" / "14" / "1430" → minutes after midnight */
export function toMin(t: unknown): number | null {
  const s = String(t ?? '').trim()
  let m = s.match(/^(\d{1,2})(?:[:.h ](\d{2}))?$/)
  if (!m) m = s.match(/^(\d{2})(\d{2})$/)
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2] ?? 0)
  return h < 24 && mi < 60 ? h * 60 + mi : null
}
export const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))

export const WEEKDAYS = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
/** "czwartek, 2 października" */
export function spoken(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${WEEKDAYS[weekday(date)]}, ${d} ${MONTHS[m - 1]}`
}

const ONES = ['zero', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć', 'dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście']
const TENS = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt']
const HOURS = ['zero', 'pierwsza', 'druga', 'trzecia', 'czwarta', 'piąta', 'szósta', 'siódma', 'ósma', 'dziewiąta', 'dziesiąta', 'jedenasta', 'dwunasta', 'trzynasta', 'czternasta', 'piętnasta', 'szesnasta', 'siedemnasta', 'osiemnasta', 'dziewiętnasta', 'dwudziesta', 'dwudziesta pierwsza', 'dwudziesta druga', 'dwudziesta trzecia']
/** How a receptionist reads a clock time out loud: 585 → "dziewiąta czterdzieści pięć", 780 → "trzynasta" (never "kwadrans", "wpół do"). */
export function spokenTime(min: number): string {
  const h = Math.floor(min / 60) % 24, m = min % 60
  if (!m) return HOURS[h]
  const mm = m < 10 ? `zero ${ONES[m]}` : m < 20 ? ONES[m] : `${TENS[Math.floor(m / 10)]}${m % 10 ? ` ${ONES[m % 10]}` : ''}`
  return `${HOURS[h]} ${mm}`
}
/** "13:45" → `13:45 („trzynasta czterdzieści pięć”)` — the form tools hand to the agent. */
export const sayTime = (min: number) => `${hhmm(min)} („${spokenTime(min)}”)`

/** The next days as a lookup table for the prompt — the LLM must not do weekday arithmetic in its head. */
export function calendarText(now: Date, tz: string, days = 15): string {
  const today = localDate(now, tz), p = parts(now, tz)
  const label = (i: number) => i === 0 ? 'dziś' : i === 1 ? 'jutro' : i === 2 ? 'pojutrze' : ''
  const lines = Array.from({ length: days }, (_, i) => { const d = addDays(today, i); return `${d} — ${spoken(d)}${label(i) ? ` (${label(i)})` : ''}` })
  return `Teraz: ${spoken(today)}, godzina ${pad(p.h)}:${pad(p.mi)}.\n${lines.join('\n')}`
}
