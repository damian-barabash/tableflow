import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Logo } from '../brand/Logo'
import { I } from './Icons'
import { LOCALES, LOCALE_NAMES, useI18n } from '../i18n'
import './nav.css'

export const SECTION_IDS = { features: 'features', industries: 'industries', app: 'app', loyalty: 'loyalty', faq: 'faq', waitlist: 'waitlist' } as const

export function Nav() {
  const { t, locale, setLocale } = useI18n()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const loc = useLocation()
  const home = loc.pathname === '/'

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => { setOpen(false); setLangOpen(false) }, [loc])
  useEffect(() => {
    if (!langOpen) return
    const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.nav__lang')) setLangOpen(false) }
    document.addEventListener('click', off); return () => document.removeEventListener('click', off)
  }, [langOpen])

  const href = (id: string) => home ? `#${id}` : `/#${id}`
  const go = (id: string) => (e: React.MouseEvent) => {
    if (!home) return
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setOpen(false)
  }
  const links: [string, string][] = [
    [t.nav.features, SECTION_IDS.features], [t.nav.industries, SECTION_IDS.industries], [t.nav.app, SECTION_IDS.app], [t.nav.loyalty, SECTION_IDS.loyalty], [t.nav.faq, SECTION_IDS.faq],
  ]

  return (
    <header className={`nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container nav__in">
        <Link to="/" className="nav__logo" aria-label="TableFlow AI"><Logo size={28} /></Link>
        <nav className="nav__links hide-mobile" aria-label="Main">
          {links.map(([label, id]) => <a key={id} href={href(id)} onClick={go(id)} className="nav__link lang-swap">{label}</a>)}
        </nav>
        <div className="nav__right">
          <div className="nav__lang hide-mobile">
            <button className="nav__langbtn" onClick={() => setLangOpen(v => !v)} aria-haspopup="listbox" aria-expanded={langOpen} aria-label={t.nav.lang}>
              <I.globe width={17} height={17} /> <span className="nav__langcode">{locale.toUpperCase()}</span> <I.chevron width={14} height={14} />
            </button>
            <AnimatePresence>
              {langOpen && (
                <motion.ul className="nav__langmenu" role="listbox" initial={{ opacity: 0, y: 6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: .98 }} transition={{ duration: .2 }}>
                  {LOCALES.map(l => (
                    <li key={l}><button role="option" aria-selected={l === locale} className={l === locale ? 'is-active' : ''} onClick={() => { setLangOpen(false); void setLocale(l) }}>{LOCALE_NAMES[l]}{l === locale && <I.check width={14} height={14} />}</button></li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
          <a href={href(SECTION_IDS.waitlist)} onClick={go(SECTION_IDS.waitlist)} className="btn btn--primary btn--sm hide-mobile lang-swap">{t.nav.cta}</a>
          <button className="nav__burger only-mobile" onClick={() => setOpen(v => !v)} aria-label={t.nav.menu} aria-expanded={open}>{open ? <I.close /> : <I.menu />}</button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="nav__mobile" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .25 }}>
            {links.map(([label, id]) => <a key={id} href={href(id)} onClick={go(id)} className="nav__mlink">{label}</a>)}
            <a href={href(SECTION_IDS.waitlist)} onClick={go(SECTION_IDS.waitlist)} className="btn btn--primary" style={{ marginTop: 8 }}>{t.nav.cta}</a>
            <div className="nav__mlangs">
              {LOCALES.map(l => <button key={l} className={`pill ${l === locale ? 'pill--brand' : ''}`} onClick={() => { setOpen(false); void setLocale(l) }}>{LOCALE_NAMES[l]}</button>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
