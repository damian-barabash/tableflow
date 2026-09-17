/** Renders public/og.png (1200×630, minimal), apple-touch-icon.png and favicon-64.png via headless Chrome. */
import { puppeteer, chromePath } from './chrome.mjs'
import { readFileSync } from 'node:fs'
const mark = (w) => readFileSync('public/logo-mark.svg', 'utf8').replace(/width="256" height="256"/, `width="${w}" height="${w}"`)
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:Inter,sans-serif;background:#fafafa;color:#1a1916}
.blob{position:absolute;right:-180px;bottom:-260px;width:720px;height:720px;border-radius:50%;filter:blur(90px);opacity:.55;
  background:radial-gradient(closest-side,#a784a3 0%,#6f6396 45%,rgba(42,52,128,0) 100%)}
.blob2{position:absolute;left:-220px;top:-260px;width:560px;height:560px;border-radius:50%;filter:blur(90px);opacity:.5;
  background:radial-gradient(closest-side,#e0c6ce 0%,rgba(224,198,206,0) 100%)}
.grain{position:absolute;inset:0;opacity:.55;mix-blend-mode:soft-light;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.25'/></svg>")}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center}
.logo{display:flex;align-items:center;gap:22px}
.word{font-size:96px;font-weight:600;letter-spacing:-.045em;line-height:1}
.ai{position:relative;display:inline-block;margin-left:.3em;padding-bottom:8px}
.ai i{position:absolute;left:0;right:0;bottom:0;height:7px;border-radius:4px;background:linear-gradient(90deg,#dcc3cb,#a784a3,#6f6396,#464f96,#2a3480)}
p{margin:0;font-size:30px;color:#52504b;letter-spacing:-.01em}
.url{position:absolute;bottom:48px;left:0;right:0;text-align:center;font-size:20px;color:#8f8a82;letter-spacing:.06em}
</style></head><body><div class="blob2"></div><div class="blob"></div><div class="grain"></div>
<div class="c"><div class="logo">${mark(110)}<div class="word">TableFlow<span class="ai">AI<i></i></span></div></div>
<p>Recepcja AI, która odbiera telefony i zapisuje klientów.</p></div>
<div class="url">tableflow.pl</div>
</body></html>`, { waitUntil: 'networkidle0' })
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: 'public/og.png' })
await page.setViewport({ width: 180, height: 180 })
await page.setContent(`<html><body style="margin:0;background:#fff">${readFileSync('public/favicon.svg', 'utf8').replace(/width="64" height="64"/, 'width="180" height="180"')}</body></html>`)
await page.screenshot({ path: 'public/apple-touch-icon.png' })
await page.setViewport({ width: 64, height: 64 })
await page.setContent(`<html><body style="margin:0;background:transparent">${readFileSync('public/favicon.svg', 'utf8')}</body></html>`)
await page.screenshot({ path: 'public/favicon-64.png', omitBackground: true })
await browser.close(); console.log('og.png + icons written')
