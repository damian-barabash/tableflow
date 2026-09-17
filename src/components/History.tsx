import { I } from './Icons'
import { useI18n } from '../i18n'
import { Rich } from './Rich'
import { SECTION_IDS } from './Nav'
import './history.css'

export function History() {
  const { t } = useI18n()
  const d = t.history.demo
  const go = (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(SECTION_IDS.waitlist)?.scrollIntoView({ behavior: 'smooth' }) }
  return (
    <section className="section hist dots">
      <div className="container hist__in">
        <div className="hist__text rv" data-px="0.05">
          <Rich as="h2" className="h2 lang-swap" html={t.history.h2} path="history.h2" />
          <Rich as="p" className="lead lang-swap" style={{ marginTop: 18 }} html={t.history.sub} path="history.sub" />
          <ul className="hist__bullets lang-swap">{t.history.bullets.map(b => <li key={b}><span><I.check width={13} height={13} /></span>{b}</li>)}</ul>
          <a href={`#${SECTION_IDS.waitlist}`} onClick={go} className="btn btn--ghost lang-swap" style={{ marginTop: 28 }}>{t.hero.ctaPrimary} <I.arrow className="arrow" width={16} height={16} /></a>
        </div>
        <div className="hist__demo rv" data-delay="1"><div data-px="0.16" className="hist__demo-in">
          <div className="hist__msg hist__msg--c lang-swap">{d.client}</div>
          <div className="hist__msg hist__msg--a lang-swap">{d.ai}</div>
          <div className="hist__why card">
            <div className="hist__whyhead"><span className="pill pill--brand"><I.sparkle width={13} height={13} /> {d.why}</span></div>
            <div className="hist__block"><div className="hist__ic"><I.search width={13} height={13} /></div><div><small>{d.reasoning}</small><p>{d.reasoningText}</p></div></div>
            <div className="hist__block"><div className="hist__ic"><I.doc width={13} height={13} /></div><div><small>{d.sources}</small>{d.sourceItems.map(s => <div key={s} className="hist__src"><I.doc width={13} height={13} /><span>{s}</span><I.check width={13} height={13} className="ok" /></div>)}</div></div>
            <div className="hist__block"><div className="hist__ic"><I.bolt width={13} height={13} /></div><div><small>{d.action}</small><div className="hist__src"><I.bolt width={13} height={13} /><span>{d.actionText}</span><I.check width={13} height={13} className="ok" /></div></div></div>
            <div className="hist__foot"><i /> {d.audited}</div>
          </div>
          </div>
        </div>
      </div>
    </section>
  )
}
