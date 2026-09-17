import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useI18n } from '../i18n'
import { readConsent, writeConsent } from '../lib/consent'
import { logEvent } from '../lib/supabase'
import './cookie.css'

export function CookieBanner({ ready }: { ready: boolean }) {
  const { t, locale } = useI18n()
  const [show, setShow] = useState(false)
  useEffect(() => { if (ready && readConsent() === null) { const id = setTimeout(() => setShow(true), 1200); return () => clearTimeout(id) } }, [ready])
  const decide = (v: 'accepted' | 'rejected') => { writeConsent(v); logEvent(v === 'accepted' ? 'cookie_accept' : 'cookie_reject', locale); setShow(false) }
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="ck" role="dialog" aria-label="Cookies" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: .45, ease: [.22, 1, .36, 1] }}>
          <p className="ck__text">{t.cookies.text} <Link to="/polityka-cookies">{t.cookies.more}</Link></p>
          <div className="ck__actions">
            <button className="btn btn--ghost btn--sm" onClick={() => decide('rejected')}>{t.cookies.reject}</button>
            <button className="btn btn--primary btn--sm" onClick={() => decide('accepted')}>{t.cookies.accept}</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
