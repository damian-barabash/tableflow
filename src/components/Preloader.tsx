import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Mark } from '../brand/Logo'
import './preloader.css'

const LETTERS = 'TableFlow'.split('')
const EASE = [0.22, 1, 0.36, 1] as const

export function Preloader({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<0 | 1 | 2>(0)
  useEffect(() => {
    document.body.classList.add('locked')
    const t1 = setTimeout(() => setPhase(1), 1250)
    const t2 = setTimeout(() => setPhase(2), 2700)
    const t3 = setTimeout(() => { document.body.classList.remove('locked'); onDone() }, 3400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); document.body.classList.remove('locked') }
  }, [onDone])

  return (
    <motion.div className="pre" aria-hidden="true"
      initial={{ opacity: 1 }}
      animate={phase === 2 ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: .7, ease: EASE, delay: phase === 2 ? .1 : 0 }}>
      <div className="pre__bg mesh"><span className="mesh__b" /><span className="mesh__g" /></div>
      <motion.div className="pre__logo"
        animate={phase === 2 ? { scale: 1.06, opacity: 0, filter: 'blur(6px)' } : { scale: 1, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: .5, ease: EASE }}>
        <motion.div className="pre__mark" layout
          initial={{ scale: 2.4, opacity: 0, filter: 'blur(16px)' }}
          animate={{ scale: phase >= 1 ? 1 : 2, opacity: 1, filter: 'blur(0px)' }}
          transition={{ scale: { duration: phase >= 1 ? .85 : 1, ease: EASE }, opacity: { duration: .6 }, filter: { duration: .8 }, layout: { duration: .85, ease: EASE } }}>
          <Mark size={60} animate color="#fff" />
        </motion.div>
        {phase >= 1 && (
          <motion.div className="pre__word" layout initial={{ width: 0 }} animate={{ width: 'auto' }} transition={{ duration: .85, ease: EASE }}>
            <span className="pre__letters">
              {LETTERS.map((ch, i) => (
                <motion.span key={i} className="pre__ch"
                  initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: .55, delay: .15 + i * .045, ease: EASE }}>{ch}</motion.span>
              ))}
            </span>
            <motion.span className="pre__ai"
              initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: .5, delay: .15 + LETTERS.length * .045 + .05, ease: EASE }}>
              AI<motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: .6, delay: .15 + LETTERS.length * .045 + .35, ease: EASE }} style={{ transformOrigin: 'left' }} />
            </motion.span>
          </motion.div>
        )}
      </motion.div>
      <motion.div className="pre__bar" initial={{ scaleX: 0 }} animate={{ scaleX: phase >= 2 ? 1 : phase === 1 ? .8 : .35 }} transition={{ duration: 1, ease: EASE }} />
    </motion.div>
  )
}
