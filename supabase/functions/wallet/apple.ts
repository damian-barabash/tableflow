// Apple Wallet: .pkpass generation (PKCS#7-signed manifest) + APNs update pushes.
// Secrets: APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT (PEM), APPLE_PASS_KEY (PEM), optional APPLE_PASS_KEY_PASSWORD.
import forge from 'npm:node-forge@1.3.1'
import { zipSync } from 'npm:fflate@0.8.2'
import { WWDR_G4 } from './wwdr.ts'
import { BASE, SITE, rgb, view, type Card } from './shared.ts'

export const PASS_TYPE_ID = Deno.env.get('APPLE_PASS_TYPE_ID') ?? ''
const TEAM_ID = Deno.env.get('APPLE_TEAM_ID') ?? ''
const CERT_PEM = (Deno.env.get('APPLE_PASS_CERT') ?? '').replace(/\\n/g, '\n')
const KEY_PEM_RAW = (Deno.env.get('APPLE_PASS_KEY') ?? '').replace(/\\n/g, '\n')
const KEY_PASS = Deno.env.get('APPLE_PASS_KEY_PASSWORD') ?? ''
export const appleReady = () => !!(PASS_TYPE_ID && TEAM_ID && CERT_PEM && KEY_PEM_RAW)

let signer: { cert: forge.pki.Certificate; key: forge.pki.PrivateKey; wwdr: forge.pki.Certificate; keyPem: string } | null = null
function getSigner() {
  if (signer) return signer
  const cert = forge.pki.certificateFromPem(CERT_PEM)
  const key = KEY_PEM_RAW.includes('ENCRYPTED') ? forge.pki.decryptRsaPrivateKey(KEY_PEM_RAW, KEY_PASS) : forge.pki.privateKeyFromPem(KEY_PEM_RAW)
  if (!key) throw new Error('apple_key_decrypt_failed')
  signer = { cert, key, wwdr: forge.pki.certificateFromPem(WWDR_G4), keyPem: forge.pki.privateKeyToPem(key) }
  return signer
}

const enc = new TextEncoder()
async function sha1(b: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', b as BufferSource)), x => x.toString(16).padStart(2, '0')).join('') }
async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try { const r = await fetch(url); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null } catch { return null }
}

export function passJson(card: Card) {
  const v = view(card)
  const i = v.info
  const back: Record<string, unknown>[] = [
    { key: 'msg', label: 'Wiadomość', value: card.last_message || '—', changeMessage: '%@' },
    { key: 'reward', label: 'Nagroda', value: `${v.reward} — za ${v.req} pieczątek` },
  ]
  if (i.description) back.push({ key: 'desc', label: 'O programie', value: String(i.description) })
  if (i.hours) back.push({ key: 'hours', label: 'Godziny otwarcia', value: String(i.hours) })
  if (i.address) back.push({ key: 'addr', label: 'Adres', value: String(i.address) })
  if (i.phone) back.push({ key: 'phone', label: 'Telefon', value: String(i.phone) })
  if (i.website) back.push({ key: 'www', label: 'Strona', value: String(i.website) })
  if (i.terms) back.push({ key: 'terms', label: 'Regulamin', value: String(i.terms) })
  back.push({ key: 'online', label: 'Karta online', value: v.cardUrl, attributedValue: `<a href="${v.cardUrl}">Otwórz kartę</a>` })
  back.push({ key: 'code', label: 'Numer karty', value: card.code })
  back.push({ key: 'by', label: 'Obsługiwane przez', value: 'TableFlow AI · tableflow.pl' })
  return {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    serialNumber: card.id,
    authenticationToken: card.token,
    webServiceURL: `${BASE}/apple`,
    organizationName: v.company,
    description: `${v.title} — ${v.company}`,
    logoText: v.logoText || undefined,
    backgroundColor: rgb(v.bg),
    foregroundColor: rgb(v.fg),
    labelColor: rgb(v.label),
    sharingProhibited: true,
    voided: card.status !== 'active',
    storeCard: {
      headerFields: [{ key: 'stamps', label: 'PIECZĄTKI', value: `${v.shown}/${v.req}`, changeMessage: 'Twoja karta: %@ pieczątek' }],
      secondaryFields: [
        { key: 'name', label: 'KLIENT', value: card.customer_name || '—' },
        { key: 'goal', label: 'NAGRODA', value: v.reward },
      ],
      auxiliaryFields: v.ready > 0 ? [{ key: 'ready', label: 'DO ODEBRANIA', value: `${v.ready} ${v.ready === 1 ? 'nagroda' : 'nagrody'}`, changeMessage: '🎉 Nagroda czeka: %@' }] : [],
      backFields: back,
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: v.url, messageEncoding: 'iso-8859-1', altText: card.code }],
    barcode: { format: 'PKBarcodeFormatQR', message: v.url, messageEncoding: 'iso-8859-1', altText: card.code },
  }
}

