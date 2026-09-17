import { Mark } from '../brand/Logo'
import { I } from './Icons'
import { useI18n } from '../i18n'
import { Rich } from './Rich'
import { SECTION_IDS } from './Nav'
import './loyalty.css'

export function Loyalty() {
  const { t } = useI18n()
  const c = t.loyalty.card
  const go = (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(SECTION_IDS.waitlist)?.scrollIntoView({ behavior: 'smooth' }) }
  return (
    <section className="section loy" id={SECTION_IDS.loyalty}>
      <div className="container loy__in">
        <div className="loy__text rv" data-px="0.05">
          <Rich as="h2" className="h2 lang-swap" html={t.loyalty.h2} path="loyalty.h2" />
          <Rich as="p" className="lead lang-swap" style={{ marginTop: 18 }} html={t.loyalty.sub} path="loyalty.sub" />
          <ul className="loy__bullets lang-swap">{t.loyalty.bullets.map(b => <li key={b}><I.check width={16} height={16} />{b}</li>)}</ul>
          <a href={`#${SECTION_IDS.waitlist}`} onClick={go} className="btn btn--ghost lang-swap" style={{ marginTop: 28 }}>{t.loyalty.cta} <I.arrow className="arrow" width={16} height={16} /></a>
        </div>
        <div className="loy__visual rv" data-delay="1">
          <div className="loy__col" data-px="0.14">
          {/* Apple Wallet style pass */}
          <div className="wpass mesh"><span className="mesh__b" /><span className="mesh__g" />
            <div className="wpass__head"><Mark size={28} color="#fff" /><div><b>{c.business}</b><span>{t.platform.mock.cardName}</span></div><span className="wpass__tier">{t.platform.mock.cardTier}</span></div>
            <div className="wpass__fields">
              <div><small>MEMBER</small><b>{c.member}</b></div>
              <div><small>{c.points.toUpperCase()}</small><b>120</b></div>
              <div><small>{c.nextReward.toUpperCase()}</small><b>30</b></div>
            </div>
            <div className="wpass__stamps" aria-label={c.stamps}>{Array.from({ length: 10 }).map((_, i) => <i key={i} className={i < 7 ? 'is-on' : ''} />)}</div>
            <div className="wpass__code"><img className="wpass__qr" src="/qr-karta.svg" alt="QR: tableflow.pl/karta" width={92} height={92} /><span>TF · 8841 2290 07</span></div>
          </div>
          {/* Add-to-wallet buttons */}
          <div className="loy__btns">
            <span className="wbtn"><I.apple width={16} height={16} /> {t.loyalty.walletApple}</span>
            <span className="wbtn"><I.wallet width={16} height={16} /> {t.loyalty.walletGoogle}</span>
          </div>
          </div>
          <div className="loy__col" data-px="0.14">
          {/* Google Wallet style pass */}
          <div className="gpass">
            <div className="gpass__head"><Mark size={20} /><span>{c.business}</span><em>{t.platform.mock.cardTier}</em></div>
            <div className="gpass__row"><div><small>{c.points}</small><b>120</b></div><div><small>{c.stamps}</small><b>7/10</b></div></div>
            <div className="gpass__bar"><i style={{ width: '70%' }} /></div>
          </div>
          {/* Scanner phone */}
          <div className="scanph">
            <div className="scanph__top"><span>{t.loyalty.scan.title}</span></div>
            <div className="scanph__view"><i /><i /><i /><i /><span className="scanph__line" /><img className="scanph__qr" src="/qr-karta.svg" alt="" width={56} height={56} /></div>
            <div className="scanph__hint">{t.loyalty.scan.hint}</div>
            <div className="scanph__res"><b><I.check width={14} height={14} /> {t.loyalty.scan.result}</b><span className="btn btn--brand btn--sm">{t.loyalty.scan.addPoints}</span></div>
          </div>
          </div>
        </div>
      </div>
    </section>
  )
}
