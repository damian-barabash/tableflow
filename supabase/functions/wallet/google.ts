// Google Wallet: loyalty class per program, loyalty object per card, "Save to Google Wallet" JWT links,
// object updates (stamps) and TEXT_AND_NOTIFY messages.
// Secrets: GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA (service-account JSON key, with access to the issuer).
import { SITE, view, type Card, type Company, type Program } from './shared.ts'

const ISSUER = Deno.env.get('GOOGLE_WALLET_ISSUER_ID') ?? ''
const SA_RAW = Deno.env.get('GOOGLE_WALLET_SA') ?? ''
let SA: { client_email: string; private_key: string } | null = null
try { SA = SA_RAW ? JSON.parse(SA_RAW) : null } catch { SA = null }
export const googleReady = () => !!(ISSUER && SA?.client_email && SA?.private_key)
const API = 'https://walletobjects.googleapis.com/walletobjects/v1'

const b64url = (b: Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : b
  let s = ''; for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
let keyP: Promise<CryptoKey> | null = null
function key() {
  if (!keyP) {
    const pem = SA!.private_key.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
    const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0))
    keyP = crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  }
  return keyP
}
async function jwt(payload: Record<string, unknown>) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await key(), new TextEncoder().encode(`${head}.${body}`)))
  return `${head}.${body}.${b64url(sig)}`
}
let token: { v: string; exp: number } | null = null
async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.v
  const now = Math.floor(Date.now() / 1000)
  const assertion = await jwt({ iss: SA!.client_email, scope: 'https://www.googleapis.com/auth/wallet_object.issuer', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}` })
  const j = await r.json()
  if (!r.ok) throw new Error(`google_token_${j.error ?? r.status}`)
  token = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 }
  return token.v
}
async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let j: any = null; try { j = text ? JSON.parse(text) : null } catch { j = text }
  return { ok: r.ok, status: r.status, body: j }
}

const idPart = (uuid: string) => uuid.replace(/-/g, '')
export const classId = (p: { id: string }) => `${ISSUER}.tf_${idPart(p.id)}`
export const objectId = (c: { id: string }) => `${ISSUER}.tf_${idPart(c.id)}`
const pl = (value: string) => ({ defaultValue: { language: 'pl', value } })

export function loyaltyClass(p: Program, company: Company) {
  const d = p.design ?? {}, base = p.assets?.base
  const i = p.info ?? {}
  const links = [
    i.website && { uri: /^https?:/.test(i.website) ? i.website : `https://${i.website}`, description: 'Strona www', id: 'www' },
    i.phone && { uri: `tel:${String(i.phone).replace(/\s+/g, '')}`, description: 'Zadzwoń', id: 'tel' },
  ].filter(Boolean)
  return {
    id: classId(p),
    issuerName: company.name.slice(0, 40),
    programName: p.name.slice(0, 40),
    programLogo: { sourceUri: { uri: base ? `${base}/logo-square.png` : `${SITE}/icon-512.png` }, contentDescription: pl(company.name) },
    hexBackgroundColor: d.pass_bg ?? d.bg ?? '#1a1916',
    reviewStatus: 'UNDER_REVIEW',
    countryCode: 'PL',
    multipleDevicesAndHoldersAllowedStatus: 'ONE_USER_ALL_DEVICES',
    localizedRewardsTier: undefined,
    textModulesData: [
      { id: 'reward', header: 'Nagroda', body: `${p.reward} — za ${p.stamps_required} pieczątek` },
      ...(i.description ? [{ id: 'desc', header: 'O programie', body: String(i.description) }] : []),
      ...(i.hours ? [{ id: 'hours', header: 'Godziny otwarcia', body: String(i.hours) }] : []),
      ...(i.address ? [{ id: 'addr', header: 'Adres', body: String(i.address) }] : []),
      ...(i.terms ? [{ id: 'terms', header: 'Regulamin', body: String(i.terms) }] : []),
    ],
    linksModuleData: links.length ? { uris: links } : undefined,
  }
}

export function loyaltyObject(card: Card) {
  const v = view(card)
  return {
    id: objectId(card),
    classId: classId(card.program),
    state: card.status === 'active' ? 'ACTIVE' : 'INACTIVE',
    accountId: card.code,
    accountName: card.customer_name || card.code,
    loyaltyPoints: { label: 'Pieczątki', balance: { string: `${v.shown}/${v.req}` } },
    secondaryLoyaltyPoints: { label: 'Nagrody', balance: { int: v.ready } },
    barcode: { type: 'QR_CODE', value: v.url, alternateText: card.code },
    heroImage: v.img ? { sourceUri: { uri: v.img.strip3 }, contentDescription: pl(`${v.shown} z ${v.req} pieczątek`) } : undefined,
    textModulesData: card.last_message ? [{ id: 'msg', header: 'Wiadomość', body: card.last_message }] : [],
    linksModuleData: { uris: [{ uri: v.cardUrl, description: 'Karta online', id: 'online' }] },
  }
}

/** Creates or refreshes the class (design / texts). */
export async function upsertClass(p: Program, company: Company) {
  const cls = loyaltyClass(p, company)
  const got = await api('GET', `/loyaltyClass/${cls.id}`)
  const r = got.ok ? await api('PUT', `/loyaltyClass/${cls.id}`, { ...cls, reviewStatus: 'UNDER_REVIEW' }) : await api('POST', '/loyaltyClass', cls)
  if (!r.ok) throw new Error(`google_class_${r.status}: ${JSON.stringify(r.body?.error?.message ?? r.body).slice(0, 200)}`)
}

/** Creates the class only if it doesn't exist yet (design changes go through upsertClass on publish) —
 *  re-sending an approved class on every customer tap would put it back under review. */
async function ensureClass(p: Program, company: Company) {
  const got = await api('GET', `/loyaltyClass/${classId(p)}`)
  if (got.ok) return
  const r = await api('POST', '/loyaltyClass', loyaltyClass(p, company))
  if (!r.ok && r.status !== 409) throw new Error(`google_class_${r.status}: ${JSON.stringify(r.body?.error?.message ?? r.body).slice(0, 200)}`)
}

/** "Add to Google Wallet" link (the object is created when the customer saves it). */
export async function saveUrl(card: Card) {
  await ensureClass(card.program, card.company)
  const now = Math.floor(Date.now() / 1000)
  const token = await jwt({ iss: SA!.client_email, aud: 'google', typ: 'savetowallet', iat: now, origins: [SITE], payload: { loyaltyObjects: [loyaltyObject(card)] } })
  return `https://pay.google.com/gp/v/save/${token}`
}

/** Pushes the current state; returns true when the object exists (= customer saved the card). */
export async function updateObject(card: Card): Promise<boolean> {
  const obj = loyaltyObject(card)
  const r = await api('PUT', `/loyaltyObject/${obj.id}`, obj)
  return r.ok
}
export async function addMessage(card: Card, header: string, body: string): Promise<boolean> {
  const r = await api('POST', `/loyaltyObject/${objectId(card)}/addMessage`, {
    message: { id: crypto.randomUUID(), header: header.slice(0, 60), body: body.slice(0, 500), messageType: 'TEXT_AND_NOTIFY', displayInterval: { start: { date: new Date().toISOString() } } },
  })
  return r.ok
}
