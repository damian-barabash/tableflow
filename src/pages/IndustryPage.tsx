import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { I } from '../components/Icons'
import { Rich } from '../components/Rich'
import { Waitlist } from '../components/Waitlist'
import { useI18n } from '../i18n'
import { useReveal } from '../lib/useReveal'
import { INDUSTRIES } from '../seo/industries'
import { industryContent } from '../seo/industry-content'
import { LOCALE_HOME } from '../seo/routes'
import './industry-page.css'

/** Landing page for one industry (PL content, linked from the home carousel and the footer). */
export default function IndustryPage({ slug, ready }: { slug: string; ready: boolean }) {
  const data = industryContent(slug)!
  const { t, locale } = useI18n()
  const [open, setOpen] = useState<number | null>(0)
  useEffect(() => { window.scrollTo(0, 0); setOpen(0) }, [data.slug])
  useReveal(`${ready}-${data.slug}-${locale}`)
  const others = INDUSTRIES.filter(i => i.slug !== data.slug)
  const home = LOCALE_HOME[locale]
  return (
    <main className="ip" lang="pl">
      <section className="section ip-hero">
        <div className="container">
          <nav className="ip-crumbs" aria-label="Breadcrumb">
            <Link to={home}>TableFlow AI</Link><I.chevronR width={12} height={12} aria-hidden="true" /><span aria-current="page">{data.name}</span>
          </nav>
          {locale !== 'pl' && <p className="ip-lang"><I.globe width={14} height={14} aria-hidden="true" /> {t.common.plOnly}</p>}
          <Rich as="h1" className="h1 ip-h1 rv" html={data.h1} path={`industry.${data.slug}.h1`} />
          <p className="lead ip-lead rv" data-delay="1">{data.lead}</p>
          <div className="ip-cta rv" data-delay="2">
            <a className="btn btn--primary" href="#waitlist" onClick={e => { e.preventDefault(); document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' }) }}>{t.nav.cta} <I.arrow className="arrow" width={16} height={16} /></a>
            <a className="btn btn--ghost" href="#jak-to-dziala" onClick={e => { e.preventDefault(); document.getElementById('jak-to-dziala')?.scrollIntoView({ behavior: 'smooth' }) }}>Jak to działa</a>
          </div>
          <p className="sub ip-note rv" data-delay="2">{t.hero.note}</p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container ip-split">
          <div className="ip-intro rv">
            {data.intro.map(p => <p key={p}>{p}</p>)}
          </div>
          <figure className="ip-call card rv" data-delay="1" aria-label="Przykładowa rozmowa">
            <figcaption className="ip-call__head"><span className="tf-orb is-active" aria-hidden="true" /> Przykładowa rozmowa</figcaption>
            <ol className="ip-call__lines">
              {data.call.map((l, i) => (
                <li key={i} className={`ip-call__line is-${l.who}`}>
                  <span className="ip-call__who">{l.who === 'ai' ? 'Recepcja AI' : 'Klient'}</span>
                  <p>{l.text}</p>
                </li>
              ))}
            </ol>
            <p className="ip-call__result"><I.check width={14} height={14} aria-hidden="true" /> {data.callResult}</p>
          </figure>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <h2 className="h2 rv">Co dziś kosztuje Cię nieodebrany telefon</h2>
          <div className="ip-grid ip-grid--3">
            {data.pains.map((p, i) => (
              <article key={p.t} className="card card--soft ip-card rv" data-delay={String(i)}>
                <h3>{p.t}</h3><p>{p.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight" id="jak-to-dziala">
        <div className="container">
          <h2 className="h2 rv">Jak to działa</h2>
          <ol className="ip-steps">
            {data.steps.map((s, i) => (
              <li key={s.t} className="ip-step rv" data-delay={String(i)}>
                <span className="ip-step__n" aria-hidden="true">{i + 1}</span>
                <h3>{s.t}</h3><p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <h2 className="h2 rv">Co dostajesz</h2>
          <div className="ip-grid ip-grid--3">
            {data.features.map((f, i) => (
              <article key={f.t} className="card ip-card rv" data-delay={String(i % 3)}>
                <I.check className="ip-card__ic" width={18} height={18} aria-hidden="true" />
                <h3>{f.t}</h3><p>{f.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight faq">
        <div className="container">
          <h2 className="h2 rv">Najczęstsze pytania</h2>
          <div className="faq__list rv">
            {data.faq.map((it, i) => (
              <div key={it.q} className={`faq__item ${open === i ? 'is-open' : ''}`}>
                <h3 className="ip-faq-h">
                  <button className="faq__q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} aria-controls={`ip-a-${i}`}>
                    <span>{it.q}</span><I.chevron className="faq__chev" width={18} height={18} />
                  </button>
                </h3>
                <motion.div id={`ip-a-${i}`} className="faq__a" role="region" aria-hidden={open !== i} initial={false} animate={open === i ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }} transition={{ duration: .35, ease: [.22, 1, .36, 1] }}>
                  <p>{it.a}</p>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <h2 className="h2 rv">Inne branże</h2>
          <ul className="ip-others">
            {others.map(o => <li key={o.slug}><Link to={`/${o.slug}`}>{o.name} <I.chevronR width={14} height={14} aria-hidden="true" /></Link></li>)}
          </ul>
        </div>
      </section>

      <Waitlist />
    </main>
  )
}
