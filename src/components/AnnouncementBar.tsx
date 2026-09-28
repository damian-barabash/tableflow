import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useI18n } from '../i18n'
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabase'
import { I } from './Icons'

interface Ann { enabled: boolean; text: Record<string, string>; link: string; style: 'brand' | 'dark' }
const KEY = 'tf_ann_closed'

/** Site-wide announcement set in /admin → Strona (translated on save). */
export function AnnouncementBar() {
  const { locale } = useI18n()
  const [a, setA] = useState<Ann | null>(null)
  const [closed, setClosed] = useState(() => { try { return sessionStorage.getItem(KEY) } catch { return null } })
  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/site_settings?key=eq.announcement&select=value`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
      .then(r => r.ok ? r.json() : []).then((rows: { value: Ann }[]) => setA(rows[0]?.value ?? null)).catch(() => {})
  }, [])
  const text = a?.enabled ? (a.text[locale] || a.text.pl || '') : ''
  const show = !!text && closed !== text
  const close = () => { try { sessionStorage.setItem(KEY, text) } catch { /* */ } setClosed(text) }
  const inner = <><span>{text}</span>{a?.link && <I.arrow width={14} height={14} />}</>
  return (
    <AnimatePresence>
      {show && (
        <motion.div className={`annc ${a!.style === 'brand' ? 'g' : ''}`} data-no-snapshot initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .4 }}>
          <div className="annc__in">
            {a!.link ? <a href={a!.link}>{inner}</a> : <p>{inner}</p>}
            <button onClick={close} aria-label="Zamknij"><I.close width={14} height={14} /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
