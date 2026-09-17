/**
 * Post-build SEO step (runs after `vite build`):
 *  - one HTML file per route (GitHub Pages serves /regulamin from regulamin.html with HTTP 200)
 *    with its own title / description / canonical / robots / OG and JSON-LD (@graph);
 *  - a DOM snapshot of each indexable route inside #root (headless Chrome, PL, CMS overrides applied),
 *    so crawlers without JS still read the full content; React replaces it on load (see main.tsx);
 *  - 404.html (noindex), sitemap.xml, robots.txt, llms.txt.
 * Without Chrome the snapshots are skipped (warning) — set PRERENDER_STRICT=1 to fail instead.
 */
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { pl } from '../src/i18n/pl.ts'
import { ROUTES, SITE_URL, SITE_NAME, ROBOTS_INDEX, ROBOTS_NOINDEX, ROBOTS_PRIVATE, clip } from '../src/seo/routes.ts'

const DIST = 'dist'
const SUPABASE_URL = 'https://ahtjgghocwegyepxoeru.supabase.co'
const SUPABASE_KEY = 'sb_publishable_7zS8ao7Vkz0zCPVb7_tWBw_GKTjQk8e'   // public (same as in src/lib/supabase.ts)
const TODAY = new Date().toISOString().slice(0, 10)
const template = readFileSync(join(DIST, 'index.html'), 'utf8')

// ---------- dictionary + published CMS overrides (PL) ----------
async function publishedOverrides() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_content?locale=eq.pl&status=eq.published&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8000),
    })
    const rows = res.ok ? await res.json() : []
    return rows[0]?.data ?? {}
  } catch (e) { console.warn('prerender: CMS overrides unavailable →', e.message); return {} }
}
function applyOverrides(dict, ov) {
  const out = structuredClone(dict)
  for (const [path, value] of Object.entries(ov)) {
    const keys = path.split('.'); let cur = out
    for (let i = 0; i < keys.length - 1 && cur != null; i++) cur = cur[keys[i]]
    const last = keys.at(-1)
    if (cur != null && typeof cur[last] === 'string' && typeof value === 'string') cur[last] = value
  }
  return out
}
const d = applyOverrides(pl, await publishedOverrides())
const text = s => String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

// "17 września 2026" → 2026-09-17 (policy lastmod)
const PL_MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
function plDate(s) {
  const m = /^(\d{1,2})\s+(\S+)\s+(\d{4})$/.exec(String(s).trim()); const mi = m ? PL_MONTHS.indexOf(m[2]) : -1
  return mi < 0 ? TODAY : `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}
const POLICY_KEY = { '/polityka-prywatnosci': 'privacy', '/polityka-cookies': 'cookies', '/regulamin': 'terms' }
const lastmod = r => POLICY_KEY[r.path] ? plDate(d.policies[POLICY_KEY[r.path]].updated) : TODAY
const urlOf = r => r.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${r.path}`

// ---------- structured data ----------
const ORG_ID = `${SITE_URL}/#organization`, SITE_ID = `${SITE_URL}/#website`
const organization = {
  '@type': 'Organization', '@id': ORG_ID, name: SITE_NAME, alternateName: 'TableFlow', url: `${SITE_URL}/`,
  logo: { '@type': 'ImageObject', '@id': `${SITE_URL}/#logo`, url: `${SITE_URL}/icon-512.png`, width: 512, height: 512, caption: SITE_NAME },
  image: { '@id': `${SITE_URL}/#logo` },
  description: text(d.meta.description),
  email: 'hello@tableflow.pl',
  // operator of the service — same data as in the policies / footer
  legalName: 'Maksym Yehorov Maksikon',
  taxID: '9512594289',
  identifier: [{ '@type': 'PropertyValue', propertyID: 'NIP', value: '9512594289' }, { '@type': 'PropertyValue', propertyID: 'REGON', value: '528375783' }],
  address: { '@type': 'PostalAddress', streetAddress: 'ul. Zamiany 18 lok. 46', postalCode: '02-786', addressLocality: 'Warszawa', addressCountry: 'PL' },
  contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: 'hello@tableflow.pl', availableLanguage: ['Polish', 'English'] }],
  areaServed: { '@type': 'Country', name: 'Polska' },
}
const website = { '@type': 'WebSite', '@id': SITE_ID, url: `${SITE_URL}/`, name: SITE_NAME, alternateName: ['TableFlow', 'tableflow.pl'], description: text(d.meta.description), inLanguage: 'pl-PL', publisher: { '@id': ORG_ID } }
const ogImage = { '@type': 'ImageObject', '@id': `${SITE_URL}/#ogimage`, url: `${SITE_URL}/og.png`, width: 1200, height: 630, caption: `${SITE_NAME} — recepcja AI dla każdej branży` }

