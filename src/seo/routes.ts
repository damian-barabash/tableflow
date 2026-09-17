/**
 * Single source of truth for per-route SEO: used by the app (<Seo>) and by scripts/prerender.mjs
 * (Node imports this file directly via type stripping — keep it free of imports and non-erasable TS).
 */
export const SITE_URL = 'https://tableflow.pl'
export const SITE_NAME = 'TableFlow AI'

interface SeoDict {
  meta: { title: string; description: string }
  policies: Record<'privacy' | 'cookies' | 'terms', { title: string; intro: string }>
  card: { title: string; newsletterSub: string }
}

export interface RouteSeo {
  path: string
  /** file written to dist/ (GitHub Pages serves /foo from foo.html with 200) */
  file: string
  index: boolean
  /** included in sitemap.xml */
  sitemap: boolean
  priority?: number
  changefreq?: 'weekly' | 'monthly' | 'yearly'
  title: (d: SeoDict) => string
  description: (d: SeoDict) => string
}

const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
/** Cuts at a word boundary to fit Google's ~155-char snippet. */
export function clip(s: string, max = 155): string {
  const t = strip(s)
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:—–-]+$/, '') + '…'
}
const policy = (k: 'privacy' | 'cookies' | 'terms') => ({
  title: (d: SeoDict) => `${d.policies[k].title} — ${SITE_NAME}`,
  description: (d: SeoDict) => clip(d.policies[k].intro),
})

export const ROUTES: RouteSeo[] = [
  { path: '/', file: 'index.html', index: true, sitemap: true, priority: 1, changefreq: 'weekly', title: d => d.meta.title, description: d => d.meta.description },
  { path: '/polityka-prywatnosci', file: 'polityka-prywatnosci.html', index: true, sitemap: true, priority: 0.3, changefreq: 'yearly', ...policy('privacy') },
  { path: '/polityka-cookies', file: 'polityka-cookies.html', index: true, sitemap: true, priority: 0.3, changefreq: 'yearly', ...policy('cookies') },
  { path: '/regulamin', file: 'regulamin.html', index: true, sitemap: true, priority: 0.3, changefreq: 'yearly', ...policy('terms') },
  // QR landing: thin, campaign-only content → keep out of the index, but let links be followed
  { path: '/karta', file: 'karta.html', index: false, sitemap: false, title: d => `${d.card.title} — ${SITE_NAME}`, description: d => clip(d.card.newsletterSub) },
  { path: '/edit-mod', file: 'edit-mod.html', index: false, sitemap: false, title: () => `Edytor — ${SITE_NAME}`, description: () => '' },
]

export function routeFor(path: string): RouteSeo | null {
  const p = path.replace(/\/+$/, '') || '/'
  return ROUTES.find(r => r.path === p) ?? null
}

export const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
export const ROBOTS_NOINDEX = 'noindex, follow'
export const ROBOTS_PRIVATE = 'noindex, nofollow'
