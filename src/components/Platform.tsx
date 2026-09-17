import { Mark } from '../brand/Logo'
import { I } from './Icons'
import { useI18n } from '../i18n'
import { Rich } from './Rich'
import { SECTION_IDS } from './Nav'
import './platform.css'

const TONES = ['light', 'dark', 'light', 'light', 'light', 'brand', 'dark'] as const

export function Platform() {
  const { t } = useI18n()
  const m = t.platform.mock
  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }
  const mocks = [
    // 0 number
    <div className="pm pm--kv" key="n">
      <div className="pm__num"><I.phone width={16} height={16} /><b>{m.number}</b><span className="pill pill--live">{m.active}</span></div>
      <div className="pm__row"><span>{m.forwarding}</span><b>{m.active}</b></div>
      <div className="pm__row"><span>{m.voice}</span><b>{m.voiceVal}</b></div>
      <div className="pm__row"><span>{m.hours}</span><b>{m.hoursVal}</b></div>
    </div>,
    // 1 calendar
    <div className="pm pm--cal" key="c">
      <div className="pm__calhead"><b>{m.staffTitle}</b><span className="pill">{t.demo.dashboard.today}</span></div>
      {[m.slot1, m.slot2, m.slot3].map((s, i) => (
        <div key={s} className="pm__slot"><span>{s}</span><i className={i === 1 ? 'g' : ''} style={{ width: ['70%', '45%', '85%'][i] }}>{t.demo.dashboard.bookings[i]}</i></div>
      ))}
    </div>,
    // 2 app push
    <div className="pm pm--push" key="p">
      <div className="pm__phone">
        <div className="pm__notif"><Mark size={24} /><div><b>{m.pushTitle}</b><span>{m.pushBody}</span></div><em>{t.app.push.time}</em></div>
        <div className="pm__notif pm__notif--ghost" />
      </div>
    </div>,
    // 3 revenue
    <div className="pm pm--rev" key="r">
      <div className="pm__kpi"><span>{m.revenue}</span><b>{m.revenueVal}</b><em className="pill pill--live">{m.delta}</em></div>
      <div className="pm__bars">{[38, 52, 46, 70, 64, 88, 100].map((h, i) => <i key={i} style={{ height: `${h}%` }} className={i === 6 ? 'is-hi' : ''} />)}</div>
      <div className="pm__row"><span>{m.occupancy}</span><b>{m.occupancyVal}</b></div>
    </div>,
    // 4 analytics
    <div className="pm pm--an" key="a">
      <b className="pm__title">{m.analyticsTitle}</b>
      {m.topics.map((tp, i) => <div key={tp} className="pm__topic"><span>{tp}</span><i style={{ width: ['92%', '58%', '40%', '22%'][i] }} /><em>{['48%', '27%', '17%', '8%'][i]}</em></div>)}
    </div>,
    // 5 loyalty (brand)
    <div className="pm pm--card" key="l">
      <div className="pm__wallet">
        <div className="pm__wtop"><Mark size={20} color="#fff" /><span>{t.loyalty.card.business}</span></div>
        <div className="pm__wname">{t.loyalty.card.member}</div>
        <div className="pm__wrow"><div><small>{m.cardName}</small><b>{m.cardPts}</b></div><div><small>{t.loyalty.card.tier}</small><b>{m.cardTier}</b></div></div>
      </div>
    </div>,
    // 6 scanner
    <div className="pm pm--scan" key="s">
      <div className="pm__scanbox"><i /><i /><i /><i /><span className="pm__scanline" /><img className="pm__qr" src="/qr-karta.svg" alt="" width={46} height={46} /></div>
      <div className="pm__scanres"><I.check width={14} height={14} /> {m.scanOk}</div>
    </div>,
  ]
  return (
    <section className="section platform" id={SECTION_IDS.features}>
      <div className="container">
        <div className="center rv">
          <Rich as="h2" className="h2 lang-swap" html={t.platform.h2} path="platform.h2" />
          <Rich as="p" className="lead lang-swap" style={{ marginTop: 18 }} html={t.platform.sub} path="platform.sub" />
        </div>
        <div className="platform__grid" data-px="0.1">
          {t.platform.cards.map((c, i) => (
            <article key={i} className={`platform__card card rv card--${TONES[i]} ${TONES[i] === 'brand' ? 'mesh' : ''}`} data-delay={(i % 4) + 1}>
              {TONES[i] === 'brand' && <><span className="mesh__b" /><span className="mesh__g" /></>}
              <h3 className="h3 lang-swap">{c.title}</h3>
              <p className="sub lang-swap">{c.desc}</p>
              <div className="platform__mock">{mocks[i]}</div>
            </article>
          ))}
        </div>
        <div className="center rv" style={{ marginTop: 40 }}>
          <a href={`#${SECTION_IDS.app}`} onClick={go(SECTION_IDS.app)} className="btn btn--ghost lang-swap">{t.platform.cta} <I.arrow className="arrow" width={16} height={16} /></a>
        </div>
      </div>
    </section>
  )
}
