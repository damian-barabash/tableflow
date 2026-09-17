import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { I } from './Icons'
import { useI18n } from '../i18n'
import { Rich } from './Rich'
import { joinWaitlist, logEvent, type JoinResult } from '../lib/supabase'
import { analyticsAllowed } from '../lib/consent'
import { SECTION_IDS } from './Nav'
import './waitlist.css'

type Status = 'idle' | 'sending' | 'ok' | 'exists' | 'err' | 'invalid'

export function Waitlist() {
  const { t, locale } = useI18n()
  const [email, setEmail] = useState('')
  const [biz, setBiz] = useState('')
  const [company, setCompany] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const seen = useRef(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current; if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && !seen.current) { seen.current = true; if (analyticsAllowed()) logEvent('waitlist_view', locale) } }, { threshold: .3 })
    io.observe(el); return () => io.disconnect()
  }, [locale])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim())
    if (!ok) { setStatus('invalid'); return }
    if (!consent) return
    setStatus('sending')
    const r: JoinResult = await joinWaitlist({ email: email.trim(), locale, businessType: biz || undefined, company: company || undefined, consent })
    setStatus(r === 'created' ? 'ok' : r === 'exists' ? 'exists' : r === 'invalid' ? 'invalid' : 'err')
  }
  const done = status === 'ok' || status === 'exists'

  return (
    <section className="section wl" id={SECTION_IDS.waitlist} ref={ref}>
      <div className="container">
        <div className="wl__card mesh rv" data-px="0.08"><span className="mesh__b" /><span className="mesh__g" />
          <div className="wl__in">
            <div className="wl__text">
              <Rich as="h2" className="h2 lang-swap" html={t.waitlist.h2} path="waitlist.h2" />
              <Rich as="p" className="lead lang-swap" html={t.waitlist.sub} path="waitlist.sub" />
            </div>
            <AnimatePresence mode="wait">
              {done ? (
                <motion.div key="done" className="wl__done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
                  <span className="wl__check"><I.check width={22} height={22} /></span>
                  <p>{status === 'ok' ? t.waitlist.success : t.waitlist.exists}</p>
                </motion.div>
              ) : (
                <motion.form key="form" className="wl__form" onSubmit={submit} noValidate initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }}>
                  <label className="sr-only" htmlFor="wl-email">{t.waitlist.email}</label>
                  <input id="wl-email" className="input" type="email" inputMode="email" autoComplete="email" placeholder={t.waitlist.email} value={email} onChange={e => { setEmail(e.target.value); if (status === 'invalid') setStatus('idle') }} required />
                  <div className="wl__row">
                    <select className="input" value={biz} onChange={e => setBiz(e.target.value)} aria-label={t.waitlist.business}>
                      <option value="">{t.waitlist.business}</option>
                      {t.waitlist.businessOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input className="input" type="text" placeholder={t.waitlist.company} value={company} onChange={e => setCompany(e.target.value)} maxLength={120} />
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />
                    <span>{t.waitlist.consent} <Link to="/polityka-prywatnosci">{t.waitlist.privacy}</Link>.</span>
                  </label>
                  <div className="wl__actions">
                    <button className="btn btn--primary" type="submit" disabled={status === 'sending' || !consent}>{status === 'sending' ? t.waitlist.sending : t.waitlist.submit} <I.arrow className="arrow" width={16} height={16} /></button>
                    <span className="wl__note">{t.waitlist.note}</span>
                  </div>
                  <AnimatePresence>
                    {(status === 'invalid' || status === 'err') && (
                      <motion.p key="e" className="wl__err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{status === 'invalid' ? t.waitlist.invalid : t.waitlist.error}</motion.p>
                    )}
                  </AnimatePresence>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
