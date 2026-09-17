// Supabase Edge Function: translate changed dictionary texts from Polish into one target language
// via the Barabash AI gateway (OpenAI-compatible). The API key lives only in Supabase secrets.
// Caller must be a logged-in editor (JWT verified by the platform + is_editor() check here).
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const BAI_URL = Deno.env.get('BAI_URL') ?? ''
const BAI_KEY = Deno.env.get('BAI_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const MODEL = Deno.env.get('BAI_TRANSLATE_MODEL') ?? 'qwen3.5:9b'
const LANG: Record<string, string> = { en: 'English', ru: 'Russian', fr: 'French', es: 'Spanish', pl: 'Polish' }
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function isEditor(auth: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_editor`, { method: 'POST', headers: { apikey: ANON, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}' })
  if (!r.ok) return false
  return (await r.json()) === true
}

function extractJson(s: string): Record<string, string> | null {
  const t = s.replace(/```(?:json)?/gi, '').trim()
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a < 0 || b < 0) return null
  try { const o = JSON.parse(t.slice(a, b + 1)); return o && typeof o === 'object' ? o : null } catch { return null }
}
const tagsOf = (s: string) => (s.match(/<\/?[a-z][^>]*>|\{[a-z_]+\}/gi) || []).map(x => x.replace(/\s+/g, '')).sort().join('|')

async function chat(system: string, user: string, temperature: number): Promise<string> {
  const r = await fetch(`${BAI_URL}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${BAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature, think: false, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  })
  if (!r.ok) throw new Error(`gateway_${r.status}`)
  const j = await r.json()
  return j.choices?.[0]?.message?.content ?? ''
}

async function translateChunk(items: Record<string, string>, target: string, attempt = 0): Promise<{ ok: Record<string, string>; failed: string[] }> {
  const lang = LANG[target] ?? target
  const system = [
    `You are a professional localisation translator for a SaaS landing page (TableFlow AI — an AI receptionist for cafés, barbershops, clinics).`,
    `Translate the VALUES of the given JSON object from Polish into ${lang}.`,
    `Rules: return ONLY a JSON object with exactly the same keys and translated string values. No commentary, no markdown.`,
    `Keep inline tags exactly as they are and in place: <g>…</g>, <b>…</b>, <i>…</i>, <br>, <span …>…</span>. Keep placeholders like {lang}.`,
    `Keep brand and product names untranslated: TableFlow, TableFlow AI, Apple Wallet, Google Wallet, WhatsApp, SMS, App Store, Google Play, Barber Bracia, Kawiarnia Ziarno, Studio Ola, Trattoria Nonna, Auto Max Serwis.`,
    `Each translation must be a natural, concise ${lang} equivalent of similar length — never add sentences, explanations or extra text. Short labels stay short.`,
    attempt > 0 ? `IMPORTANT: your previous answer was rejected (wrong keys, added text or broken tags). Answer strictly with the JSON object.` : '',
  ].join('\n')
  const raw = await chat(system, JSON.stringify(items), attempt === 0 ? 0.2 : 0.1)
  const out = extractJson(raw) || {}
  const ok: Record<string, string> = {}; const failed: string[] = []
  for (const [k, src] of Object.entries(items)) {
    const v = out[k]
    const good = typeof v === 'string' && v.trim().length > 0 && v.length <= Math.max(60, src.length * 3) && tagsOf(v) === tagsOf(src)
    if (good) ok[k] = v.trim(); else failed.push(k)
  }
  if (failed.length && attempt < 2) {
    const retry = await translateChunk(Object.fromEntries(failed.map(k => [k, items[k]])), target, attempt + 1)
    return { ok: { ...ok, ...retry.ok }, failed: retry.failed }
  }
  return { ok, failed }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const auth = req.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)
  if (!(await isEditor(auth))) return json({ error: 'forbidden' }, 403)
  if (!BAI_URL || !BAI_KEY) return json({ error: 'not_configured' }, 500)
  let body: { items?: { path: string; text: string }[]; target?: string }
  try { body = await req.json() } catch { return json({ error: 'bad_json' }, 400) }
  const target = String(body.target || '')
  const items = (body.items || []).filter(i => i && typeof i.path === 'string' && typeof i.text === 'string' && i.text.trim())
  if (!LANG[target] || target === 'pl') return json({ error: 'bad_target' }, 400)
  if (!items.length) return json({ target, translations: {}, failed: [] })
  if (items.length > 400) return json({ error: 'too_many' }, 413)
  const t0 = Date.now()
  // chunk by size so a single completion stays small and fast
  const chunks: Record<string, string>[] = []; let cur: Record<string, string> = {}; let size = 0
  for (const it of items) {
    if (size > 1800 || Object.keys(cur).length >= 12) { chunks.push(cur); cur = {}; size = 0 }
    cur[it.path] = it.text; size += it.text.length
  }
  if (Object.keys(cur).length) chunks.push(cur)
  const translations: Record<string, string> = {}; const failed: string[] = []
  try {
    for (const c of chunks) { const r = await translateChunk(c, target); Object.assign(translations, r.ok); failed.push(...r.failed) }
  } catch (e) {
    return json({ error: String((e as Error).message || e), target, translations, failed: items.map(i => i.path).filter(p => !(p in translations)) }, 502)
  }
  return json({ target, translations, failed, ms: Date.now() - t0, model: MODEL })
})
