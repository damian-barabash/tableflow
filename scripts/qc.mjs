/**
 * QC: serves dist/, opens the page at 1440 and 390, waits for the intro, screenshots,
 * checks console errors, horizontal overflow, reveal counters, and the language assistant
 * for en (auto-switch) and de (ask). Usage: node scripts/qc.mjs [--lang=en|de|pl]
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { puppeteer, chromePath } from './chrome.mjs'

const OUT = process.env.QC_OUT || 'qc-out'
mkdirSync(OUT, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain' }
const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  let f = join('dist', p)
  if ((!existsSync(f) || statSync(f).isDirectory()) && existsSync(f + '.html')) f += '.html'   // GitHub Pages: /regulamin → regulamin.html
  if (!existsSync(f) || statSync(f).isDirectory()) f = join('dist', '404.html')
  res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream')
  res.end(readFileSync(f))
}).listen(0)
const port = srv.address().port
const base = `http://localhost:${port}/`

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox'] })
const problems = []
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function run(name, { width, height, lang = 'pl', stored = null }) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument((lang, stored) => {
    Object.defineProperty(navigator, 'languages', { get: () => [lang] })
    Object.defineProperty(navigator, 'language', { get: () => lang })
    localStorage.clear(); if (stored) localStorage.setItem('tf_lang', stored)
  }, lang, stored)
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  page.on('requestfailed', r => { if (!r.url().includes('supabase')) errors.push('REQFAIL ' + r.url()) })
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.screenshot({ path: `${OUT}/${name}-intro-0.png` })
  await sleep(1400); await page.screenshot({ path: `${OUT}/${name}-intro-1.png` })
  await sleep(2200)                                   // intro done (~3.2 s)
  await page.screenshot({ path: `${OUT}/${name}-hero.png` })
  // scroll through to trigger reveals
  const H = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < H; y += Math.round(height * .7)) { await page.evaluate(y => window.scrollTo(0, y), y); await sleep(120) }
  await sleep(600)
  const info = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    rv: document.querySelectorAll('.rv').length, rvIn: document.querySelectorAll('.rv.in').length,
    lang: document.documentElement.lang, title: document.title,
    h1: document.querySelector('h1')?.textContent?.slice(0, 80),
    wide: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 1 && getComputedStyle(e).position !== 'fixed' }).slice(0, 8).map(e => e.tagName + '.' + String(e.className).split(' ')[0]),
  }))
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(500)
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true })
  // language assistant state (visible after 3s post-intro; total ~6.5s from load — we are past that)
  const la = await page.evaluate(() => { const el = document.querySelector('.la'); return el ? el.textContent.trim().slice(0, 160) : null })
  await page.screenshot({ path: `${OUT}/${name}-assistant.png`, clip: { x: 0, y: Math.max(0, height - 220), width, height: 220 } })
  const cookie = await page.evaluate(() => !!document.querySelector('.ck'))
  const res = { name, ...info, errors: errors.slice(0, 6), assistant: la, cookieBanner: cookie }
  if (info.overflow) problems.push(`${name}: horizontal overflow ${info.scrollW}>${info.clientW} ${info.wide.join(',')}`)
  if (errors.length) problems.push(`${name}: console errors: ${errors.slice(0, 3).join(' | ')}`)
  if (info.rv !== info.rvIn) problems.push(`${name}: reveal ${info.rvIn}/${info.rv}`)
  console.log(JSON.stringify(res))
  await page.close()
  return res
}

const only = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1]
if (!only || only === 'pl') await run('desktop-pl', { width: 1440, height: 900, lang: 'pl-PL' })
if (!only || only === 'pl') await run('mobile-pl', { width: 390, height: 844, lang: 'pl-PL' })
if (!only || only === 'en') await run('desktop-en', { width: 1440, height: 900, lang: 'en-US' })
if (!only || only === 'de') await run('desktop-de', { width: 1440, height: 900, lang: 'de-DE' })
if (!only || only === 'ru') await run('mobile-ru', { width: 390, height: 844, lang: 'ru-RU' })

// policy page
{
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 })
  await page.evaluateOnNewDocument(() => { localStorage.setItem('tf_lang', 'pl') })
  await page.goto(base + 'polityka-prywatnosci', { waitUntil: 'networkidle0' }); await sleep(3600)
  await page.screenshot({ path: `${OUT}/policy.png` })
  const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent)
  console.log(JSON.stringify({ name: 'policy', h1 }))
  await page.close()
}
await browser.close(); srv.close()
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'QC OK')
process.exit(problems.length ? 1 : 0)
