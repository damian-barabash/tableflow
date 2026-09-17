import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Logo, Mark } from '../brand/Logo'
import { I } from '../components/Icons'
import { Rich } from '../components/Rich'
import { useI18n } from '../i18n'
import { joinWaitlistContact, logEvent, type ContactResult } from '../lib/supabase'
import { analyticsAllowed } from '../lib/consent'
import './karta.css'

const EASE = [0.22, 1, 0.36, 1] as const
const TOTAL = 10
type Status = 'idle' | 'sending' | 'ok' | 'exists' | 'err_email' | 'err_phone' | 'err'

/**
 * /karta — landing page behind the QR printed on the loyalty-card mockups.
 * Only the top nav + a centred stamp card: the last stamp gets stamped (the "scan"), then the
 * newsletter sign-up appears with an e-mail / phone toggle.
 */
export function Karta() {
  const { t, locale } = useI18n()
  const [stamped, setStamped] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [value, setValue] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const once = useRef(false)

  useEffect(() => {
    document.title = `${t.card.title} — TableFlow AI`
    window.scrollTo(0, 0)
    if (!once.current) {
      once.current = true
      if (analyticsAllowed()) logEvent('card_scan', locale, { src: new URLSearchParams(window.location.hash.split('?')[1] || '').get('src') || 'direct' })
    }
    // timers are idempotent (setState to true), so a StrictMode double-run is harmless
    const a = setTimeout(() => setStamped(true), 1100)
    const b = setTimeout(() => setShowForm(true), 2400)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [t.card.title, locale])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (mode === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v)) { setStatus('err_email'); return }
    if (mode === 'phone' && v.replace(/[^0-9]/g, '').length < 7) { setStatus('err_phone'); return }
    if (!consent) return
    setStatus('sending')
    const r: ContactResult = await joinWaitlistContact({ email: mode === 'email' ? v : undefined, phone: mode === 'phone' ? v : undefined, locale, consent, source: 'card' })
    if (r === 'created' && analyticsAllowed()) logEvent('card_signup', locale, { mode })
    setStatus(r === 'created' ? 'ok' : r === 'exists' ? 'exists' : r === 'invalid_email' ? 'err_email' : r === 'invalid_phone' ? 'err_phone' : 'err')
  }
  const done = status === 'ok' || status === 'exists'
  const filled = stamped ? TOTAL : TOTAL - 1

  return (
    <main className="karta">
      <div className="karta__aura aura" aria-hidden="true" />
      <motion.div className="kcard mesh" initial={{ opacity: 0, y: 24, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .8, ease: EASE }}>
        <span className="mesh__b" /><span className="mesh__g" />
        <div className="kcard__head">
          <Logo size={26} light />
          <span className="kcard__tag">{t.card.title}</span>
        </div>
        <div className="kcard__biz">{t.card.business}</div>

        <div className="kcard__stamps" aria-label={`${filled}/${TOTAL}`}>
          {Array.from({ length: TOTAL }).map((_, i) => {
            const on = i < filled
            const last = i === TOTAL - 1
            return (
              <motion.span key={i} className={`kstamp ${on ? 'is-on' : ''}`}
                initial={last ? { scale: 1 } : { opacity: 0, scale: .6 }}
                animate={last ? (stamped ? { scale: [2.2, .9, 1.06, 1], rotate: [-18, 4, 0, 0], opacity: 1 } : { scale: 1, opacity: 1 }) : { opacity: 1, scale: 1 }}
                transition={last ? { duration: .75, ease: EASE, times: [0, .55, .8, 1] } : { duration: .45, delay: .15 + i * .07, ease: EASE }}>
                {on && <Mark size={18} color={last && stamped ? '#2a3480' : '#2a3480'} />}
              </motion.span>
            )
          })}
        </div>
        <div className="kcard__meta">
          <span>{t.card.stamps}</span>
          <b><motion.span key={filled} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{filled}</motion.span>/{TOTAL}</b>
        </div>
        <AnimatePresence mode="wait">
          {!stamped ? (
            <motion.p key="left" className="kcard__note" exit={{ opacity: 0, y: -6 }}>{t.card.stampsLeft}</motion.p>
          ) : (
            <motion.p key="ok" className="kcard__note kcard__note--ok" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .5 }}><I.check width={14} height={14} /> {t.card.scanned} <span className="kcard__reward">{t.card.reward}</span></motion.p>
          )}
        </AnimatePresence>

        <div className="kcard__qr">
          <img src="./qr-karta.svg" alt="QR" width={88} height={88} />
          <span>{t.card.powered}</span>
        </div>
      </motion.div>

      <AnimatePresence>
        {showForm && (
          <motion.section className="knews card" initial={{ opacity: 0, y: 20, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} transition={{ duration: .7, ease: EASE }}>
            <motion.div className="knews__won" initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: .6, ease: EASE, delay: .1 }}>
              <span className="knews__confetti" aria-hidden="true">{Array.from({ length: 12 }).map((_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</span>
              <Rich as="h1" className="knews__h" html={t.card.won} path="card.won" />
            </motion.div>
            <Rich as="p" className="knews__sub2" html={t.card.newsletterTitle} path="card.newsletterTitle" />
            <Rich as="p" className="sub" html={t.card.newsletterSub} path="card.newsletterSub" />
            {done ? (
              <motion.div className="knews__done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <span className="wl__check"><I.check width={20} height={20} /></span>
                <p>{status === 'ok' ? t.card.success : t.card.exists}</p>
              </motion.div>
            ) : (
              <form className="knews__form" onSubmit={submit} noValidate>
                <div className="kseg" role="tablist">
                  {(['email', 'phone'] as const).map(m => (
                    <button key={m} type="button" role="tab" aria-selected={mode === m} className={`kseg__btn ${mode === m ? 'is-active' : ''}`} onClick={() => { setMode(m); setStatus('idle') }}>
                      {mode === m && <motion.span layoutId="kseg" className="kseg__bg" transition={{ duration: .35, ease: EASE }} />}
                      <span>{m === 'email' ? <I.mail width={15} height={15} /> : <I.phone width={15} height={15} />}{m === 'email' ? t.card.email : t.card.phone}</span>
                    </button>
                  ))}
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.input key={mode} className="input" type={mode === 'email' ? 'email' : 'tel'} inputMode={mode === 'email' ? 'email' : 'tel'} autoComplete={mode === 'email' ? 'email' : 'tel'}
                    placeholder={mode === 'email' ? t.card.emailPh : t.card.phonePh} value={value} onChange={e => { setValue(e.target.value); if (status !== 'idle') setStatus('idle') }}
                    initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: .25 }} />
                </AnimatePresence>
                <label className="check">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />
                  <span>{t.card.consent} <Link to="/polityka-prywatnosci">{t.waitlist.privacy}</Link>.</span>
                </label>
                <button className="btn btn--primary" type="submit" disabled={status === 'sending' || !consent}>{status === 'sending' ? t.waitlist.sending : t.card.submit} <I.arrow className="arrow" width={16} height={16} /></button>
                <AnimatePresence>
                  {(status === 'err_email' || status === 'err_phone' || status === 'err') && (
                    <motion.p key="e" className="wl__err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{status === 'err_email' ? t.card.invalidEmail : status === 'err_phone' ? t.card.invalidPhone : t.card.error}</motion.p>
                  )}
                </AnimatePresence>
              </form>
            )}
          </motion.section>
        )}
      </AnimatePresence>
      <Link to="/" className="link karta__back" style={{ fontSize: 14 }}><I.chevronL width={14} height={14} /> {t.card.back}</Link>
    </main>
  )
}
