/**
 * Data layer for /panel and /admin: PostgREST, RPC, edge functions and storage with the user's JWT
 * (no supabase-js, same approach as the landing).
 */
import { authFetch, getValidSession } from '../lib/auth'
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabase'

export class ApiError extends Error {
  code: string
  constructor(code: string) { super(code); this.code = code }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!res.ok) {
    const b = body as { message?: string; error?: string; msg?: string } | null
    throw new ApiError(b?.message || b?.error || b?.msg || `http_${res.status}`)
  }
  return body as T
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return parse<T>(await authFetch(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }))
}
export async function get<T>(pathAndQuery: string): Promise<T> {
  return parse<T>(await authFetch(`/rest/v1/${pathAndQuery}`))
}
export async function insert<T = unknown>(table: string, row: unknown): Promise<T> {
  const r = await parse<T[]>(await authFetch(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }))
  return r[0]
}
export async function update<T = unknown>(table: string, filter: string, patch: unknown): Promise<T[]> {
  return parse<T[]>(await authFetch(`/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) }))
}
export async function remove(table: string, filter: string): Promise<void> {
  await parse(await authFetch(`/rest/v1/${table}?${filter}`, { method: 'DELETE' }))
}
export async function upsert(table: string, row: unknown, onConflict: string): Promise<void> {
  await parse(await authFetch(`/rest/v1/${table}?on_conflict=${onConflict}`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) }))
}

/** Edge function with the user's JWT. */
export async function fn<T>(name: string, body: unknown): Promise<T> {
  return parse<T>(await authFetch(`/functions/v1/${name}`, { method: 'POST', body: JSON.stringify(body) }))
}
export const WALLET_URL = `${SUPABASE_URL}/functions/v1/wallet`
export async function walletStatus(): Promise<{ apple: boolean; google: boolean; pass_type_id: string | null; web_service: string }> {
  try { const r = await fetch(`${WALLET_URL}/status`); return await r.json() } catch { return { apple: false, google: false, pass_type_id: null, web_service: '' } }
}

// ---------- storage (public bucket "wallet") ----------
export const publicUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/wallet/${path}`
export async function upload(path: string, blob: Blob, contentType = blob.type || 'image/png'): Promise<string> {
  const s = await getValidSession()
  if (!s) throw new ApiError('no_session')
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/wallet/${path}`, {
    method: 'POST', body: blob,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': contentType, 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' },
  })
  await parse(res)
  return publicUrl(path)
}

// ---------- public (anon) RPC for the customer-facing pages ----------
export async function anonRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  return parse<T>(res)
}

/** Human (Polish) text for error codes raised by our RPCs / functions. */
export function errText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : String(e)
  const map: Record<string, string> = {
    forbidden: 'Brak uprawnień do tej operacji.', not_found: 'Nie znaleziono.', no_session: 'Sesja wygasła — zaloguj się ponownie.',
    invalid_email: 'Nieprawidłowy adres e-mail.', invalid_phone: 'Nieprawidłowy numer telefonu.', invalid_name: 'Podaj imię (min. 2 znaki).',
    exists: 'Taki klient lub konto już istnieje.', card_blocked: 'Karta jest zablokowana.', too_many: 'Za dużo pieczątek naraz.',
    not_enough: 'Za mało pieczątek, aby odebrać nagrodę.', last_owner: 'Firma musi mieć co najmniej jednego właściciela.', self: 'Nie możesz zmienić własnego konta w ten sposób.',
    rate_limited: 'Zbyt wiele prób — spróbuj za kilka minut.', email_required: 'E-mail jest wymagany.', phone_required: 'Telefon jest wymagany.',
    contact_required: 'Podaj e-mail lub telefon.', program_not_found: 'Ten program lojalnościowy jest nieaktywny.',
  }
  return map[code] ?? (code.startsWith('http_') || code === 'Failed to fetch' ? 'Błąd połączenia — spróbuj ponownie.' : code)
}
