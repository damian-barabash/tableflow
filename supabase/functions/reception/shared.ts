// Shared bits of the "reception" function: service-role REST, caller rights, JSON helpers.
export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
export const FN_URL = `${SUPABASE_URL}/functions/v1/reception`
export const SITE = Deno.env.get('SITE_URL') ?? 'https://tableflow.pl'

export const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
export const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
export const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status)

export class HttpError extends Error {
  status: number
  constructor(msg: string, status = 400) { super(msg); this.status = status }
}

export async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })
  const text = await r.text()
  let body: any = null; try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { ok: r.ok, status: r.status, body }
}
/** GET rows or throw */
export async function rows<T = any>(path: string): Promise<T[]> {
  const r = await db(`/rest/v1/${path}`)
  if (!r.ok) throw new Error(`db ${path.split('?')[0]}: ${r.body?.message ?? r.status}`)
  return r.body as T[]
}
export async function one<T = any>(path: string): Promise<T | null> { return (await rows<T>(path))[0] ?? null }
export async function insertRow<T = any>(table: string, row: unknown, prefer = 'return=representation'): Promise<{ ok: boolean; row: T | null; error: any }> {
  const r = await db(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: prefer }, body: JSON.stringify(row) })
  return { ok: r.ok, row: Array.isArray(r.body) ? r.body[0] ?? null : null, error: r.ok ? null : r.body }
}
export async function patch(table: string, filter: string, body: unknown) {
  return db(`/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
}
export async function secret(name: string): Promise<string | null> {
  const r = await db('/rest/v1/rpc/rc_secret', { method: 'POST', body: JSON.stringify({ p_name: name }) })
  return r.ok && typeof r.body === 'string' ? r.body : null
}
export async function setSecret(name: string, value: string | null) {
  const r = await db('/rest/v1/rpc/rc_secret_set', { method: 'POST', body: JSON.stringify({ p_name: name, p_value: value }) })
  if (!r.ok) throw new Error(`vault: ${r.body?.message ?? r.status}`)
}

/** Boolean RPC with the caller's own JWT (RLS helpers). */
export async function userCan(auth: string | null, fn: 'can_access_company' | 'can_manage_company' | 'is_superadmin', cid?: string): Promise<boolean> {
  if (!auth) return false
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(cid ? { cid } : {}) })
  return r.ok && (await r.json()) === true
}
export async function userId(auth: string | null): Promise<string | null> {
  if (!auth) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } })
  return r.ok ? (await r.json()).id : null
}

export async function audit(actor: string | null, action: string, target_type: string, target_id: string, detail: Record<string, unknown>, company_id?: string | null) {
  await db('/rest/v1/audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor, action, target_type, target_id, company_id: company_id ?? null, detail }) })
}

/** Same rule as SQL rc_phone(): digits, 9 digits → 48…, 10–15 digits kept. */
export function normPhone(p: unknown): string | null {
  const d = String(p ?? '').replace(/\D/g, '')
  if (d.length === 9) return '48' + d
  if (d.length >= 10 && d.length <= 15) return d
  return null
}
/** "48600123456" → "+48 600 123 456" (for humans and for the AI to read back). */
export function prettyPhone(d: string | null): string {
  if (!d) return ''
  if (d.startsWith('48') && d.length === 11) return `+48 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
  return '+' + d
}
/** lower-case, no Polish diacritics, single spaces — for fuzzy name matching */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}