function graphFor(r) {
  const url = urlOf(r), title = r.title(d), description = r.description(d)
  const page = {
    '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description, inLanguage: 'pl-PL',
    isPartOf: { '@id': SITE_ID }, publisher: { '@id': ORG_ID }, dateModified: lastmod(r),
  }
  if (r.path === '/') {
    page.about = { '@id': ORG_ID }
    page.primaryImageOfPage = { '@id': `${SITE_URL}/#ogimage` }
    page.mainEntity = { '@id': `${SITE_URL}/#service` }
    const service = {
      '@type': 'Service', '@id': `${SITE_URL}/#service`, name: `${SITE_NAME} — recepcja AI`,
      serviceType: 'Recepcja AI: odbieranie połączeń i rezerwacja wizyt',
      description: text(d.hero.sub), provider: { '@id': ORG_ID }, brand: { '@type': 'Brand', name: SITE_NAME },
      areaServed: { '@type': 'Country', name: 'Polska' }, availableLanguage: ['Polish', 'English'],
      audience: { '@type': 'BusinessAudience', audienceType: d.hero.industries.map(text).join(', ') },
      hasOfferCatalog: { '@type': 'OfferCatalog', name: text(d.platform.h2), itemListElement: d.platform.cards.map(c => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: text(c.title), description: text(c.desc) } })) },
    }
    const faq = {
      '@type': 'FAQPage', '@id': `${SITE_URL}/#faq`, url: `${SITE_URL}/#faq`, inLanguage: 'pl-PL', isPartOf: { '@id': `${url}#webpage` },
      mainEntity: d.faq.items.map(it => ({ '@type': 'Question', name: text(it.q), acceptedAnswer: { '@type': 'Answer', text: text(it.a) } })),
    }
    return [organization, website, ogImage, page, service, faq]
  }
  page.breadcrumb = { '@id': `${url}#breadcrumb` }
  const crumbs = { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: [
    { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: title.replace(` — ${SITE_NAME}`, ''), item: url },
  ] }
  return [organization, website, page, crumbs]
}
const jsonLd = graph => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`

// ---------- DOM snapshots ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }
async function snapshots(paths) {
  let puppeteer, chromePath
  try { ({ puppeteer, chromePath } = await import('./chrome.mjs')); chromePath = chromePath() } catch (e) {
    if (process.env.PRERENDER_STRICT) throw e
    console.warn('prerender: no Chrome → skipping DOM snapshots (meta/JSON-LD are still written)'); return {}
  }
  const srv = createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0])
    const f = join(DIST, p)
    if (p !== '/' && existsSync(f) && statSync(f).isFile()) { res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream'); res.end(readFileSync(f)); return }
    res.setHeader('Content-Type', MIME['.html']); res.end(template)
  }).listen(0)
  const base = `http://localhost:${srv.address().port}`
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const out = {}
  try {
    for (const path of paths) {
      const page = await browser.newPage()
      await page.setViewport({ width: 1440, height: 900 })
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])   // skips the intro
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'languages', { get: () => ['pl-PL', 'pl'] })
        Object.defineProperty(navigator, 'language', { get: () => 'pl-PL' })
        try { localStorage.setItem('tf_lang', 'pl') } catch { /* ignore */ }
      })
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(base + path, { waitUntil: 'networkidle0', timeout: 60000 })
      await page.waitForSelector('main, h1', { timeout: 15000 })
      await new Promise(r => setTimeout(r, 800))
      const html = await page.evaluate(() => {
        const root = document.getElementById('root').cloneNode(true)
        // UI chrome that is not page content
        root.querySelectorAll('.ck, .la-wrap, .la, script, [data-no-snapshot]').forEach(n => n.remove())
        root.querySelectorAll('[style]').forEach(n => { n.style.removeProperty('--px') })
        root.querySelectorAll('[data-desync]').forEach(n => n.removeAttribute('data-desync'))
        return root.innerHTML
      })
      if (errors.length) throw new Error(`prerender ${path}: ${errors.join(' | ')}`)
      if (!/<h1[\s>]/.test(html)) throw new Error(`prerender ${path}: no <h1> in snapshot`)
      out[path] = html
      await page.close()
    }
  } finally { await browser.close(); srv.close() }
  return out
}

