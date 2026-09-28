// Run after `npm run build`: SVC=<service key> npm run qc:panel — creates temporary *@tableflow.test accounts and removes everything afterwards.
// E2E: admin → company + owner account → owner designs & publishes card → customer joins (name+phone) → staff stamps → stats/messages/team → analytics.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { puppeteer, chromePath } from './chrome.mjs'

const ROOT = 'dist'
const OUT = process.env.OUT || 'qc-out/panel'; if (!process.env.SVC) throw new Error('set SVC=<service_role key> (never commit it)'); mkdirSync(OUT, { recursive: true })
const SB = 'https://ahtjgghocwegyepxoeru.supabase.co', SVC = process.env.SVC
const svc = (path, init = {}) => fetch(SB + path, { ...init, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', ...(init.headers || {}) } }).then(async r => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } })
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' }
const srv = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  let f = join(ROOT, p === '/' ? 'index.html' : p), code = 200
  if (!(existsSync(f) && statSync(f).isFile())) { if (existsSync(f + '.html')) f += '.html'; else if (existsSync(join(f, 'index.html'))) f = join(f, 'index.html'); else { f = join(ROOT, '404.html'); code = 404 } }
  res.writeHead(code, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f))
}).listen(4173)
const B = 'http://localhost:4173'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fails = []; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m) }

// ---- temporary QA admin
const ADMIN = { email: 'qa-admin@tableflow.test', password: 'QaAdmin!' + Math.random().toString(36).slice(2, 10) }
const created = await svc('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password, email_confirm: true, user_metadata: { full_name: 'QA Admin' } }) })
const adminId = created.id
await svc('/rest/v1/admin_profiles', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: adminId, role: 'admin', display_name: 'QA Admin' }) })
ok(!!adminId, 'qa admin created')

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
async function page(ctx, { mobile = false, humans = false } = {}) {
  const p = await ctx.newPage()
  await p.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900 })
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await p.evaluateOnNewDocument((h) => { try { localStorage.setItem('tf_lang', 'pl'); localStorage.setItem('tf_consent', 'rejected') } catch {} ; if (h) Object.defineProperty(navigator, 'webdriver', { get: () => false }) }, humans)
  if (humans) await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')
  p._errors = []
  p.on('pageerror', e => p._errors.push(e.message))
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) p._errors.push(m.text()) })
  return p
}
const shot = (p, n, full = false) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: full })
async function click(p, sel, text) {
  const ok2 = await p.evaluate((sel, text) => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.replace(/\s+/g, ' ').includes(text)); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true } return false }, sel, text)
  if (!ok2) throw new Error(`no ${sel} "${text}"`)
  await sleep(500)
}
async function type(p, sel, text) { await p.waitForSelector(sel); await p.click(sel, { clickCount: 3 }); await p.type(sel, text) }
async function login(p, url, email, pw) {
  await p.goto(B + url, { waitUntil: 'networkidle0' })
  await p.waitForSelector('.ap-login input'); const inputs = await p.$$('.ap-login input')
  await inputs[0].type(email); await inputs[1].type(pw)
  await click(p, '.ap-login button', 'Zaloguj'); await sleep(2500)
}
const modalFieldByLabel = (p, label, value) => p.evaluate((label, value) => {
  const f = [...document.querySelectorAll('.ap-modal .ap-field')].find(l => l.querySelector('span')?.textContent.includes(label))
  const el = f?.querySelector('input, select, textarea'); if (!el) return false
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true
}, label, value)

