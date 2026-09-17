import { useEffect } from 'react'

const SEL = '.g, .btn--brand, .grad-text, .hero__works li, .voices__chips li, .wbtn, .stats__bar i, .pm__bars i.is-hi, .pm__topic i, .db__blk.is-new, .phone__item.is-new, .phone__avatar, .gpass__bar i, .ind__progress i, .tf-word__ai i, .pre__ai i, .mesh, .pm__scanline, .scanph__line, .tf-orb'

/**
 * Every gradient element gets its own random phase and slightly different duration,
 * so the shimmer never runs in lockstep across the page ("асинхронно").
 */
export function desyncGradients(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(SEL).forEach(el => {
    if (el.dataset.desync) return
    el.dataset.desync = '1'
    const names = getComputedStyle(el).animationName.split(',').map(s => s.trim())
    if (!names.length || names[0] === 'none') return
    const durs = getComputedStyle(el).animationDuration.split(',').map(s => parseFloat(s) || 9)
    const delay = names.map((_, i) => `-${(Math.random() * durs[i]).toFixed(2)}s`).join(', ')
    const dur = names.map((_, i) => `${(durs[i] * (0.8 + Math.random() * 0.5)).toFixed(2)}s`).join(', ')
    el.style.animationDelay = delay
    el.style.animationDuration = dur
  })
}

export function useDesync(dep?: unknown) {
  useEffect(() => {
    desyncGradients()
    const id = window.setTimeout(() => desyncGradients(), 1200)   // late-mounted mocks
    return () => clearTimeout(id)
  }, [dep])
}
