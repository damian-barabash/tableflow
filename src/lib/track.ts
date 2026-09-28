/**
 * Cookieless page analytics (no storage, no identifiers on the device):
 * the server derives a daily-rotating anonymous visitor hash from IP + UA and never stores the IP.
 * Per page view we send: path, referrer host, UTM, language, screen width; then pings with
 * time on page, max scroll depth, sections seen and clicked buttons/links.
 */
import { useEffect } from 'react'
import { SUPABASE_KEY, SUPABASE_URL } from './supabase'

const PRIVATE = /^\/(panel|admin|edit-mod|s)(\/|$)/
const SKIP_CLASSES = new Set(['section', 'section--tight', 'dots', 'dark', 'mesh', 'rv', 'grain'])

function post(fn: string, body: Record<string, unknown>) {
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', keepalive: true, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})
  } catch { /* ignore */ }
}
const sectionName = (el: Element) => el.id || [...el.classList].find(c => !SKIP_CLASSES.has(c)) || ''

let firstView = true

export function useTracking(path: string, locale: string) {
  useEffect(() => {
    if (PRIVATE.test(path)) return
    if (navigator.webdriver || navigator.doNotTrack === '1') return   // prerender/QC bots, Do Not Track
    const id = crypto.randomUUID()
    const start = performance.now()
    let scroll = 0, dirty = false
    const sections = new Set<string>(), sent = new Set<string>()
    const params = new URLSearchParams(window.location.search)
    const utm: Record<string, string> = {}
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) { const v = params.get(k); if (v) utm[k] = v.slice(0, 100) }
    if (!utm.utm_source && params.get('src')) utm.utm_source = params.get('src')!.slice(0, 60)
    post('track_view', { p_id: id, p_path: path, p_referrer: firstView ? document.referrer || null : null, p_utm: utm, p_locale: locale, p_screen: window.innerWidth })
    firstView = false

    const ping = (click?: string) => {
      const fresh = [...sections].filter(s => !sent.has(s))
      if (!dirty && !fresh.length && !click) return
      fresh.forEach(s => sent.add(s)); dirty = false
      post('track_ping', { p_id: id, p_duration: Math.round(performance.now() - start), p_scroll: scroll, p_sections: fresh, p_click: click ?? null })
    }
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight
      const p = h <= 0 ? 100 : Math.min(100, Math.round((window.scrollY / h) * 100))
      if (p > scroll) { scroll = p; dirty = true }
    }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const n = sectionName(e.target); if (n && !sections.has(n)) { sections.add(n); dirty = true } } }), { threshold: .35 })
    const observe = () => document.querySelectorAll('main section, main > div > section').forEach(s => io.observe(s))
    const t1 = setTimeout(observe, 800), t2 = setTimeout(observe, 4000)
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('a, button')
      if (!el || el.closest('.ck, .la-wrap')) return
      const label = (el as HTMLElement).dataset.track || (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 36)
      if (!label) return
      const where = el.closest('header') ? 'menu' : el.closest('footer') ? 'stopka' : sectionName(el.closest('section') ?? document.body) || 'strona'
      ping(`${where}: ${label}`)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') { dirty = true; ping() } }
    const timer = setInterval(() => { if (document.visibilityState === 'visible') { dirty = true; ping() } }, 15000)
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', onClick, true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      dirty = true; ping()
      clearTimeout(t1); clearTimeout(t2); clearInterval(timer); io.disconnect()
      window.removeEventListener('scroll', onScroll); document.removeEventListener('click', onClick, true)
      document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide)
    }
  }, [path, locale])
}
