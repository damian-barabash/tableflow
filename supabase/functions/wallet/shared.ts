// Shared bits of the wallet function: service-role REST, card loading, the card "view model".
export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
export const SITE = Deno.env.get('SITE_URL') ?? 'https://tableflow.pl'
export const BASE = `${SUPABASE_URL}/functions/v1/wallet`

export const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' }
export const json = (b: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } })

export async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })
  const text = await r.text()
  let body: any = null; try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { ok: r.ok, status: r.status, body }
}

/** Calls a boolean RPC with the caller's own JWT (RLS helpers: can_access_company / can_manage_company). */
export async function userCan(auth: string | null, fn: 'can_access_company' | 'can_manage_company', cid: string): Promise<boolean> {
  if (!auth) return false
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ cid }) })
  return r.ok && (await r.json()) === true
}
export async function userId(auth: string | null): Promise<string | null> {
  if (!auth) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } })
  return r.ok ? (await r.json()).id : null
}

export interface Program {
  id: string; company_id: string; slug: string; name: string; status: string; stamps_required: number; reward: string
  design: Record<string, any>; info: Record<string, any>; assets: { version?: number; base?: string; strips?: number }; published_at: string | null; updated_at: string
}
export interface Company { id: string; name: string; logo_url: string | null; website: string | null; phone: string | null; address: string | null; city: string | null }
export interface Card {
  id: string; program_id: string; company_id: string; code: string; token: string; customer_name: string; stamps: number; total_stamps: number
  rewards_redeemed: number; status: string; apple_devices: number; google_saved: boolean; google_clicked_at: string | null; last_message: string | null; updated_at: string
  program: Program; company: Company
}
const SELECT = 'select=*,program:loyalty_programs(*),company:companies(id,name,logo_url,website,phone,address,city)'
export async function cardBy(field: 'id' | 'token' | 'code', value: string): Promise<Card | null> {
  if (!/^[0-9A-Za-z-]{6,64}$/.test(value)) return null
  const r = await db(`/rest/v1/loyalty_cards?${SELECT}&${field}=eq.${value}`)
  return r.body?.[0] ?? null
}
export async function cardsWhere(filter: string): Promise<Card[]> {
  const r = await db(`/rest/v1/loyalty_cards?${SELECT}&${filter}`)
  return r.ok ? r.body : []
}

/** Everything a wallet pass shows, derived once for Apple and Google. */
export function view(card: Card) {
  const p = card.program, req = p.stamps_required
  const shown = Math.min(card.stamps, req)
  const ready = Math.floor(card.stamps / req)
  const d = p.design ?? {}
  const base = p.assets?.base ?? ''
  return {
    req, shown, ready,
    title: p.name, reward: p.reward, company: card.company.name,
    bg: hex(d.pass_bg ?? d.bg ?? '#1a1916'), fg: hex(d.fg ?? '#ffffff'), label: hex(d.label ?? d.fg ?? '#e6e1ea'),
    logoText: d.logo_text ?? '',
    img: base ? {
      icon: [`${base}/icon.png`, `${base}/icon@2x.png`, `${base}/icon@3x.png`],
      logo: [`${base}/logo.png`, `${base}/logo@2x.png`, `${base}/logo@3x.png`],
      strip2: `${base}/strip-${shown}@2x.png`, strip3: `${base}/strip-${shown}@3x.png`,
      square: `${base}/logo-square.png`,
    } : null,
    url: `${SITE}/s?c=${card.code}`,
    cardUrl: `${SITE}/moja-karta?t=${card.token}`,
    info: p.info ?? {},
  }
}
export function hex(s: string): string { return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : '#1a1916' }
export function rgb(h: string): string { const n = parseInt(hex(h).slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})` }
