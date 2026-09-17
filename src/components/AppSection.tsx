import { Mark } from '../brand/Logo'
import { I } from './Icons'
import { useI18n } from '../i18n'
import { SECTION_IDS } from './Nav'
import './app-section.css'

const FEAT_ICONS = [I.bell, I.calendar, I.scan, I.chart]

export function AppSection() {
  const { t } = useI18n()
  return (
    <section className="section appx" id={SECTION_IDS.app}>
      <div className="container appx__in">
        <div className="appx__visual rv">
          <div className="appx__aura aura" aria-hidden="true" data-px="-0.2" />
          <div className="phone" data-px="0.16">
            <div className="phone__notch" />
            <div className="phone__push"><Mark size={28} /><div><b>{t.app.push.app} · {t.app.push.title}</b><span>{t.app.push.body}</span></div><em>{t.app.push.time}</em></div>
            <div className="phone__screen">
              <div className="phone__head"><div><small>{t.app.screen.today}</small><b>{t.demo.dashboard.title}</b></div><span className="phone__avatar">MK</span></div>
              <div className="phone__stats">{t.demo.dashboard.stats.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div>
              <div className="phone__label">{t.app.screen.next}</div>
              {t.app.screen.items.map((it, i) => <div key={it} className={`phone__item ${i === 3 ? 'is-new' : ''}`}><i /><span>{it}</span>{i === 3 && <I.sparkle width={12} height={12} />}</div>)}
              <div className="phone__tabs">{[I.home, I.calendar, I.scan, I.chart].map((Ic, i) => <span key={i} className={i === 1 ? 'is-active' : ''}><Ic width={18} height={18} /></span>)}</div>
            </div>
          </div>
        </div>
        <div className="appx__text rv" data-delay="1" data-px="0.05">
          <h2 className="h2 lang-swap">{t.app.h2}</h2>
          <p className="lead lang-swap" style={{ marginTop: 18 }}>{t.app.sub}</p>
          <ul className="appx__feats lang-swap">
            {t.app.features.map((f, i) => { const Ic = FEAT_ICONS[i]; return <li key={f.title}><span className="appx__ic"><Ic width={17} height={17} /></span><div><b>{f.title}</b><p className="sub">{f.desc}</p></div></li> })}
          </ul>
          <div className="appx__stores lang-swap">
            <span className="wbtn"><I.apple width={16} height={16} /> App Store</span>
            <span className="wbtn"><I.android width={16} height={16} /> Google Play</span>
            <span className="sub">{t.app.stores}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