let companyId, ownerPw, slug, code
try {
  // ================= ADMIN
  const actx = await browser.createBrowserContext(); const a = await page(actx)
  await login(a, '/admin', ADMIN.email, ADMIN.password)
  ok(await a.$('.ap-kpis') !== null, 'admin overview renders KPIs'); await shot(a, '01-admin-overview')
  await a.goto(B + '/admin/analityka', { waitUntil: 'networkidle0' }); await sleep(2500)
  ok((await a.$$('.ap-kpi')).length >= 5, 'admin analytics renders'); await shot(a, '02-admin-analytics', true)
  await a.goto(B + '/admin/zgloszenia', { waitUntil: 'networkidle0' }); await sleep(1500); await shot(a, '03-admin-leads')
  await a.goto(B + '/admin/firmy', { waitUntil: 'networkidle0' }); await sleep(1500)
  await click(a, '.ap-head button', 'Nowa firma')
  await modalFieldByLabel(a, 'Nazwa', 'QA Kawiarnia Test'); await modalFieldByLabel(a, 'Branża', 'Kawiarnia'); await modalFieldByLabel(a, 'Miasto', 'Warszawa')
  await click(a, '.ap-modal__foot button', 'Utwórz firmę'); await sleep(2500)
  companyId = new URL(a.url()).searchParams.get('id')
  ok(!!companyId, `company created ${companyId}`)
  await click(a, '.ap-modal button', 'Dodaj konto'); await sleep(600)
  const boxes = await a.$$('.ap-modal__box'); ok(boxes.length === 2, 'add-account modal over company modal')
  await modalFieldByLabel(a, 'E-mail (login)', 'qa-owner@tableflow.test'); await modalFieldByLabel(a, 'Imię i nazwisko', 'Olga Właścicielka')
  await click(a, '.ap-modal__foot button', 'Dodaj konto'); await sleep(3500)
  ownerPw = await a.evaluate(() => document.querySelector('.ap-secret span')?.textContent)
  ok(!!ownerPw && ownerPw.length > 10, 'owner credentials shown once'); await shot(a, '04-admin-credentials')
  await click(a, '.ap-modal__foot button', 'Gotowe'); await sleep(800); await shot(a, '05-admin-company')
  // impersonate
  await a.goto(B + `/panel/lojalnosc?firma=${companyId}`, { waitUntil: 'networkidle0' }); await sleep(2000)
  ok(await a.evaluate(() => !!document.querySelector('.ap-imp')), 'admin opens client panel (impersonation banner)')
  await shot(a, '06-admin-as-client')

  // ================= OWNER
  const octx = await browser.createBrowserContext(); const o = await page(octx)
  await login(o, '/panel', 'qa-owner@tableflow.test', ownerPw)
  ok(await o.evaluate(() => location.pathname === '/panel/lojalnosc'), 'owner lands on /panel/lojalnosc')
  const locked = await o.$$eval('.ap-side .ap-item.is-locked', els => els.map(e => e.textContent.trim()))
  ok(locked.join() === 'Dzisiaj,Kalendarz,Rozmowy,Klienci', `locked tabs: ${locked}`)
  await shot(o, '07-owner-onboarding')
  await o.goto(B + '/panel/kalendarz', { waitUntil: 'networkidle0' }); await sleep(1200); await shot(o, '08-locked-calendar')
  await o.goto(B + '/panel/lojalnosc', { waitUntil: 'networkidle0' }); await sleep(1500)
  await click(o, '.ly-onb button', 'Utwórz kartę'); await sleep(2500)
  ok(o.url().includes('v=projekt'), 'program created → designer')
  await shot(o, '09-designer')
  await click(o, '.dz-sec__head', 'Tło i gradient'); await sleep(500)
  await click(o, '.dz-preset', 'Ocean'); await sleep(400)
  await click(o, '.dz-sec__head', 'Pieczątki'); await sleep(500)
  await o.evaluate(() => document.querySelectorAll('.dz-icon')[1].click()); await sleep(300)
  await click(o, '.ap-seg button', 'Google'); await sleep(900); await shot(o, '10-designer-google')
  await click(o, '.ap-seg button', 'Online'); await sleep(900); await shot(o, '11-designer-web')
  await click(o, '.dz__bar button', 'Opublikuj kartę')
  await o.waitForFunction(() => document.querySelector('.ap-modal h2')?.textContent.includes('Gotowe'), { timeout: 90000 })
  ok(true, 'published (assets rendered + uploaded)')
  await sleep(2200)
  const prog = (await svc(`/rest/v1/loyalty_programs?company_id=eq.${companyId}&select=*`))[0]
  slug = prog.slug
  ok(prog.status === 'active' && prog.assets.version === 1 && prog.design.gradient[0] === '#0f2f4f', `program active, assets v${prog.assets.version}, strips ${prog.assets.strips}`)
  const strip = await fetch(`${prog.assets.base}/strip-3@3x.png`); ok(strip.ok && strip.headers.get('content-type') === 'image/png', 'strip PNG public')
  const stripBuf = Buffer.from(await strip.arrayBuffer()); (await import('node:fs')).writeFileSync(`${OUT}/strip-3@3x.png`, stripBuf)
  const icon = await fetch(`${prog.assets.base}/icon@2x.png`); ok(icon.ok, 'icon PNG public')
  await o.goto(B + '/panel/lojalnosc?v=udostepnij', { waitUntil: 'networkidle0' }); await sleep(1800); await shot(o, '12-share', true)

  // ================= CUSTOMER (mobile)
  const cctx = await browser.createBrowserContext(); const c = await page(cctx, { mobile: true })
  await c.goto(B + `/dolacz?p=${slug}`, { waitUntil: 'networkidle0' }); await sleep(1500); await shot(c, '13-join-mobile', true)
  const inputs = await c.$$('.cp-form input.input')
  await inputs[0].type('Kasia Klientka')
  await click(c, '.cp-form button', 'Odbierz kartę'); await sleep(1200)
  ok(await c.evaluate(() => document.querySelector('.cp-err')?.textContent.includes('numer telefonu')), 'join blocked without phone')
  await inputs[1].type('600 700 800')
  await click(c, '.cp-form button', 'Odbierz kartę'); await sleep(3000)
  ok(c.url().includes('/moja-karta?t='), 'customer card created after name + phone')
  await sleep(1200); await shot(c, '14-my-card-mobile', true)
  code = await c.evaluate(() => document.querySelector('.cp-code')?.textContent.replace(/\s/g, ''))
  ok(/^[0-9A-Z]{8}$/.test(code), `card code ${code}`)

  // ================= STAFF STAMPS (owner scanner, manual code)
  await o.goto(B + '/panel/skaner', { waitUntil: 'networkidle0' }); await sleep(1500)
  await type(o, '#sc-code', code); await click(o, '.sc__manual button', 'Szukaj'); await sleep(2000)
  ok(await o.evaluate(() => document.querySelector('.sc-card__head b')?.textContent === 'Kasia Klientka'), 'scanner finds card')
  await click(o, '.sc-card__actions button', 'Dodaj pieczątkę'); await sleep(2000)
  ok(await o.evaluate(() => document.querySelector('.sc-card__count b')?.textContent === '1'), 'stamp added → 1')
  await shot(o, '15-scanner-stamped')
  await click(o, '.sc-card__actions button', 'Dodaj pieczątkę'); await sleep(1500)
  ok(await o.evaluate(() => !!document.querySelector('.ap-modal') && document.querySelector('.ap-modal h2').textContent.includes('przed chwilą')), 'cooldown asks owner to force')
  await click(o, '.ap-modal__foot button', 'Dodaj mimo to'); await sleep(2000)
  ok(await o.evaluate(() => document.querySelector('.sc-card__count b')?.textContent === '2'), 'forced stamp → 2')
  // /s?c= link (phone camera) → scanner
  await o.goto(B + `/s?c=${code}`, { waitUntil: 'networkidle0' }); await sleep(3000)
  ok(o.url().includes('/panel/skaner?c=') && await o.evaluate(() => !!document.querySelector('.sc-card')), '/s?c=CODE → staff scanner with card open')
  // customer card refresh
  await c.reload({ waitUntil: 'networkidle0' }); await sleep(1500)
  ok(await c.evaluate(() => document.querySelector('.lc-web__count b')?.textContent.startsWith('2')), 'customer card shows 2 stamps')

  // ================= cards / stats / messages / team (owner)
  await o.goto(B + '/panel/lojalnosc?v=karty', { waitUntil: 'networkidle0' }); await sleep(1800)
  ok((await o.$$('.ap-table tbody tr')).length === 1, 'cards list has 1 card'); await shot(o, '16-cards')
  await o.click('.ap-table tbody tr'); await sleep(1800); await shot(o, '17-card-modal')
  await o.keyboard.press('Escape'); await sleep(400)
  await o.goto(B + '/panel/lojalnosc?v=powiadomienia', { waitUntil: 'networkidle0' }); await sleep(2000)
  await type(o, '.ap-panel textarea', 'Test QA: podwójne pieczątki w weekend.')
  await sleep(600); await click(o, '.ap-panel button', 'Wyślij'); await sleep(700); await click(o, '.ap-modal__foot button', 'Wyślij'); await sleep(3500)
  const card = (await svc(`/rest/v1/loyalty_cards?code=eq.${code}&select=last_message,stamps`))[0]
  ok(card.last_message?.includes('podwójne'), 'message saved on card'); await shot(o, '18-messages')
  await o.goto(B + '/panel/statystyki', { waitUntil: 'networkidle0' }); await sleep(2500); await shot(o, '19-stats', true)
  ok((await o.$$('.ap-kpi')).length === 6, 'stats KPIs')
  await o.goto(B + '/panel/zespol', { waitUntil: 'networkidle0' }); await sleep(1500)
  await click(o, '.ap-head button', 'Dodaj osobę'); await modalFieldByLabel(o, 'Imię i nazwisko', 'Staś Obsługa'); await modalFieldByLabel(o, 'E-mail (login)', 'qa-staff@tableflow.test')
  await click(o, '.ap-modal__foot button', 'Utwórz konto'); await sleep(3500)
  const staffPw = await o.evaluate(() => document.querySelector('.ap-secret span')?.textContent)
  ok(!!staffPw, 'staff account created by owner'); await click(o, '.ap-modal__foot button', 'Gotowe'); await sleep(600); await shot(o, '20-team')
  await o.goto(B + '/panel/ustawienia', { waitUntil: 'networkidle0' }); await sleep(1500); await shot(o, '21-settings')

  // staff: limited tabs, mobile
  const sctx = await browser.createBrowserContext(); const s = await page(sctx, { mobile: true })
  await login(s, '/panel', 'qa-staff@tableflow.test', staffPw)
  const tabs = await s.$$eval('.ap-tabs button', b => b.map(x => x.textContent.trim()))
  ok(tabs.join() === 'Przegląd,Karty klientów,Udostępnij', `staff tabs: ${tabs}`)
  await shot(s, '22-staff-mobile', true)
  await s.goto(B + '/panel/skaner', { waitUntil: 'networkidle0' }); await sleep(2500); await shot(s, '23-staff-scanner-mobile')
  const denied = await s.evaluate(async (sb, key) => { const a = JSON.parse(localStorage.getItem('tf_editor_auth')); const r = await fetch(sb + '/rest/v1/rpc/admin_overview', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + a.access_token, 'Content-Type': 'application/json' }, body: '{}' }); return r.status }, SB, 'sb_publishable_7zS8ao7Vkz0zCPVb7_tWBw_GKTjQk8e')
  ok(denied === 403 || denied === 401 || denied === 400, `staff cannot call admin RPC (${denied})`)

  // ================= tracking (non-webdriver visitor)
  const vctx = await browser.createBrowserContext(); const v = await page(vctx, { humans: true })
  await v.goto(B + '/?utm_source=qa-e2e', { waitUntil: 'networkidle0' }); await sleep(2000)
  await v.evaluate(() => window.scrollTo(0, document.body.scrollHeight * .6)); await sleep(2500)
  await v.evaluate(() => [...document.querySelectorAll('a,button')].find(b => /FAQ/.test(b.textContent))?.click()); await sleep(1500)
  await v.goto(B + '/regulamin', { waitUntil: 'networkidle0' }); await sleep(2000); await v.close(); await sleep(2000)
  const visits = await svc('/rest/v1/site_visits?utm_source=eq.qa-e2e&select=*')
  ok(visits.length >= 1 && visits[0].scroll > 0, `tracked: ${visits.length} view(s), scroll ${visits[0]?.scroll}%, sections ${visits[0]?.sections}, clicks ${JSON.stringify(visits[0]?.clicks)}`)
  const vis2 = await svc(`/rest/v1/site_visits?visitor=eq.${visits[0]?.visitor}&select=path`)
  ok(vis2.some(x => x.path === '/regulamin'), 'second page in same session')
  await a.goto(B + '/admin/analityka', { waitUntil: 'networkidle0' }); await sleep(2500)
  await a.evaluate(() => document.querySelector('.ad-sessions > li > button')?.click()); await sleep(500); await shot(a, '24-admin-analytics-session', true)
  await a.goto(B + '/admin/konta', { waitUntil: 'networkidle0' }); await sleep(1800); await shot(a, '25-admin-users')
  await a.goto(B + '/admin/strona', { waitUntil: 'networkidle0' }); await sleep(1800); await shot(a, '26-admin-site')
  await a.goto(B + '/admin/dziennik', { waitUntil: 'networkidle0' }); await sleep(1800); await shot(a, '27-admin-audit')
  // mobile panel owner
  const m = await page(octx, { mobile: true })
  await m.goto(B + '/panel/lojalnosc', { waitUntil: 'networkidle0' }); await sleep(2000); await shot(m, '28-owner-mobile', true)
  await m.goto(B + '/panel/lojalnosc?v=projekt', { waitUntil: 'networkidle0' }); await sleep(2000); await shot(m, '29-designer-mobile', true)
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  ok(!overflow, 'no horizontal overflow on mobile designer')

  for (const [n, p] of [['admin', a], ['owner', o], ['customer', c], ['staff', s], ['visitor-mobile', m]]) ok(!p._errors.length, `${n} console clean ${p._errors.slice(0, 3).join(' | ')}`)
} catch (e) { fails.push(String(e.stack || e)); console.log('FAIL', e) }
finally {
  await browser.close(); srv.close()
  // ---- cleanup everything QA
  const users = (await svc('/auth/v1/admin/users?per_page=200')).users.filter(u => /@tableflow\.test$/.test(u.email))
  if (companyId) {
    const files = await svc('/storage/v1/object/list/wallet', { method: 'POST', body: JSON.stringify({ prefix: `c/${companyId}/p`, limit: 100 }) })
    // storage list is per-folder; remove the whole company folder recursively
    const all = []
    async function walk(prefix) { const items = await svc('/storage/v1/object/list/wallet', { method: 'POST', body: JSON.stringify({ prefix, limit: 1000 }) }); for (const it of items) { if (it.id) all.push(`${prefix}/${it.name}`); else await walk(`${prefix}/${it.name}`) } }
    await walk(`c/${companyId}`)
    if (all.length) await svc('/storage/v1/object/wallet', { method: 'DELETE', body: JSON.stringify({ prefixes: all }) })
    console.log(`cleanup: ${all.length} storage files`, files?.length ?? '')
    await svc(`/rest/v1/companies?id=eq.${companyId}`, { method: 'DELETE' })
  }
  for (const u of users) await svc(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
  await svc('/rest/v1/site_visits?utm_source=eq.qa-e2e', { method: 'DELETE' })
  console.log(`cleanup: ${users.length} users`)
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL OK')
  process.exit(fails.length ? 1 : 0)
}
