// Supabase Edge Function "wallet" (verify_jwt = false: Apple calls it with "ApplePass <token>";
// staff endpoints check the Supabase JWT themselves).
//
//  GET  /wallet/status                              → which wallets are configured
//  GET  /wallet/apple/pass?t=TOKEN                  → .pkpass download (customer)
//  *    /wallet/apple/v1/…                          → Apple Wallet web service (register, list, fetch, unregister, log)
//  GET  /wallet/google/save?t=TOKEN                 → 302 to "Save to Google Wallet"
//  POST /wallet/notify   {card_id}                  → staff: push the card's new state (after a stamp)
//  POST /wallet/message  {program_id,title,body,segment} → manager: message to card holders
//  POST /wallet/sync     {program_id}               → manager: design published → refresh all passes
import { BASE, CORS, SITE, cardBy, cardsWhere, db, json, userCan, userId, type Card } from './shared.ts'
import { PASS_TYPE_ID, apnsPush, appleReady, buildPkpass } from './apple.ts'
import { addMessage, googleReady, saveUrl, updateObject, upsertClass } from './google.ts'

const PKPASS = 'application/vnd.apple.pkpass'

async function pkpassResponse(card: Card, download = false) {
  const bytes = await buildPkpass(card)
  const modified = new Date(Math.max(Date.parse(card.updated_at), Date.parse(card.program.published_at ?? card.updated_at))).toUTCString()
  return new Response(bytes as BodyInit, { status: 200, headers: { ...CORS, 'Content-Type': PKPASS, 'Last-Modified': modified, 'Cache-Control': 'no-store', ...(download ? { 'Content-Disposition': `attachment; filename="karta-${card.code}.pkpass"` } : {}) } })
}

async function appleAuthCard(req: Request, serial: string): Promise<Card | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^ApplePass\s+/i, '').trim()
  const card = await cardBy('id', serial)
  return card && token && card.token === token ? card : null
}
async function refreshAppleCount(card: Card) {
  const r = await db(`/rest/v1/wallet_registrations?select=device_id&serial=eq.${card.id}`)
  await db(`/rest/v1/loyalty_cards?id=eq.${card.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ apple_devices: (r.body ?? []).length }) })
}
async function event(card: Card, kind: string) {
  await db('/rest/v1/loyalty_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ card_id: card.id, program_id: card.program_id, company_id: card.company_id, kind }) })
}

/** Apple Wallet web service — https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes */
async function appleService(req: Request, parts: string[]): Promise<Response> {
  // parts after "apple/v1": devices/{dev}/registrations/{ptid}[/{serial}] | passes/{ptid}/{serial} | log
  const [kind, a, b, c, d] = parts
  if (kind === 'log') { try { console.log('apple-log', JSON.stringify(await req.json()).slice(0, 2000)) } catch { /* */ } return new Response(null, { status: 200 }) }
  if (kind === 'passes' && req.method === 'GET') {
    const card = await appleAuthCard(req, b)
    if (!card || a !== PASS_TYPE_ID) return new Response(null, { status: 401 })
    const since = req.headers.get('If-Modified-Since')
    const modified = Math.max(Date.parse(card.updated_at), Date.parse(card.program.published_at ?? card.updated_at))
    if (since && Date.parse(since) >= Math.floor(modified / 1000) * 1000) return new Response(null, { status: 304 })
    return pkpassResponse(card)
  }
  if (kind === 'devices' && b === 'registrations') {
    const dev = a, ptid = c, serial = d
    if (ptid !== PASS_TYPE_ID) return new Response(null, { status: 404 })
    if (serial) {
      const card = await appleAuthCard(req, serial)
      if (!card) return new Response(null, { status: 401 })
      if (req.method === 'POST') {
        let pushToken = ''
        try { pushToken = String((await req.json()).pushToken ?? '') } catch { /* */ }
        if (!pushToken) return new Response(null, { status: 400 })
        const ex = await db(`/rest/v1/wallet_registrations?select=device_id&device_id=eq.${encodeURIComponent(dev)}&pass_type_id=eq.${ptid}&serial=eq.${serial}`)
        await db('/rest/v1/wallet_registrations?on_conflict=device_id,pass_type_id,serial', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ device_id: dev, pass_type_id: ptid, serial, push_token: pushToken }) })
        const isNew = !(ex.body ?? []).length
        if (isNew) { await refreshAppleCount(card); await event(card, 'apple_added') }
        return new Response(null, { status: isNew ? 201 : 200 })
      }
      if (req.method === 'DELETE') {
        await db(`/rest/v1/wallet_registrations?device_id=eq.${encodeURIComponent(dev)}&pass_type_id=eq.${ptid}&serial=eq.${serial}`, { method: 'DELETE' })
        await refreshAppleCount(card); await event(card, 'apple_removed')
        return new Response(null, { status: 200 })
      }
    } else if (req.method === 'GET') {
      const regs = await db(`/rest/v1/wallet_registrations?select=serial&device_id=eq.${encodeURIComponent(dev)}&pass_type_id=eq.${ptid}`)
      const serials = (regs.body ?? []).map((r: { serial: string }) => r.serial)
      if (!serials.length) return new Response(null, { status: 204 })
      const since = Number(new URL(req.url).searchParams.get('passesUpdatedSince') ?? 0)
      const cards = await cardsWhere(`id=in.(${serials.join(',')})`)
      const stamp = (k: Card) => Math.max(Date.parse(k.updated_at), Date.parse(k.program.published_at ?? k.updated_at))
      const changed = cards.filter(k => stamp(k) > since)
      if (!changed.length) return new Response(null, { status: 204 })
      return json({ serialNumbers: changed.map(k => k.id), lastUpdated: String(Math.max(...cards.map(stamp))) })
    }
  }
  return new Response(null, { status: 404 })
}

/** Pushes one card to every wallet it lives in. */
async function pushCard(card: Card) {
  const out = { apple: 0, google: false }
  if (appleReady()) {
    const regs = await db(`/rest/v1/wallet_registrations?select=push_token&serial=eq.${card.id}`)
    const tokens = [...new Set((regs.body ?? []).map((r: { push_token: string }) => r.push_token))] as string[]
    const r = await apnsPush(tokens)
    out.apple = r.sent
    if (r.gone.length) await db(`/rest/v1/wallet_registrations?serial=eq.${card.id}&push_token=in.(${r.gone.join(',')})`, { method: 'DELETE' })
  }
  if (googleReady() && (card.google_saved || card.google_clicked_at)) {
    try {
      out.google = await updateObject(card)
      if (out.google && !card.google_saved) { await db(`/rest/v1/loyalty_cards?id=eq.${card.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ google_saved: true }) }); await event(card, 'google_saved') }
    } catch (e) { console.warn('google update', e) }
  }
  return out
}

