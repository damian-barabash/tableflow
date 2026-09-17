import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Logo } from '../brand/Logo'
import { LOCALES, LOCALE_NAMES, useI18n } from '../i18n'
import { SECTION_IDS } from './Nav'
import './footer.css'

const WORD = 'TableFlow'

/** Fits the giant wordmark to the container width and reveals it letter by letter on scroll. */
function useBigMark() {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current; if (!el) return
    const word = el.querySelector<HTMLElement>('.foot__word'); if (!word) return
    const fit = () => {
      word.style.fontSize = '100px'
      const w = word.getBoundingClientRect().width || 1
      word.style.fontSize = `${Math.floor(100 * (el.clientWidth / w) * 0.995)}px`
    }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(el)
    if (document.fonts?.ready) document.fonts.ready.then(fit)
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { el.classList.add('in'); io.disconnect() } }, { threshold: .25 })
    io.observe(el)
    return () => { ro.disconnect(); io.disconnect() }
  }, [])
  return box
}

export function Footer() {
  const { t, locale, setLocale } = useI18n()
  const box = useBigMark()
  const loc = useLocation(); const home = loc.pathname === '/'
  const href = (id: string) => home ? `#${id}` : `/#${id}`
  const year = new Date().getFullYear()
  const L = t.footer.links
  return (
    <footer className="foot">
      <div className="container">
        <div className="foot__top">
          <div className="foot__brand">
            <Logo size={30} light />
            <p className="foot__tag lang-swap">{t.footer.tagline}</p>
            <div className="foot__kv"><span>{t.footer.contact}:</span><a href="mailto:hello@tableflow.pl">hello@tableflow.pl</a></div>
            <span className="foot__status"><i /> {t.footer.status}</span>
          </div>
          <div className="foot__cols">
            <div>
              <h4>{t.footer.product}</h4>
              <a href={href(SECTION_IDS.features)}>{L.features}</a>
              <a href={href(SECTION_IDS.industries)}>{L.industries}</a>
              <a href={href(SECTION_IDS.app)}>{L.app}</a>
              <a href={href(SECTION_IDS.loyalty)}>{L.loyalty}</a>
              <a href={href(SECTION_IDS.faq)}>{L.faq}</a>
              <a href={href(SECTION_IDS.waitlist)}>{L.waitlist}</a>
            </div>
            <div>
              <h4>{t.footer.legal}</h4>
              <Link to="/polityka-prywatnosci">{t.footer.privacy}</Link>
              <Link to="/polityka-cookies">{t.footer.cookies}</Link>
              <Link to="/regulamin">{t.footer.terms}</Link>
            </div>
            <div>
              <h4>{t.footer.language}</h4>
              {LOCALES.map(l => <button key={l} className={l === locale ? 'is-active' : ''} onClick={() => void setLocale(l)}>{LOCALE_NAMES[l]}</button>)}
            </div>
          </div>
        </div>
        <div className="foot__mark" aria-hidden="true" ref={box}><span className="foot__word">{WORD.split('').map((ch, i) => <span key={i} className="foot__ch" style={{ ['--i' as string]: i }}>{ch}</span>)}</span></div>
        <div className="foot__bottom">
          <span>© {year} TableFlow AI. {t.footer.rights}</span>
          <span>{t.footer.madeIn}</span>
        </div>
        <div className="foot__company">{t.footer.company}</div>
      </div>
    </footer>
  )
}
