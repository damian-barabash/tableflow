import { useEffect } from 'react'

/** Adds .in to every .rv element when it scrolls into view. Re-scans when `dep` changes. */
export function useReveal(dep?: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.rv:not(.in)'))
    if (!els.length) return
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    els.forEach(e => io.observe(e))
    return () => io.disconnect()
  }, [dep])
}
