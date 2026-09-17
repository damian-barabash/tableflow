import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Mark } from '../brand/Logo'
import { I } from '../components/Icons'
import { useI18n } from '../i18n'
import './mocks.css'

const EASE = [0.22, 1, 0.36, 1] as const
const TAB_IDS = ['barber', 'cafe', 'beauty']

/** Left hero card: AI reception conversation with working steps (Quickchat widget analogue). */
export function CallCard({ dark = false }: { dark?: boolean }) {
  const { t, locale } = useI18n()
  const [tab, setTab] = useState(0)
  const [step, setStep] = useState(0) // how many working steps are shown
  const sc = t.industries.scenarios.find(s => s.id === TAB_IDS[tab]) ?? t.industries.scenarios[0]

  useEffect(() => {
    setStep(0)
    const ids = [1, 2, 3].map(n => window.setTimeout(() => setStep(n), 700 + n * 650))
    return () => ids.forEach(clearTimeout)
  }, [tab, locale])

  return (
    <div className={`cc ${dark ? 'cc--dark' : ''}`}>
      <div className="cc__tabs" role="tablist">
        {t.demo.tabs.map((label, i) => (
          <button key={i} role="tab" aria-selected={i === tab} className={`cc__tab ${i === tab ? 'is-active' : ''}`} onClick={() => setTab(i)}>
            {i === tab && <motion.span layoutId="cc-tab" className="cc__tabbg" transition={{ duration: .35, ease: EASE }} />}
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="cc__card">
        <div className="cc__head">
          <Mark size={30} />
          <div><div className="cc__name">{sc.agent} · {sc.name}</div><div className="cc__sub">{t.demo.typing}</div></div>
          <span className="pill pill--live cc__live">{t.industries.live}</span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${tab}-${locale}`} className="cc__body" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .35, ease: EASE }}>
            <motion.div className="cc__msg cc__msg--client" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05, duration: .4, ease: EASE }}>{sc.lines[0].text}</motion.div>
            <div className="cc__work">
              <div className="cc__worktitle"><I.bolt width={14} height={14} /> {t.industries.working}</div>
              {sc.steps.map((s, i) => (
                <motion.div key={i} className={`cc__step ${step > i ? 'is-done' : ''}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: step >= i ? 1 : .35, x: 0 }} transition={{ duration: .4, ease: EASE }}>
                  <span className="cc__tick">{step > i ? <I.check width={12} height={12} /> : <span className="cc__spin" />}</span>{s}
                </motion.div>
              ))}
            </div>
            <motion.div className="cc__msg cc__msg--ai" initial={{ opacity: 0, y: 8 }} animate={{ opacity: step >= 3 ? 1 : 0, y: step >= 3 ? 0 : 8 }} transition={{ duration: .45, ease: EASE }}>{sc.lines[1].text}</motion.div>
          </motion.div>
        </AnimatePresence>
        <div className="cc__input"><span>{t.demo.inputPlaceholder}</span><span className="cc__send"><I.arrowUp width={16} height={16} /></span></div>
      </div>
    </div>
  )
}
