import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Orb } from '../brand/Logo'
import { I } from './Icons'
import { detectLanguage, readStoredLocale, useI18n, LOCALE_NAMES, type Detection } from '../i18n'
import { analyticsAllowed } from '../lib/consent'
import { logEvent } from '../lib/supabase'
import './lang-assistant.css'

type Stage = 'hidden' | 'square' | 'thinking' | 'detected' | 'switched' | 'ask'
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Centred "AI square": appears as a square with the thinking orb, then smoothly widens into a
 * rectangle (kept centred by the flex wrapper + layout animation) as the text arrives.
 */
export function LangAssistant({ ready }: { ready: boolean }) {
  const { t, setLocale, locale } = useI18n()
  const [stage, setStage] = useState<Stage>('hidden')
  const [det, setDet] = useState<Detection | null>(null)
  const timers = useRef<number[]>([])
  const started = useRef(false)
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }

  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    if (readStoredLocale()) return                       // user already chose → silent
    const d = detectLanguage()
    if (d.code === 'pl') return                          // system is Polish → nothing happens
    later(() => {
      setDet(d); setStage('square')
      if (analyticsAllowed()) logEvent('lang_detected', d.code, { supported: !!d.supported })
      later(() => setStage('thinking'), 900)
      later(() => {
        setStage('detected')
        later(async () => {
          if (d.supported) {
            await setLocale(d.supported, { animate: true, persist: true })
            setStage('switched')
            if (analyticsAllowed()) logEvent('lang_switched', d.supported)
            later(() => setStage('hidden'), 6000)
          } else {
            setStage('ask')
          }
        }, 1100)
      }, 900 + 1600)
    }, 3000)
    return () => { timers.current.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const useEn = async () => { await setLocale('en', { animate: true, persist: true }); setStage('switched'); if (analyticsAllowed()) logEvent('lang_switched', 'en', { from: det?.code }); later(() => setStage('hidden'), 5000) }
  const keepPl = async () => { await setLocale('pl', { animate: false, persist: true }); if (analyticsAllowed()) logEvent('lang_kept', 'pl', { from: det?.code }); setStage('hidden') }
  const undo = async () => { await setLocale('pl', { animate: true, persist: true }); if (analyticsAllowed()) logEvent('lang_kept', 'pl', { undo: true }); setStage('hidden') }

  const langLabel = det ? (det.supported ? LOCALE_NAMES[det.supported] : det.nativeName) : ''
  const square = stage === 'square'

  return (
    <div className="la-wrap" aria-live="polite">
      <AnimatePresence>
        {stage !== 'hidden' && (
          <motion.div key="la" className={`la ${square ? 'la--square' : ''} ${stage === 'ask' ? 'la--wide' : ''}`} role="status"
            layout
            initial={{ opacity: 0, scale: .6, filter: 'blur(12px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: .92, filter: 'blur(8px)' }}
            transition={{ duration: .7, ease: EASE, layout: { duration: .75, ease: EASE } }}>
            <div className="la__glow" aria-hidden="true" />
            <motion.div layout="position" className="la__row">
              <Orb size={square ? 36 : 30} active={stage === 'square' || stage === 'thinking'} />
              <AnimatePresence mode="wait" initial={false}>
                {stage === 'thinking' && (
                  <motion.span key="th" className="la__text la__shimmer" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .35 }}>{t.assist.thinking}</motion.span>
                )}
                {stage === 'detected' && (
                  <motion.span key="de" className="la__text" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .3 }}>
                    {t.assist.detected}: <b>{langLabel}</b> <span className="la__code">{det?.code}</span>
                  </motion.span>
                )}
                {stage === 'switched' && (
                  <motion.span key="sw" className="la__text la__ok" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .3 }}>
                    <I.check width={16} height={16} /> {t.assist.switched}
                    {locale !== 'pl' && <button className="la__undo" onClick={undo}>{t.assist.undo}</button>}
                  </motion.span>
                )}
                {stage === 'ask' && (
                  <motion.span key="ask" className="la__text" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .3 }}>
                    {t.assist.question.replace('{lang}', det?.name || '')}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
            <AnimatePresence>
              {stage === 'ask' && (
                <motion.div key="btns" className="la__actions" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .5, ease: EASE }}>
                  <button className="btn btn--brand btn--sm" onClick={useEn}>{t.assist.useEn}</button>
                  <button className="btn btn--ghost btn--sm" onClick={keepPl}>{t.assist.keepPl}</button>
                  <span className="la__hint">{t.assist.hint}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
