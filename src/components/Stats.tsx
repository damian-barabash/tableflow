import { useI18n } from '../i18n'
import { SECTION_IDS } from './Nav'
import './stats.css'

export function Stats() {
  const { t } = useI18n()
  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }
  return (
    <section className="section stats">
      <div className="container">
        <div className="center rv">
          <h2 className="h2 lang-swap">{t.stats.h2}</h2>
          <p className="lead lang-swap" style={{ marginTop: 18 }}>{t.stats.sub}</p>
        </div>
        <div className="stats__grid" data-px="0.1">
          {t.stats.items.map((s, i) => (
            <div key={i} className={`stats__card rv card ${i === 1 ? 'card--dark' : ''}`} data-delay={i + 1}>
              <div className="stats__bar" aria-hidden="true"><i style={{ width: ['100%', '100%', '38%'][i] }} /><i className="stats__bar-ref" style={{ width: ['62%', '45%', '100%'][i] }} /></div>
              <div className="stats__value lang-swap">{s.value}</div>
              <div className="stats__label lang-swap">{s.label}</div>
              <p className="sub lang-swap">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="row stats__cta rv" style={{ justifyContent: 'center' }}>
          <a href={`#${SECTION_IDS.waitlist}`} onClick={go(SECTION_IDS.waitlist)} className="btn btn--primary lang-swap">{t.hero.ctaPrimary}</a>
          <a href={`#${SECTION_IDS.features}`} onClick={go(SECTION_IDS.features)} className="btn btn--ghost lang-swap">{t.hero.ctaSecondary}</a>
        </div>
        <p className="stats__note sub center lang-swap">{t.stats.note}</p>
      </div>
    </section>
  )
}
