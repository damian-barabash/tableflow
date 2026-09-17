import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Mark } from '../brand/Logo'
import { I } from './Icons'
import { useI18n } from '../i18n'
import { Rich } from './Rich'
import './integrations.css'

type Src = 'booksy' | 'versum' | 'ai'
/** Partner wordmarks (white, in public/brands) sit on their brand colour. */
// `lh` evens out the optical size of the two wordmarks (booksy has a small x-height)
const PARTNERS: { id: Exclude<Src, 'ai'>; name: string; color: string; ratio: number; lh: number }[] = [
  { id: 'booksy', name: 'Booksy', color: '#00a3ad', ratio: 4.14, lh: 21 },
  { id: 'versum', name: 'Versum', color: '#f4654e', ratio: 6.35, lh: 15 },
]
const FEAT_ICONS = [I.calendar, I.check, I.users, I.settings]
const EASE = [.22, 1, .36, 1] as const
const VISIBLE = 4

export function Integrations() {
  const { t, editMode } = useI18n()
  const x = t.integrations
  const n = x.events.length
  // a rolling feed: every tick the next event lands on top of the calendar
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (editMode || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setTick(v => v + 1), 2600)
    return () => clearInterval(id)
  }, [editMode])
  // the editor needs every event on the page to make it editable
  const feed = Array.from({ length: editMode ? n : Math.min(VISIBLE, n) }, (_, k) => {
    const i = ((tick - k) % n + n) % n
    return { key: tick - k, i, ev: x.events[i] }
  })
  const active = feed[0]?.ev.src as Src | undefined

  return (
    <section className="section integ" id="integrations" aria-labelledby="integ-h2">
      <div className="aura integ__aura" data-px="-0.2" />
      <div className="container integ__grid">
        <div className="integ__text rv" data-px="0.05">
          <p className="eyebrow lang-swap"><span className="integ__soon g">{x.soon}</span>{x.eyebrow}</p>
          <Rich as="h2" id="integ-h2" className="h2 lang-swap" html={x.h2} path="integrations.h2" />
          <Rich as="p" className="lead lang-swap" html={x.sub} path="integrations.sub" />
          <ul className="integ__feats">
            {x.features.map((f, i) => {
              const Ico = FEAT_ICONS[i % FEAT_ICONS.length]
              return (
                <li key={i} className="lang-swap">
                  <span className="integ__ico"><Ico width={18} height={18} /></span>
                  <div><b>{f.title}</b><p>{f.desc}</p></div>
                </li>
              )
            })}
          </ul>
          <p className="integ__note lang-swap">{x.note}</p>
        </div>

        <div className="integ__viz rv" data-delay="1" data-px="0.1">
          <div className="integ__panel mesh"><span className="mesh__b" /><span className="mesh__g" />
            <div className="integ__flow">
              <ul className="integ__tiles">
                {PARTNERS.map((p, i) => (
                  <li key={p.id} className={`integ__tile ${active === p.id ? 'is-active' : ''}`} style={{ ['--brand' as string]: p.color }}>
                    <span className="integ__logo" style={{ ['--lh' as string]: `${p.lh}px` }}>
                      <img src={`/brands/${p.id}.svg`} alt={p.name} width={Math.round(p.lh * p.ratio)} height={p.lh} loading="lazy" />
                    </span>
                    <span className="integ__tcap lang-swap">{x.tileCaption}</span>
                    <span className="integ__state"><i style={{ animationDelay: `${i * -0.6}s` }} />{x.synced}</span>
                  </li>
                ))}
              </ul>

              <svg className="integ__wires" viewBox="0 0 100 300" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  {PARTNERS.map(p => (
                    <linearGradient key={p.id} id={`iw-${p.id}`} x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0" stopColor={p.color} /><stop offset="1" stopColor="#fff" />
                    </linearGradient>
                  ))}
                </defs>
                {PARTNERS.map((p, i) => {
                  const y = (300 / PARTNERS.length) * (i + .5)
                  const d = `M0 ${y} C 55 ${y}, 45 150, 100 150`
                  return (
                    <g key={p.id} className={active === p.id ? 'is-active' : ''}>
                      <path d={d} className="integ__wire" />
                      <path d={d} pathLength={200} className="integ__pulse" stroke={`url(#iw-${p.id})`} style={{ animationDelay: `${i * -0.9}s` }} />
                      <path d={d} pathLength={200} className="integ__pulse integ__pulse--back" style={{ animationDelay: `${i * -1.4 - 1}s` }} />
                    </g>
                  )
                })}
              </svg>

              <span className="integ__vline g" aria-hidden="true" />
              <div className="integ__hub">
                <div className="integ__hubhead">
                  <span className="integ__hubmark g"><Mark size={20} color="#fff" /></span>
                  <div><b>{x.hubTitle}</b><span className="lang-swap">{x.hubToday}</span></div>
                  <span className="integ__sync" aria-hidden="true"><I.check width={13} height={13} /></span>
                </div>
                <ul className="integ__feed" aria-live="off">
                  <AnimatePresence initial={false} mode="popLayout">
                    {feed.map(({ key, ev }, k) => {
                      const partner = PARTNERS.find(p => p.id === ev.src)
                      return (
                        <motion.li key={key} layout className={`integ__ev ${k === 0 ? 'is-new' : ''}`}
                          initial={{ opacity: 0, y: -18, scale: .96, filter: 'blur(6px)' }}
                          animate={{ opacity: editMode ? 1 : 1 - k * 0.16, y: 0, scale: 1, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, scale: .96, filter: 'blur(4px)' }}
                          transition={{ duration: .6, ease: EASE }}>
                          <span className={`integ__evbar ${ev.src === 'ai' ? 'g' : ''}`} style={partner ? { background: partner.color } : undefined} />
                          <time>{ev.time}</time>
                          <div className="integ__evbody"><b>{ev.title}</b><span>{partner ? partner.name : x.aiSource}</span></div>
                          {k === 0 && <em className="integ__new">{x.newLabel}</em>}
                        </motion.li>
                      )
                    })}
                  </AnimatePresence>
                </ul>
                <div className="integ__hubfoot"><I.bolt width={13} height={13} /><span className="lang-swap">{x.footer}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
