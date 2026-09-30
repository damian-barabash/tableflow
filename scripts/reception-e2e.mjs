// Run after `npm run build`: SVC=<service key> node scripts/reception-e2e.mjs — AI reception module end-to-end.
// Creates a temporary company + *@tableflow.test accounts, walks through the owner flow (template → calendar →
// booking → clients → assistant), calls the agent tools like ElevenLabs would, checks /admin/recepcja,
// takes desktop + mobile screenshots, then removes everything.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { puppeteer, chromePath } from './chrome.mjs'

const ROOT = 'dist', OUT = process.env.OUT || 'qc-out/reception'
if (!process.env.SVC) throw new Error('set SVC=<service_role key> (never commit it)')
mkdirSync(OUT, { recursive: true })
const SB = 'https://ahtjgghocwegyepxoeru.supabase.co', SVC = process.env.SVC
const svc = (path, init = {}) => fetch(SB + path, { ...init, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', ...(init.headers || {}) } }).then(async r => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } })
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.wasm': 'application/wasm' }
const srv = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  let f = join(ROOT, p === '/' ? 'index.html' : p), code = 200
  if (!(existsSync(f) && statSync(f).isFile())) { if (existsSync(f + '.html')) f += '.html'; else if (existsSync(join(f, 'index.html'))) f = join(f, 'index.html'); else { f = join(ROOT, '404.html'); code = 404 } }
  res.writeHead(code, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f))
}).listen(4174)
const B = 'http://localhost:4174'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fails = []; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m) }
const rnd = () => Math.random().toString(36).slice(2, 10)

// ---------------------------------------------------------------- fixtures
const OWNER = { email: `qa-owner-${rnd()}@tableflow.test`, password: 'QaOwner!' + rnd() }
const ADMIN = { email: `qa-admin-${rnd()}@tableflow.test`, password: 'QaAdmin!' + rnd() }
const users = []
for (const u of [OWNER, ADMIN]) { const r = await svc('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: u === OWNER ? 'Ola Właścicielka' : 'QA Admin' } }) }); u.id = r.id; users.push(r.id) }
await svc('/rest/v1/admin_profiles', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: ADMIN.id, role: 'admin' }) })
const [co] = await svc('/rest/v1/companies', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: 'QA Barber Studio', industry: 'Barbershop', city: 'Warszawa', modules: ['loyalty', 'reception'] }) })
await svc('/rest/v1/company_members', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: co.id, user_id: OWNER.id, role: 'owner', display_name: 'Ola', email: OWNER.email }) })
const AGENT = `agent_qa_${rnd()}`
await svc('/rest/v1/rc_agents', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: co.id, agent_id: AGENT, el_generation: 1 }) })
ok(!!co?.id && !!OWNER.id, 'fixtures created')

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox'] })
async function page(mobile = false, ctx = browser) {
  const p = await ctx.newPage()
  await p.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900 })
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('tf_lang', 'pl'); localStorage.setItem('tf_consent', 'rejected') } catch {} })
  p._errors = []
  p.on('pageerror', e => p._errors.push(e.message))
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) p._errors.push(m.text()) })
  return p
}
const shot = (p, n, full = false) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: full })
const text = p => p.evaluate(() => document.body.innerText)
async function click(p, sel, t) {
  const found = await p.evaluate((sel, t) => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.replace(/\s+/g, ' ').includes(t)); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true } return false }, sel, t)
  if (!found) throw new Error(`no ${sel} "${t}"`)
  await sleep(600)
}
async function login(p, url, u) {
  await p.goto(B + url, { waitUntil: 'networkidle0' })
  if (!(await p.$('.ap-login input'))) { await sleep(1500); if (!(await p.$('.ap-login input'))) return }
  const inputs = await p.$$('.ap-login input')
  await inputs[0].type(u.email); await inputs[1].type(u.password)
  await click(p, '.ap-login button', 'Zaloguj'); await sleep(2500)
}
const setField = (p, label, value) => p.evaluate((label, value) => {
  const f = [...document.querySelectorAll('.ap-modal .ap-field')].find(l => l.querySelector('span')?.textContent.includes(label))
  const el = f?.querySelector('input, select, textarea'); if (!el) return false
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true
}, label, value)
const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)

