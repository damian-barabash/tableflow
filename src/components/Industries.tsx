import { useEffect, useRef, useState } from 'react'
import { Mark } from '../brand/Logo'
import { I } from './Icons'
import { useI18n } from '../i18n'
import { SECTION_IDS } from './Nav'
import './industries.css'

/**
 * Sticky horizontal section: on desktop the section is taller than the viewport; while it is
 * pinned, vertical scroll drives the track sideways (lerped), then the page continues downward.
 * On narrow screens it falls back to a native horizontal snap scroller.
 */
export function Industries() {
  const { t } = useI18n()
  const sec = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const prog = useRef<HTMLDivElement>(null)
  const [sticky, setSticky] = useState(false)
  const [extra, setExtra] = useState(0)
  const [idx, setIdx] = useState(0)
  const n = t.industries.scenarios.length

  useEffect(() => {
    const measure = () => {
      const isDesk = window.innerWidth >= 900 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setSticky(isDesk)
      const el = track.current
      if (!el || !isDesk) { setExtra(0); return }
      const dist = el.scrollWidth - el.clientWidth
      setExtra(Math.max(0, dist))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [n, t])

  useEffect(() => {
    if (!sticky || !extra) return
    let raf = 0, target = 0, current = 0
    const el = track.current, s = sec.current, p = prog.current
    if (!el || !s) return
    const tick = () => {
      current += (target - current) * .12
      if (Math.abs(target - current) < .3) current = target
      el.style.transform = `translate3d(${-current}px, 0, 0)`
      if (p) p.style.width = `${(current / extra) * 100}%`
      const cards = Array.from(el.children) as HTMLElement[]
      let best = 0; cards.forEach((c, i) => { if (c.offsetLeft - 40 <= current) best = i }); setIdx(best)
      if (current !== target) raf = requestAnimationFrame(tick); else raf = 0
    }
    const onScroll = () => {
      const top = s.getBoundingClientRect().top + window.scrollY
      const y = window.scrollY - top
      target = Math.min(extra, Math.max(0, y))
      if (!raf) raf = requestAnimationFrame(tick)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); el.style.transform = '' }
  }, [sticky, extra])

  const go = (i: number) => {
    const el = track.current, s = sec.current; if (!el) return
    const card = el.children[i] as HTMLElement | undefined; if (!card) return
    if (sticky && s) {
      const top = s.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: top + Math.min(extra, card.offsetLeft - 16), behavior: 'smooth' })
    } else el.scrollTo({ left: card.offsetLeft - 16, behavior: 'smooth' })
  }
  const onNativeScroll = () => {
    if (sticky) return
    const el = track.current; if (!el) return
    const cards = Array.from(el.children) as HTMLElement[]
    let best = 0; cards.forEach((c, i) => { if (c.offsetLeft <= el.scrollLeft + 24) best = i }); setIdx(best)
  }

  return (
    <section className="section dark ind" id={SECTION_IDS.industries} ref={sec} style={sticky ? { height: `calc(100vh + ${extra}px)` } : undefined}>
      <div className="ind__sticky">
        <div className="ind__aura aura" aria-hidden="true" data-px="-0.2" />
        <div className="container">
          <div className="ind__head rv">
            <div>
              <h2 className="h2 lang-swap">{t.industries.h2}<br /><span className="muted-head">{t.industries.h2b}</span></h2>
              <p className="lead lang-swap" style={{ marginTop: 14 }}>{t.industries.sub}</p>
            </div>
            <div className="ind__arrows hide-mobile">
              <button aria-label="prev" onClick={() => go(Math.max(0, idx - 1))} disabled={idx === 0}><I.chevronL /></button>
              <button aria-label="next" onClick={() => go(Math.min(n - 1, idx + 1))} disabled={idx >= n - 1}><I.chevronR /></button>
            </div>
          </div>
        </div>
        <div className="ind__track-wrap">
          <div className={`ind__track ${sticky ? 'is-sticky' : ''}`} ref={track} onScroll={onNativeScroll}>
            {t.industries.scenarios.map((s) => (
              <article key={s.id} className="ind__card">
                <div className="ind__visual grain">
                  <div className="ind__phone">
                    <div className="ind__ph"><Mark size={24} color="#fff" /><div><b>{s.agent}</b><span>{s.name}</span></div><span className="pill pill--live">{t.industries.live}</span></div>
                    <div className="ind__msg ind__msg--c">{s.lines[0].text}</div>
                    <div className="ind__work"><div className="ind__wt"><I.bolt width={12} height={12} /> {t.industries.working}</div>{s.steps.map(st => <div key={st} className="ind__step"><I.check width={12} height={12} />{st}</div>)}</div>
                    <div className="ind__msg ind__msg--a">{s.lines[1].text}</div>
                    <div className="ind__out"><I.check width={13} height={13} /> {s.outcome}</div>
                  </div>
                </div>
                <p className="ind__desc lang-swap"><b>{s.industry}.</b> {s.outcome}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="container">
          <div className="ind__progress" aria-hidden="true"><i ref={prog} /></div>
          <div className="ind__dots">{t.industries.scenarios.map((_, i) => <button key={i} className={i === idx ? 'is-active' : ''} onClick={() => go(i)} aria-label={`${i + 1}`} />)}</div>
        </div>
      </div>
    </section>
  )
}
