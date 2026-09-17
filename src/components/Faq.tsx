import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { I } from './Icons'
import { useI18n } from '../i18n'
import { Rich } from './Rich'
import { SECTION_IDS } from './Nav'
import './faq.css'

export function Faq() {
  const { t, editMode } = useI18n()
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section className="section faq" id={SECTION_IDS.faq}>
      <div className="container">
        <Rich as="h2" className="h2 center rv lang-swap" html={t.faq.h2} path="faq.h2" />
        <div className="faq__list rv" data-delay="1" data-px="0.06">
          {t.faq.items.map((it, i) => (
            <div key={i} className={`faq__item ${open === i || editMode ? 'is-open' : ''}`}>
              <button className="faq__q lang-swap" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <span>{it.q}</span><I.chevron className="faq__chev" width={18} height={18} />
              </button>
              <AnimatePresence initial={false}>
                {(open === i || editMode) && (
                  <motion.div key="a" className="faq__a" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .4, ease: [.22, 1, .36, 1] }}>
                    <Rich as="p" className="lang-swap" html={it.a} path={`faq.items.${i}.a`} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
        <p className="faq__more center sub rv lang-swap">{t.faq.more} <a className="link" href="mailto:hello@tableflow.pl">{t.faq.contact} <I.chevronR className="arrow" width={14} height={14} /></a></p>
      </div>
    </section>
  )
}
