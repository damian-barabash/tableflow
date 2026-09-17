import { SUPABASE_KEY, SUPABASE_URL } from './supabase'
import { authFetch } from './auth'
import type { Dict, Locale } from '../i18n/types'

/** Overrides = flat map of dictionary paths ("hero.sub", "faq.items.2.q") → text. */
export type Overrides = Record<string, string>

export function flatten(obj: unknown, prefix = '', out: Map<string, string> = new Map()): Map<string, string> {
  if (typeof obj === 'string') { out.set(prefix, obj); return out }
  if (Array.isArray(obj)) { obj.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), out)); return out }
  if (obj && typeof obj === 'object') { for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out) }
  return out
}

/** Deep-clones the dict and sets every override path (unknown paths are ignored). */
export function applyOverrides(dict: Dict, ov: Overrides | null | undefined): Dict {
  if (!ov || !Object.keys(ov).length) return dict
  const copy = JSON.parse(JSON.stringify(dict)) as Dict
  for (const [path, val] of Object.entries(ov)) {
    if (typeof val !== 'string') continue
    const parts = path.split('.')
    let cur: unknown = copy
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur == null || typeof cur !== 'object') { cur = null; break }
      cur = (cur as Record<string, unknown>)[parts[i]]
    }
    if (cur && typeof cur === 'object') {
      const last = parts[parts.length - 1]
      if (typeof (cur as Record<string, unknown>)[last] === 'string') (cur as Record<string, unknown>)[last] = val
    }
  }
  return copy
}

const cache = new Map<string, Promise<Overrides>>()
export function fetchPublished(locale: Locale): Promise<Overrides> {
  if (!cache.has(locale)) {
    cache.set(locale, fetch(`${SUPABASE_URL}/rest/v1/site_content?select=data&locale=eq.${locale}&status=eq.published`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
      .then(r => r.ok ? r.json() : [])
      .then((rows: { data: Overrides }[]) => rows[0]?.data ?? {})
      .catch(() => ({})))
  }
  return cache.get(locale)!
}
export function invalidatePublished(locale: Locale) { cache.delete(locale) }

/** Editor: draft if it exists, otherwise published. */
export async function fetchDraftOrPublished(locale: Locale): Promise<{ data: Overrides; status: 'draft' | 'published' | 'none' }> {
  const res = await authFetch(`/rest/v1/site_content?select=status,data&locale=eq.${locale}`)
  if (!res.ok) return { data: {}, status: 'none' }
  const rows = await res.json() as { status: 'draft' | 'published'; data: Overrides }[]
  const d = rows.find(r => r.status === 'draft'); if (d) return { data: d.data, status: 'draft' }
  const p = rows.find(r => r.status === 'published'); if (p) return { data: p.data, status: 'published' }
  return { data: {}, status: 'none' }
}

async function upsert(locale: Locale, status: 'draft' | 'published', data: Overrides) {
  const res = await authFetch('/rest/v1/site_content?on_conflict=locale,status', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ locale, status, data }) })
  if (!res.ok) throw new Error(`save_failed_${res.status}`)
}
export async function saveDraft(locale: Locale, data: Overrides) { await upsert(locale, 'draft', data) }
export async function publish(locale: Locale, data: Overrides) { await upsert(locale, 'published', data); await upsert(locale, 'draft', data); invalidatePublished(locale) }

/** Editor: the published row of any locale (read with the editor's JWT). */
export async function fetchPublishedAuth(locale: Locale): Promise<Overrides> {
  const res = await authFetch(`/rest/v1/site_content?select=data&locale=eq.${locale}&status=eq.published`)
  if (!res.ok) return {}
  const rows = await res.json() as { data: Overrides }[]
  return rows[0]?.data ?? {}
}

export interface TranslateResult { translations: Overrides; failed: string[]; error?: string }
/** Edge function `translate`: Polish → one target language. The AI key never leaves the server. */
export async function translateTexts(target: Locale, items: { path: string; text: string }[]): Promise<TranslateResult> {
  if (!items.length) return { translations: {}, failed: [] }
  const res = await authFetch('/functions/v1/translate', { method: 'POST', body: JSON.stringify({ target, items }) })
  const j = await res.json().catch(() => ({})) as Partial<TranslateResult> & { error?: string }
  if (!res.ok) return { translations: j.translations ?? {}, failed: j.failed ?? items.map(i => i.path), error: j.error || `http_${res.status}` }
  return { translations: j.translations ?? {}, failed: j.failed ?? [] }
}
