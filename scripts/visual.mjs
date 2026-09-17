/** Visual spot-checks: preloader frames, assistant stages, sticky industries mid-scroll, loyalty. */
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { puppeteer, chromePath } from './chrome.mjs'
const OUT = process.env.QC_OUT || 'qc-out'; mkdirSync(OUT, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = createServer((req, res) => { let p = req.url.split('?')[0]; if (p === '/') p = '/index.html'; let f = join('dist', p); if (!existsSync(f) || statSync(f).isDirectory()) f = 'dist/index.html'; res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream'); res.end(readFileSync(f)) }).listen(0)
const base = `http://localhost:${srv.address().port}/`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 })
await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'languages', { get: () => ['de-DE'] }); Object.defineProperty(navigator, 'language', { get: () => 'de-DE' }); localStorage.clear() })
const t0 = Date.now()
await page.goto(base, { waitUntil: 'domcontentloaded' })
const at = async (ms, name) => { const d = t0 + ms - Date.now(); if (d > 0) await sleep(d); await page.screenshot({ path: `${OUT}/${name}.png` }) }
await at(700, 'v-pre-0'); await at(1900, 'v-pre-1'); await at(2600, 'v-pre-2')
await at(3500 + 3000 + 300, 'v-la-square'); await at(3500 + 3000 + 1500, 'v-la-thinking'); await at(3500 + 3000 + 3200, 'v-la-detected'); await at(3500 + 3000 + 4600, 'v-la-ask')
// dismiss cookie + assistant
await page.evaluate(() => { document.querySelector('.ck .btn--primary')?.click(); document.querySelectorAll('.la .btn--ghost')[0]?.click() }); await sleep(900)
// industries sticky mid scroll
const info = await page.evaluate(() => { const s = document.getElementById('industries'); const r = s.getBoundingClientRect(); return { top: r.top + scrollY, h: r.height } })
console.log('industries', info)
for (const [k, f] of [['0', 0.0], ['1', 0.35], ['2', 0.7], ['3', 1.0]]) {
  await page.evaluate((y) => window.scrollTo(0, y), info.top + (info.h - 900) * f); await sleep(900)
  await page.screenshot({ path: `${OUT}/v-ind-${k}.png` })
}
for (const id of ['loyalty', 'features', 'waitlist', 'app']) {
  await page.evaluate((id) => document.getElementById(id).scrollIntoView(), id); await sleep(900)
  await page.screenshot({ path: `${OUT}/v-${id}.png` })
}
await page.evaluate(() => window.scrollTo(0, 0)); await sleep(700); await page.screenshot({ path: `${OUT}/v-hero.png` })
await browser.close(); srv.close(); console.log('visual done')