// ---------- head rewriting ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function setAttr(html, re, value) {
  if (!re.test(html)) throw new Error(`prerender: template tag not found ${re}`)
  return html.replace(re, (_m, pre, post) => `${pre}${esc(value)}${post}`)
}
function page(r, body) {
  const url = urlOf(r), title = r.title(d), desc = r.description(d)
  const robots = r.path === '/edit-mod' ? ROBOTS_PRIVATE : r.index ? ROBOTS_INDEX : ROBOTS_NOINDEX
  let h = template
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  h = setAttr(h, /(<meta name="robots" content=")[^"]*(")/, robots)
  for (const re of [/(<meta name="description" content=")[^"]*(")/, /(<meta property="og:description" content=")[^"]*(")/, /(<meta name="twitter:description" content=")[^"]*(")/]) h = setAttr(h, re, desc || d.meta.description)
  for (const re of [/(<meta property="og:title" content=")[^"]*(")/, /(<meta name="twitter:title" content=")[^"]*(")/]) h = setAttr(h, re, title)
  h = setAttr(h, /(<meta property="og:url" content=")[^"]*(")/, url)
  if (r.index) {
    h = setAttr(h, /(<link rel="canonical" href=")[^"]*(")/, url)
    h = h.replace(/(<link rel="alternate" hreflang="[^"]+" href=")[^"]*(")/g, (_m, a, b) => `${a}${url}${b}`)
    h = h.replace('<!--seo:jsonld-->', jsonLd(graphFor(r)))
    if (r.path !== '/') h = h.replace('<meta property="og:type" content="website" />', '<meta property="og:type" content="article" />')
  } else {
    // noindex pages: no canonical / hreflang (mixed signals), no structured data
    h = h.replace(/\s*<link rel="canonical" href="[^"]*" \/>/, '').replace(/\s*<link rel="alternate" hreflang="[^"]+" href="[^"]*" \/>/g, '').replace('<!--seo:jsonld-->', '')
  }
  if (body) h = h.replace('<div id="root"></div>', `<div id="root" data-prerendered>${body}</div>`)
  return h
}

const indexable = ROUTES.filter(r => r.index)
const snaps = await snapshots(indexable.map(r => r.path))
for (const r of ROUTES) writeFileSync(join(DIST, r.file), page(r, snaps[r.path]))

// 404: same app shell (renders the home page for unknown paths) but never indexed, no canonical
writeFileSync(join(DIST, '404.html'), template
  .replace(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${ROBOTS_NOINDEX}" />`)
  .replace(/\s*<link rel="canonical" href="[^"]*" \/>/, '')
  .replace(/\s*<link rel="alternate" hreflang="[^"]+" href="[^"]*" \/>/g, '')
  .replace('<!--seo:jsonld-->', ''))

// sitemap.xml
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${ROUTES.filter(r => r.sitemap).map(r => `  <url>
    <loc>${urlOf(r)}</loc>
    <lastmod>${lastmod(r)}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority.toFixed(1)}</priority>
    <xhtml:link rel="alternate" hreflang="pl" href="${urlOf(r)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${urlOf(r)}" />${r.path === '/' ? `
    <image:image><image:loc>${SITE_URL}/og.png</image:loc></image:image>` : ''}
  </url>`).join('\n')}
</urlset>
`)

// robots.txt
writeFileSync(join(DIST, 'robots.txt'), `# ${SITE_NAME} — ${SITE_URL}
User-agent: *
Allow: /
Disallow: /edit-mod

Sitemap: ${SITE_URL}/sitemap.xml
`)

// llms.txt — plain-language summary for AI assistants / answer engines (llmstxt.org)
const sec = (h, lines) => `## ${text(h)}\n\n${lines.filter(Boolean).join('\n')}\n`
writeFileSync(join(DIST, 'llms.txt'), [
  `# ${SITE_NAME}\n`,
  `> ${text(d.meta.description)}\n`,
  `${text(d.hero.sub)}\n`,
  `Status: ${text(d.footer.status)}. ${text(d.hero.note)}. Strona: ${SITE_URL}/ (PL; dostępne też EN, RU, FR, ES).\n`,
  sec(d.platform.h2, [text(d.platform.sub), '', ...d.platform.cards.map(c => `- **${text(c.title)}**: ${text(c.desc)}`)]),
  sec(d.industries.h2, [text(d.industries.sub), '', `- ${d.hero.worksFor}: ${d.hero.industries.map(text).join(', ')}`]),
  sec(d.loyalty.h2, [text(d.loyalty.sub), '', ...d.loyalty.bullets.map(b => `- ${text(b)}`)]),
  sec(d.app.h2, [text(d.app.sub), '', ...d.app.features.map(f => `- **${text(f.title)}**: ${text(f.desc)}`)]),
  sec(d.faq.h2, d.faq.items.flatMap(it => [`### ${text(it.q)}`, '', text(it.a), ''])),
  sec('Linki', [
    `- [Strona główna](${SITE_URL}/): opis produktu i lista oczekujących`,
    `- [${d.policies.privacy.title}](${SITE_URL}/polityka-prywatnosci)`,
    `- [${d.policies.cookies.title}](${SITE_URL}/polityka-cookies)`,
    `- [${d.policies.terms.title}](${SITE_URL}/regulamin)`,
    `- Kontakt: hello@tableflow.pl`,
    `- Operator: ${text(d.footer.company)}`,
  ]),
].join('\n'))

console.log(`prerender: ${ROUTES.length} routes (${Object.keys(snaps).length} snapshots), 404.html, sitemap.xml, robots.txt, llms.txt · ${clip(d.meta.title, 60)}`)
