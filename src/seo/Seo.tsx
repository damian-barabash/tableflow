import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'
import { HREFLANG, ROBOTS_INDEX, ROBOTS_NOINDEX, ROBOTS_PRIVATE, SITE_URL, routeFor } from './routes'

const OG_LOCALE = { pl: 'pl_PL', en: 'en_GB', ru: 'ru_RU', fr: 'fr_FR', es: 'es_ES' } as const

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.setAttribute('content', value)
}
function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el) }
  el.href = href
}

/**
 * Keeps <head> in sync with the route and language: title, description, canonical, robots, OG/Twitter.
 * The prerendered HTML already carries the same values; this covers client-side navigation.
 */
export function Seo() {
  const { t, locale } = useI18n()
  const { pathname } = useLocation()
  useEffect(() => {
    const r = routeFor(pathname)
    const title = (r ?? routeFor('/')!).title(t)
    const desc = (r ?? routeFor('/')!).description(t)
    const url = `${SITE_URL}${r ? (r.path === '/' ? '/' : r.path) : '/'}`
    document.title = title
    if (desc) { setMeta('name', 'description', desc); setMeta('property', 'og:description', desc); setMeta('name', 'twitter:description', desc) }
    setMeta('property', 'og:title', title); setMeta('name', 'twitter:title', title)
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:locale', OG_LOCALE[locale])
    if (r?.index) setLink('canonical', url)
    else document.head.querySelector('link[rel="canonical"]')?.remove()
    // hreflang: the language cluster of the home page, otherwise the page alone (pl + x-default)
    document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach(l => l.remove())
    if (r?.index) {
      const alts: [string, string][] = r.alternates
        ? Object.entries(r.alternates).map(([l, p]) => [l === 'x-default' ? l : HREFLANG[l as keyof typeof HREFLANG], `${SITE_URL}${p === '/' ? '/' : p}`])
        : [['pl', url], ['x-default', url]]
      for (const [hl, href] of alts) {
        const el = document.createElement('link'); el.rel = 'alternate'; el.hreflang = hl; el.href = href; document.head.appendChild(el)
      }
    }
    // unknown paths render the home page (soft 404) → never index them
    setMeta('name', 'robots', !r ? ROBOTS_NOINDEX : r.private ? ROBOTS_PRIVATE : r.index ? ROBOTS_INDEX : ROBOTS_NOINDEX)
  }, [pathname, t, locale])
  return null
}
