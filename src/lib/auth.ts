import { SUPABASE_KEY, SUPABASE_URL } from './supabase'

export interface Session { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string; login: string } }
const KEY = 'tf_editor_auth'
const DOMAIN = 'tableflow.pl'

export function readSession(): Session | null {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) as Session : null } catch { return null }
}
function writeSession(s: Session | null) { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY) } catch { /* ignore */ } }

function toSession(j: { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string; user_metadata?: { login?: string } } }): Session {
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in - 30) * 1000, user: { id: j.user.id, email: j.user.email, login: j.user.user_metadata?.login || j.user.email.split('@')[0] } }
}

/** Login accepts a short login ("jakub") or a full e-mail. */
export async function signIn(login: string, password: string): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const email = login.includes('@') ? login.trim() : `${login.trim().toLowerCase()}@${DOMAIN}`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) return { ok: false, error: j.error_description || j.msg || j.message || 'invalid' }
  const s = toSession(j); writeSession(s); return { ok: true, session: s }
}

export async function refresh(): Promise<Session | null> {
  const s = readSession(); if (!s) return null
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) { writeSession(null); return null }
  const n = toSession(j); writeSession(n); return n
}

export async function getValidSession(): Promise<Session | null> {
  const s = readSession(); if (!s) return null
  if (Date.now() < s.expires_at) return s
  return refresh()
}

export async function signOut() {
  const s = readSession()
  if (s) { try { await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}` } }) } catch { /* ignore */ } }
  writeSession(null)
}

/** PostgREST fetch with the editor's JWT; retries once after a refresh on 401. */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let s = await getValidSession()
  if (!s) throw new Error('no_session')
  const go = (tok: string) => fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })
  let res = await go(s.access_token)
  if (res.status === 401) { s = await refresh(); if (!s) throw new Error('no_session'); res = await go(s.access_token) }
  return res
}

export async function fetchRole(userId: string): Promise<string | null> {
  const res = await authFetch(`/rest/v1/admin_profiles?select=role&user_id=eq.${userId}`)
  if (!res.ok) return null
  const rows = await res.json() as { role: string }[]
  return rows[0]?.role ?? null
}
