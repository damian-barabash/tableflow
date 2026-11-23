/** SEO/routing regression: clean URLs, legacy #/ redirects, 404 + noindex, canonical, FAQ in DOM, no-JS snapshot. Run after `npm run build`. */
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { puppeteer, chromePath } from './chrome.mjs'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' }
// GitHub Pages emulation: exact file → 200, /foo → foo.html → 200, else 404.html with 404
const srv = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  let f = join('dist', p === '/' ? 'index.html' : p), code = 200
  if (!(existsSync(f) && statSync(f).isFile())) { if (existsSync(f + '.html')) f += '.html'; else { f = 'dist/404.html'; code = 404 } }
  res.writeHead(code, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f))
}).listen(0)
const B = `http://localhost:${srv.address().port}`
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox'] })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fails = []
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m) }
async function open(url, { noJs = false } = {}) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 850 })
  if (noJs) await page.setJavaScriptEnabled(false)
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('tf_lang', 'pl'); localStorage.setItem('tf_consent', 'essential') } catch {} })
  page._errors = []
  page.on('pageerror', e => page._errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && !/supabase|Failed to load resource/.test(m.text())) page._errors.push(m.text()) })
  const resp = await page.goto(B + url, { waitUntil: 'networkidle0' })
  if (!noJs) await sleep(4200)
  page._status = resp.status()
  return page
}
const head = page => page.evaluate(() => ({
  url: location.pathname + location.search + location.hash, title: document.title,
  robots: document.querySelector('meta[name=robots]')?.content, canonical: document.querySelector('link[rel=canonical]')?.href ?? null,
  h1: document.querySelector('h1')?.textContent.trim().slice(0, 60), prer: document.getElementById('root').hasAttribute('data-prerendered'),
}))
let p, h
// 1. clean policy URL
p = await open('/regulamin'); h = await head(p)
ok(p._status === 200 && h.url === '/regulamin' && /^Regulamin/.test(h.h1) && h.canonical === 'https://tableflow.studio/regulamin' && !h.prer && !p._errors.length, `/regulamin 200 → ${JSON.stringify(h)} ${p._errors}`)
// footer link to FAQ from a policy → home + scroll
await p.evaluate(() => [...document.querySelectorAll('footer a')].find(a => a.getAttribute('href') === '/#faq').click()); await sleep(1500)
h = await head(p); const y = await p.evaluate(() => Math.round(document.getElementById('faq').getBoundingClientRect().top))
ok(h.url === '/#faq' && Math.abs(y) < 200 && h.canonical === 'https://tableflow.studio/', `footer FAQ → ${h.url}, faq top ${y}, canonical ${h.canonical}`)
// FAQ: second answer in DOM, opens on click
const faq = await p.evaluate(async () => { const it = document.querySelectorAll('.faq__item')[1]; const a = it.querySelector('.faq__a'); const before = a.getBoundingClientRect().height; it.querySelector('button').click(); await new Promise(r => setTimeout(r, 700)); return { text: a.textContent.length, before, after: a.getBoundingClientRect().height, n: document.querySelectorAll('.faq__a p').length } })
ok(faq.n >= 7 && faq.before === 0 && faq.after > 20 && faq.text > 20, `FAQ answers in DOM ${JSON.stringify(faq)}`)
// SPA link to privacy
await p.evaluate(() => [...document.querySelectorAll('footer a')].find(a => a.getAttribute('href') === '/polityka-prywatnosci').click()); await sleep(800)
h = await head(p); ok(h.url === '/polityka-prywatnosci' && h.title.startsWith('Polityka prywatności') && h.canonical.endsWith('/polityka-prywatnosci'), `SPA → privacy ${JSON.stringify(h)}`)
await p.goBack(); await sleep(600); h = await head(p); ok(h.url.startsWith('/') && /Recepcja AI/.test(h.h1), `back → ${h.url}`)
ok(!p._errors.length, `no errors in nav session ${p._errors}`); await p.close()
// 2. legacy hash routes (printed QR)
p = await open('/#/karta?src=qr'); h = await head(p)
ok(h.url === '/karta?src=qr' && h.robots.startsWith('noindex') && h.canonical === null && !p._errors.length, `legacy QR → ${JSON.stringify(h)}`)
const stamped = await p.evaluate(() => document.body.textContent.includes('10/10') || !!document.querySelector('.karta form, form'))
ok(stamped, `karta animation/form present`); await p.close()
p = await open('/#/polityka-cookies'); h = await head(p); ok(h.url === '/polityka-cookies' && /cookies/i.test(h.h1), `legacy policy → ${h.url} ${h.h1}`); await p.close()
p = await open('/regulamin/'); h = await head(p); ok(h.url === '/regulamin' && /^Regulamin/.test(h.h1), `trailing slash → ${h.url} (${p._status})`); await p.close()
p = await open('/regulamin.html'); h = await head(p); ok(h.url === '/regulamin' && h.canonical.endsWith('/regulamin'), `.html → ${h.url}`); await p.close()
// 3. editor
p = await open('/edit-mod'); h = await head(p)
const login = await p.evaluate(() => !!document.querySelector('input[type=password]'))
ok(p._status === 200 && login && h.robots === 'noindex, nofollow' && !p._errors.length, `/edit-mod login form, ${h.robots}`); await p.close()
p = await open('/#/edit-mod?page=karta'); h = await head(p); ok(h.url.startsWith('/edit-mod'), `legacy editor → ${h.url}`); await p.close()
// 4. unknown path → 404 status, noindex
p = await open('/nie-ma-takiej'); h = await head(p)
const nf = await p.evaluate(() => ({ eyebrow: document.querySelector('.nf .eyebrow')?.textContent, links: document.querySelectorAll('.nf .ip-others a').length }))
ok(p._status === 404 && h.robots.startsWith('noindex') && h.canonical === null && nf.eyebrow === '404' && nf.links >= 7, `unknown → ${p._status} ${h.robots} real 404 page ${JSON.stringify(nf)}`); await p.close()
// 4b. language URLs: /en is English, indexable, with a 5-language hreflang cluster; switching language moves the URL
const alts = pg => pg.evaluate(() => [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(l => `${l.hreflang}=${new URL(l.href).pathname}`).sort().join(','))
p = await open('/en'); h = await head(p)
ok(p._status === 200 && h.url === '/en' && /AI receptionist/i.test(h.h1) && h.canonical === 'https://tableflow.studio/en' && (await p.evaluate(() => document.documentElement.lang)) === 'en' && !p._errors.length, `/en → ${JSON.stringify(h)} ${p._errors}`)
ok(await alts(p) === 'en=/en,es=/es,fr=/fr,pl=/,ru=/ru,x-default=/', `/en hreflang ${await alts(p)}`)
await p.evaluate(() => [...document.querySelectorAll('footer button')].find(b => b.textContent === 'Polski').click()); await sleep(1500)
h = await head(p); ok(h.url === '/' && /Recepcja AI/.test(h.h1) && h.canonical === 'https://tableflow.studio/', `switch to Polski → ${h.url} ${h.h1}`)
await p.evaluate(() => [...document.querySelectorAll('footer button')].find(b => b.textContent === 'Русский').click()); await sleep(1500)
h = await head(p); ok(h.url === '/ru' && h.canonical === 'https://tableflow.studio/ru', `switch to Русский → ${h.url}`); await p.close()
p = await open('/fr', { noJs: true }); ok(p._status === 200 && /réception|IA/i.test(await p.evaluate(() => document.querySelector('h1')?.textContent || '')), `/fr no-JS snapshot in French`); await p.close()
// 4c. industry landing pages
p = await open('/recepcja-ai-barbershop'); h = await head(p)
const ip = await p.evaluate(() => ({ faq: document.querySelectorAll('.faq__a p').length, others: document.querySelectorAll('.ip-others a').length, ld: [...document.querySelectorAll('script[type="application/ld+json"]')].length }))
ok(p._status === 200 && /barbershop/i.test(h.h1) && h.robots.startsWith('index') && h.canonical === 'https://tableflow.studio/recepcja-ai-barbershop' && ip.faq >= 4 && ip.others === 6 && !p._errors.length, `industry page ${JSON.stringify({ ...h, ...ip })} ${p._errors}`)
await p.evaluate(() => [...document.querySelectorAll('.ip-others a')].find(a => a.getAttribute('href') === '/recepcja-ai-restauracja').click()); await sleep(1200)
h = await head(p); ok(h.url === '/recepcja-ai-restauracja' && /stolik/i.test(h.h1) && h.title.includes('restauracja'), `industry → industry ${h.url} ${h.title}`); await p.close()
p = await open('/recepcja-ai-gabinet', { noJs: true })
ok(p._status === 200 && (await p.evaluate(() => document.querySelectorAll('.faq__a p').length)) >= 4, 'industry no-JS snapshot with FAQ'); await p.close()
p = await open('/'); await p.evaluate(() => document.getElementById('industries').scrollIntoView())
ok((await p.evaluate(() => [...document.querySelectorAll('.ind__more')].map(a => a.getAttribute('href')))).length === 5, 'home carousel links to industry pages'); await p.close()
// 5. home anchors on the same page
p = await open('/'); h = await head(p); ok(h.canonical === 'https://tableflow.studio/' && !h.prer && h.robots.startsWith('index'), `home ${JSON.stringify(h)}`)
await p.evaluate(() => document.querySelector('.nav__links a[href="#industries"]').click()); await sleep(1200)
ok((await p.evaluate(() => Math.abs(document.getElementById('industries').getBoundingClientRect().top))) < 150, 'nav anchor scroll on home')
ok(!p._errors.length, `home errors ${p._errors}`); await p.close()
// 6. no-JS crawler view
p = await open('/', { noJs: true })
const nojs = await p.evaluate(() => ({ h1: document.querySelector('h1')?.textContent, h2: document.querySelectorAll('h2').length, faq: document.querySelectorAll('.faq__a p').length, opacity: getComputedStyle(document.getElementById('root')).opacity, links: [...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href')).filter((v, i, a) => a.indexOf(v) === i) }))
ok(nojs.h1 && nojs.h2 >= 7 && nojs.faq >= 7 && nojs.opacity === '1', `no-JS view ${JSON.stringify(nojs)}`); await p.close()
await browser.close(); srv.close()
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK'); process.exit(fails.length ? 1 : 0)
