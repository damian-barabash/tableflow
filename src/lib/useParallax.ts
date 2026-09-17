import { useEffect } from 'react'

/**
 * Depth parallax: elements with data-px="<factor>" move against scroll proportionally to their
 * distance from the viewport centre. Bigger factor = closer to the viewer = moves more.
 * Disabled for reduced-motion and on narrow screens.
 */
/** Global damping: factors in markup are design values, divided by 6 after user feedback (÷3, then ÷2 more). */
const SCALE = 1 / 6

export function useParallax(dep?: unknown) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.innerWidth < 760) return
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-px]'))
    if (!els.length) return
    const cur = new Map<HTMLElement, number>()
    let raf = 0
    const update = () => {
      raf = 0
      const vh = window.innerHeight
      for (const el of els) {
        const r = el.getBoundingClientRect()
        if (r.bottom < -vh || r.top > vh * 2) continue
        const prev = cur.get(el) ?? 0
        const centre = r.top - prev + r.height / 2 - vh / 2
        const f = parseFloat(el.dataset.px || '0') * SCALE
        const y = -centre * f
        if (Math.abs(y - prev) < .1) continue
        cur.set(el, y)
        el.style.setProperty('--px', `${y.toFixed(1)}px`)
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); els.forEach(el => { el.style.removeProperty('--px') }) }
  }, [dep])
}