export async function buildPkpass(card: Card): Promise<Uint8Array> {
  const v = view(card)
  const files: Record<string, Uint8Array> = { 'pass.json': enc.encode(JSON.stringify(passJson(card))) }
  const fallbackIcon = `${SITE}/apple-touch-icon.png`
  const want: [string, string | undefined][] = v.img ? [
    ['icon.png', v.img.icon[0]], ['icon@2x.png', v.img.icon[1]], ['icon@3x.png', v.img.icon[2]],
    ['logo.png', v.img.logo[0]], ['logo@2x.png', v.img.logo[1]], ['logo@3x.png', v.img.logo[2]],
    ['strip@2x.png', v.img.strip2], ['strip@3x.png', v.img.strip3],
  ] : [['icon.png', fallbackIcon]]
  const got = await Promise.all(want.map(async ([name, url]) => [name, url ? await fetchBytes(url) : null] as const))
  for (const [name, bytes] of got) if (bytes) files[name] = bytes
  if (!files['icon.png']) { const b = await fetchBytes(fallbackIcon); if (b) files['icon.png'] = b }

  const manifest: Record<string, string> = {}
  for (const [name, bytes] of Object.entries(files)) manifest[name] = await sha1(bytes)
  const manifestStr = JSON.stringify(manifest)
  files['manifest.json'] = enc.encode(manifestStr)
  files['signature'] = sign(manifestStr)
  return zipSync(files, { level: 6 })
}

function sign(manifest: string): Uint8Array {
  const { cert, key, wwdr } = getSigner()
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(manifest, 'utf8')
  p7.addCertificate(cert)
  p7.addCertificate(wwdr)
  p7.addSigner({
    key: key as forge.pki.rsa.PrivateKey, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  })
  p7.sign({ detached: true })
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  const out = new Uint8Array(der.length)
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i)
  return out
}

/** Empty-payload push on the pass-type topic → the device re-fetches the pass. Returns tokens APNs rejected as gone (410). */
export async function apnsPush(tokens: string[]): Promise<{ sent: number; gone: string[]; error?: string }> {
  if (!tokens.length || !appleReady()) return { sent: 0, gone: [] }
  const { keyPem } = getSigner()
  const gone: string[] = []; let sent = 0
  // 1) Deno fetch with a client certificate (HTTP/2 via ALPN)
  try {
    // deno-lint-ignore no-explicit-any
    const client = (Deno as any).createHttpClient({ cert: CERT_PEM, key: keyPem, certChain: CERT_PEM, privateKey: keyPem, http2: true, http1: false })
    for (const t of tokens) {
      // deno-lint-ignore no-explicit-any
      const r = await fetch(`https://api.push.apple.com/3/device/${t}`, { method: 'POST', client, headers: { 'apns-topic': PASS_TYPE_ID, 'content-type': 'application/json' }, body: '{}' } as any)
      if (r.status === 200) sent++
      else if (r.status === 410 || r.status === 400) gone.push(t)
      await r.body?.cancel()
    }
    client.close?.()
    return { sent, gone }
  } catch (e) {
    // 2) node:http2 fallback
    try {
      const http2 = await import('node:http2')
      const session = http2.connect('https://api.push.apple.com:443', { cert: CERT_PEM, key: keyPem })
      for (const t of tokens) {
        const status = await new Promise<number>((resolve) => {
          const req = session.request({ ':method': 'POST', ':path': `/3/device/${t}`, 'apns-topic': PASS_TYPE_ID, 'content-type': 'application/json' })
          req.on('response', (h: Record<string, unknown>) => resolve(Number(h[':status'])))
          req.on('error', () => resolve(0))
          req.end('{}')
        })
        if (status === 200) sent++
        else if (status === 410 || status === 400) gone.push(t)
      }
      session.close()
      return { sent, gone }
    } catch (e2) {
      return { sent, gone, error: `${e instanceof Error ? e.message : e} / ${e2 instanceof Error ? e2.message : e2}` }
    }
  }
}