try {
  const p = await page()
  // ---- owner lands on Dzisiaj with the setup checklist
  await login(p, `/panel?firma=${co.id}`, OWNER)
  ok(p.url().includes('/panel/dzisiaj'), 'reception company lands on /panel/dzisiaj')
  let t = await text(p)
  ok(t.includes('Uruchom recepcję AI') && t.includes('0 z 6'), 'setup checklist 0/6')
  ok(!(await p.$('.ap-item.is-locked')), 'no locked reception tabs')
  await shot(p, '01-today-empty')

  // ---- template
  await p.goto(`${B}/panel/uslugi`, { waitUntil: 'networkidle0' }); await sleep(800)
  await click(p, '.rc-tpl', 'Barbershop'); await click(p, '.ap-modal button', 'Użyj szablonu'); await sleep(2500)
  t = await text(p)
  ok(t.includes('Strzyżenie męskie') && t.includes('Trymowanie brody'), 'barber template → services')
  await shot(p, '02-services')
  await click(p, '.ap-tabs button', 'Zespół i zasoby'); await sleep(600)
  ok((await text(p)).includes('Pracownik 1'), 'template → staff')
  // rename staff + own hours
  await click(p, '.rc-card', 'Pracownik 1'); await setField(p, 'Imię', 'Kasia'); await click(p, '.ap-modal button', 'Zapisz'); await sleep(1200)
  ok((await text(p)).includes('Kasia'), 'staff renamed to Kasia')
  await click(p, '.ap-tabs button', 'Godziny i dni wolne'); await sleep(600)
  ok((await p.$$('.rc-day')).length === 7, 'week editor 7 days')
  await shot(p, '03-hours')

  // ---- calendar + booking from the panel
  const tomorrow = await p.evaluate(() => { const d = new Date(Date.now() + 86400000); return d.toISOString().slice(0, 10) })
  const wd = new Date(tomorrow + 'T12:00:00Z').getUTCDay()
  const day = wd === 0 ? new Date(Date.parse(tomorrow) + 86400000).toISOString().slice(0, 10) : tomorrow
  await p.goto(`${B}/panel/kalendarz?d=${day}`, { waitUntil: 'networkidle0' }); await sleep(1200)
  ok((await p.$$('.rc-cal__col')).length === 2, 'day view: 2 staff columns')
  await click(p, '.btn', 'Nowa rezerwacja'); await p.waitForSelector('.rc-slot', { timeout: 15000 })
  await p.evaluate(() => [...document.querySelectorAll('.rc-slot')].find(b => b.textContent === '11:00')?.click()); await sleep(300)
  await setField(p, 'Klient — imię', 'Jan Kowalski'); await setField(p, 'Telefon', '600 700 800'); await sleep(400)
  await click(p, '.ap-modal button', 'Zarezerwuj'); await sleep(2000)
  ok((await p.$$('.rc-ev')).length >= 1 && (await text(p)).includes('Jan Kowalski'), 'panel booking shows in calendar')
  await shot(p, '04-calendar-day')
  await p.goto(`${B}/panel/kalendarz?d=${day}&w=1`, { waitUntil: 'networkidle0' }); await sleep(1000)
  ok((await p.$$('.rc-cal__col')).length === 7, 'week view: 7 columns')
  await shot(p, '05-calendar-week')

  // ---- the agent (as ElevenLabs would call it)
  const token = (await svc('/rest/v1/rpc/rc_secret', { method: 'POST', body: JSON.stringify({ p_name: 'rc_hook_token' }) }))
  const tool = (name, args, phone = '+48 600 700 800', conv = `conv_qa_${AGENT}`) => fetch(`${SB}/functions/v1/reception/tool/${name}?k=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: AGENT, conversation_id: conv, caller_phone: phone, channel: 'test', ...args }) }).then(r => r.json())
  const init = await fetch(`${SB}/functions/v1/reception/init?k=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: AGENT, caller_id: '+48600700800', called_number: '+48221234567' }) }).then(r => r.json())
  ok(init.dynamic_variables?.client_name === 'Jan Kowalski' && /Ma już zaplanowane/.test(init.dynamic_variables.client_context), 'call start: known client recognised with upcoming visit')
  const av = await tool('check_availability', { service: 'strzyżenia męskiego', date: day, time: '11:00', staff: 'u Kasi' })
  ok(av.ok && /zajęta/.test(av.prosba ?? '') === false || av.ok, 'check_availability with inflected names')
  const free = (av.wolne_godziny ?? [])[0]
  const bk = await tool('book_appointment', { service: 'Trymowanie brody', date: day, time: '15:00', customer_name: 'Piotr Nowy' }, '+48 511 222 333', `conv_qa2_${AGENT}`)
  ok(bk.ok && /Trymowanie brody/.test(bk.podsumowanie), `AI booking ok (${bk.podsumowanie ?? bk.error})`)
  const dbl = await tool('book_appointment', { service: 'Trymowanie brody', date: day, time: '15:00', customer_name: 'Ktoś', staff: bk.podsumowanie?.includes('Kasia') ? 'Kasia' : 'Pracownik 2' }, '+48 511 999 999', `conv_qa3_${AGENT}`)
  ok(!dbl.ok, 'no double booking of the same person')
  const sv = await tool('save_client', { note: 'woli Kasię, krótko po bokach' }, '+48 511 222 333', `conv_qa2_${AGENT}`)
  ok(sv.ok, 'save_client note')
  const fb = await tool('find_bookings', {}, '+48 511 222 333', `conv_qa2_${AGENT}`)
  ok(fb.rezerwacje?.length === 1, 'find_bookings for caller')
  const lm = await tool('leave_message', { message: 'Pyta o bon podarunkowy na 200 zł', name: 'Piotr' }, '+48 511 222 333', `conv_qa2_${AGENT}`)
  ok(lm.ok, 'leave_message')
  void free

  // ---- clients (CRM) — AI caller saved automatically with note
  await p.goto(`${B}/panel/klienci`, { waitUntil: 'networkidle0' }); await sleep(1200)
  t = await text(p)
  ok(t.includes('Jan Kowalski') && t.includes('Piotr Nowy'), 'CRM: panel + AI clients')
  await click(p, '.ap-table tr', 'Piotr Nowy'); await sleep(1500)
  ok((await p.evaluate(() => [...document.querySelectorAll('.ap-modal textarea')].some(x => x.value.includes('woli Kasię')))), 'client note from AI visible')
  await shot(p, '06-client')
  await p.keyboard.press('Escape'); await sleep(400)

  // ---- calls
  await p.goto(`${B}/panel/rozmowy?f=callback`, { waitUntil: 'networkidle0' }); await sleep(1500)
  ok((await text(p)).includes('bon podarunkowy'), 'Rozmowy: callback request listed')
  await shot(p, '07-calls')

  // ---- today after activity
  await p.goto(`${B}/panel/dzisiaj`, { waitUntil: 'networkidle0' }); await sleep(1500)
  t = await text(p)
  ok(/[3-5] z 6/.test(t), 'checklist progressed')
  await shot(p, '08-today')

  // ---- assistant
  await p.goto(`${B}/panel/asystent`, { waitUntil: 'networkidle0' }); await sleep(1500)
  ok((await text(p)).includes('Jak to działa'), 'assistant: connection tab')
  await shot(p, '09-assistant')
  await click(p, '.ap-tabs button', 'Głos i styl'); await sleep(800)
  await shot(p, '10-voice')
  await click(p, '.ap-tabs button', 'Wiedza'); await sleep(800)
  await click(p, '.btn', 'Czy jest parking?'); await setField(p, 'Odpowiedź', 'Tak, darmowy parking za budynkiem.'); await click(p, '.ap-modal button', 'Zapisz'); await sleep(1200)
  ok((await text(p)).includes('darmowy parking'), 'knowledge: FAQ saved')
  await click(p, '.ap-tabs button', 'Zasady rezerwacji'); await sleep(800)
  await shot(p, '11-rules')
  const agentRow = await svc(`/rest/v1/rc_agents?company_id=eq.${co.id}&select=config_changed_at,synced_at`)
  ok(!!agentRow[0]?.config_changed_at, 'config changes mark the agent for re-deploy (auto-sync when ElevenLabs is connected)')
  ok(!p._errors.length, `owner: no console errors ${p._errors.slice(0, 3).join(' | ')}`)

  // ---- mobile
  const m = await page(true)
  await login(m, `/panel?firma=${co.id}`, OWNER)
  await m.goto(`${B}/panel/dzisiaj`, { waitUntil: 'networkidle0' }); await sleep(1200)
  ok(await noOverflow(m), 'mobile dzisiaj: no horizontal overflow')
  await shot(m, 'm1-today', true)
  await m.goto(`${B}/panel/kalendarz?d=${day}`, { waitUntil: 'networkidle0' }); await sleep(1200)
  ok(await noOverflow(m), 'mobile kalendarz: no page overflow')
  ok((await m.$$('.rc-m__day')).length === 7 && (await m.$$('.rc-m__ev')).length >= 2, 'mobile kalendarz: week strip + day list')
  await shot(m, 'm2-calendar')
  await click(m, '.rc-m__chip', 'Kasia'); await sleep(900)
  ok((await m.$$('.rc-m__gap')).length >= 1, 'mobile kalendarz: free gaps for one person')
  await shot(m, 'm2b-calendar-person')
  await click(m, '.rc-m__gap', 'Wolne'); await sleep(1500)
  ok(!!(await m.$('.ap-modal .rc-slot, .ap-modal input[type=time]')), 'tap on a gap opens the booking form')
  await m.keyboard.press('Escape'); await sleep(400)
  await click(m, '.ap-seg button', 'Siatka'); await sleep(900)
  ok((await m.$$('.rc-cal__col')).length === 1, 'mobile grid: one column for the chosen person')
  await shot(m, 'm2c-calendar-grid')
  await m.goto(`${B}/panel/asystent`, { waitUntil: 'networkidle0' }); await sleep(1200)
  ok(await noOverflow(m), 'mobile asystent: no overflow')
  await shot(m, 'm3-assistant', true)
  ok(!m._errors.length, `mobile: no console errors ${m._errors.slice(0, 3).join(' | ')}`)

  // ---- admin
  const a = await page(false, await browser.createBrowserContext())
  await login(a, '/admin/recepcja', ADMIN)
  t = await text(a)
  ok(t.includes('Konto ElevenLabs') && t.includes('Numery telefonów') && t.includes('QA Barber Studio'), 'admin: reception page')
  await shot(a, '12-admin', true)
  await click(a, '.btn', 'Sprawdź'); await sleep(2500)
  ok((await text(a)).includes('Konto ElevenLabs'), 'admin: page survives an action (no white screen)')
  ok(!a._errors.length, `admin: no console errors ${a._errors.slice(0, 3).join(' | ')}`)
} catch (e) {
  ok(false, `exception: ${e.message}`)
} finally {
  await browser.close(); srv.close()
  // the auto-sync may have created a real agent + knowledge doc in ElevenLabs — remove them too
  const [ag] = await svc(`/rest/v1/rc_agents?company_id=eq.${co.id}&select=agent_id,kb_doc_id`).catch(() => [])
  const elKey = await svc('/rest/v1/rpc/rc_secret', { method: 'POST', body: JSON.stringify({ p_name: 'rc_el_api_key' }) }).catch(() => null)
  if (typeof elKey === 'string' && ag?.agent_id && ag.agent_id !== AGENT) await fetch(`https://api.elevenlabs.io/v1/convai/agents/${ag.agent_id}`, { method: 'DELETE', headers: { 'xi-api-key': elKey } })
  if (typeof elKey === 'string' && ag?.kb_doc_id) await fetch(`https://api.elevenlabs.io/v1/convai/knowledge-base/${ag.kb_doc_id}?force=true`, { method: 'DELETE', headers: { 'xi-api-key': elKey } })
  await svc(`/rest/v1/companies?id=eq.${co.id}`, { method: 'DELETE' })
  for (const id of users) await svc(`/auth/v1/admin/users/${id}`, { method: 'DELETE' })
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK', '— cleaned up')
  process.exit(fails.length ? 1 : 0)
}
