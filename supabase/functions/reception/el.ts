// ElevenLabs API client. The key is kept in Supabase Vault (rc_el_api_key) and can be replaced from /admin.
import { secret } from './shared.ts'

const API = 'https://api.elevenlabs.io'
let cached: { key: string; at: number } | null = null

export async function elKey(): Promise<string | null> {
  if (cached && Date.now() - cached.at < 30_000) return cached.key
  const k = await secret('rc_el_api_key')
  cached = k ? { key: k, at: Date.now() } : null
  return k
}
export function forgetKey() { cached = null }

export class ElError extends Error {
  status: number; detail: unknown
  constructor(status: number, detail: unknown) {
    const d = detail as any
    super(typeof d?.detail === 'string' ? d.detail : d?.detail?.message ?? d?.message ?? `elevenlabs_${status}`)
    this.status = status; this.detail = detail
  }
}

export async function el<T = any>(path: string, init: RequestInit & { key?: string } = {}): Promise<T> {
  const key = init.key ?? await elKey()
  if (!key) throw new ElError(401, { detail: 'Brak klucza ElevenLabs — ustaw go w administracji.' })
  const headers: Record<string, string> = { 'xi-api-key': key, ...(init.headers as Record<string, string> || {}) }
  if (init.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json'
  const r = await fetch(`${API}${path}`, { ...init, headers })
  if (!r.ok) {
    const text = await r.text()
    let body: unknown = text; try { body = JSON.parse(text) } catch { /* */ }
    throw new ElError(r.status, body)
  }
  if (r.status === 204) return null as T
  const ct = r.headers.get('content-type') ?? ''
  return (ct.includes('json') ? await r.json() : await r.arrayBuffer()) as T
}
export const elJson = <T = any>(path: string, method: string, body: unknown, key?: string) => el<T>(path, { method, body: JSON.stringify(body), key })

/** Human message for the admin/panel. */
export function elMessage(e: unknown): string {
  if (e instanceof ElError) {
    const d = e.detail as any
    if (d?.detail?.status === 'missing_permissions' || /missing the permission/.test(e.message)) return `Klucz ElevenLabs nie ma uprawnień: ${e.message.replace(/.*permission\s+/, '').replace(/\s+to execute.*/, '')}`
    if (e.status === 401) return 'Nieprawidłowy klucz ElevenLabs.'
    if (Array.isArray(d?.detail)) return d.detail.map((x: any) => `${(x.loc ?? []).slice(1).join('.')}: ${x.msg}`).join('; ').slice(0, 600)
    return `${e.message}`.slice(0, 600)
  }
  return e instanceof Error ? e.message : String(e)
}