function segmentFilter(segment: string, req: number): (k: Card) => boolean {
  const now = Date.now(), day = 86400000
  switch (segment) {
    case 'ready': return k => k.stamps >= req
    case 'near': return k => k.stamps < req && k.stamps >= Math.max(1, req - 2)
    case 'inactive': return k => (k as any).last_stamp_at ? Date.parse((k as any).last_stamp_at) < now - 30 * day : Date.parse((k as any).created_at) < now - 30 * day
    case 'new': return k => Date.parse((k as any).created_at) > now - 7 * day
    default: return () => true
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  const parts = url.pathname.replace(/^.*?\/wallet\/?/, '').split('/').filter(Boolean)
  const auth = req.headers.get('Authorization')
  try {
    // ---------- public ----------
    if (parts[0] === 'status') return json({ apple: appleReady(), google: googleReady(), pass_type_id: PASS_TYPE_ID || null, web_service: `${BASE}/apple` })

    if (parts[0] === 'apple' && parts[1] === 'v1') return await appleService(req, parts.slice(2))
    if (parts[0] === 'apple' && parts[1] === 'pass') {
      if (!appleReady()) return Response.redirect(`${SITE}/moja-karta?t=${url.searchParams.get('t') ?? ''}&w=apple-off`, 302)
      const card = await cardBy('token', url.searchParams.get('t') ?? '')
      if (!card || card.program.status !== 'active') return json({ error: 'not_found' }, 404)
      return await pkpassResponse(card, true)
    }
    if (parts[0] === 'google' && parts[1] === 'save') {
      const t = url.searchParams.get('t') ?? ''
      if (!googleReady()) return Response.redirect(`${SITE}/moja-karta?t=${t}&w=google-off`, 302)
      const card = await cardBy('token', t)
      if (!card || card.program.status !== 'active') return json({ error: 'not_found' }, 404)
      const link = await saveUrl(card)
      await db(`/rest/v1/loyalty_cards?id=eq.${card.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ google_clicked_at: new Date().toISOString() }) })
      return Response.redirect(link, 302)
    }

    // ---------- staff (Supabase JWT) ----------
    if (req.method !== 'POST') return json({ error: 'not_found' }, 404)
    const body = await req.json().catch(() => ({})) as Record<string, any>

    if (parts[0] === 'notify') {
      const card = await cardBy('id', String(body.card_id ?? ''))
      if (!card || !(await userCan(auth, 'can_access_company', card.company_id))) return json({ error: 'forbidden' }, 403)
      return json(await pushCard(card))
    }

    if (parts[0] === 'message') {
      const pid = String(body.program_id ?? '')
      const title = String(body.title ?? '').trim().slice(0, 60), text = String(body.body ?? '').trim().slice(0, 400)
      if (!text) return json({ error: 'empty' }, 400)
      const prog = await db(`/rest/v1/loyalty_programs?select=id,company_id,stamps_required&id=eq.${pid}`)
      const p = prog.body?.[0]
      if (!p || !(await userCan(auth, 'can_manage_company', p.company_id))) return json({ error: 'forbidden' }, 403)
      const segment = ['all', 'wallet', 'ready', 'near', 'inactive', 'new'].includes(body.segment) ? body.segment : 'all'
      let cards = (await cardsWhere(`program_id=eq.${pid}&status=eq.active`)).filter(segmentFilter(segment, p.stamps_required))
      if (segment === 'wallet') cards = cards.filter(k => k.apple_devices > 0 || k.google_saved)
      if (body.dry_run) return json({ cards: cards.length, apple: cards.filter(k => k.apple_devices > 0).length, google: cards.filter(k => k.google_saved || k.google_clicked_at).length })
      const message = title ? `${title}: ${text}` : text
      const ids = cards.map(k => k.id)
      for (let i = 0; i < ids.length; i += 150) {
        await db(`/rest/v1/loyalty_cards?id=in.(${ids.slice(i, i + 150).join(',')})`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_message: message, last_message_at: new Date().toISOString() }) })
      }
      let apple = 0, google = 0
      // Apple: the pass is re-fetched; the "msg" field has changeMessage "%@" → lock-screen notification
      if (appleReady() && ids.length) {
        const regs = await db(`/rest/v1/wallet_registrations?select=push_token&serial=in.(${ids.join(',')})`)
        const r = await apnsPush([...new Set((regs.body ?? []).map((x: { push_token: string }) => x.push_token))] as string[])
        apple = r.sent
        if (r.gone.length) await db(`/rest/v1/wallet_registrations?push_token=in.(${r.gone.join(',')})`, { method: 'DELETE' })
      }
      if (googleReady()) {
        for (const k of cards.filter(k => k.google_saved || k.google_clicked_at)) {
          try { if (await addMessage({ ...k, last_message: message }, title || k.program.name, text)) google++ } catch { /* not saved */ }
        }
      }
      const uid = await userId(auth)
      await db('/rest/v1/loyalty_messages', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ program_id: pid, company_id: p.company_id, title, body: text, segment, cards: ids.length, apple, google, sent_by: uid }) })
      return json({ cards: ids.length, apple, google })
    }

    if (parts[0] === 'sync') {
      const pid = String(body.program_id ?? '')
      const prog = await db(`/rest/v1/loyalty_programs?select=*,company:companies(id,name,logo_url,website,phone,address,city)&id=eq.${pid}`)
      const p = prog.body?.[0]
      if (!p || !(await userCan(auth, 'can_manage_company', p.company_id))) return json({ error: 'forbidden' }, 403)
      const out: Record<string, unknown> = { apple: 0, google: 0 }
      if (googleReady()) { try { await upsertClass(p, p.company); out.google_class = true } catch (e) { out.google_error = e instanceof Error ? e.message : String(e) } }
      const cards = await cardsWhere(`program_id=eq.${pid}`)
      if (appleReady() && cards.length) {
        const regs = await db(`/rest/v1/wallet_registrations?select=push_token&serial=in.(${cards.map(k => k.id).join(',')})`)
        out.apple = (await apnsPush([...new Set((regs.body ?? []).map((x: { push_token: string }) => x.push_token))] as string[])).sent
      }
      if (googleReady()) { let n = 0; for (const k of cards.filter(k => k.google_saved)) { try { if (await updateObject(k)) n++ } catch { /* */ } } out.google = n }
      return json(out)
    }
    return json({ error: 'not_found' }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : 'error' }, 500)
  }
})
