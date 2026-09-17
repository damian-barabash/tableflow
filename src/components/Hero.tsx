import { motion } from 'motion/react'
import { Rich } from './Rich'
import { I } from './Icons'
import { CallCard } from '../mocks/CallCard'
import { DashboardMock } from '../mocks/DashboardMock'
import { useI18n } from '../i18n'
import { SECTION_IDS } from './Nav'
import './hero.css'

const EASE = [0.22, 1, 0.36, 1] as const
const INDUSTRY_ICONS = [I.msg, I.users, I.star, I.doc, I.pin, I.settings, I.bolt, I.star]  // kawiarnie, barbershopy, beauty, gabinety, restauracje, warsztaty, fitness, weterynarze

export function Hero({ ready }: { ready: boolean }) {
  const { t } = useI18n()
  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }
  const fade = (i: number) => ({ initial: { opacity: 0, y: 18, filter: 'blur(6px)' }, animate: ready ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}, transition: { duration: .8, delay: .1 + i * .1, ease: EASE } })
  return (
    <section className="hero" id="top">
      <div className="hero__aura aura" aria-hidden="true" data-px="-0.25" />
      <div className="container">
        <motion.div data-px="0.03" {...fade(0)}><Rich as="h1" className="h1 hero__h1 lang-swap" html={t.hero.h1} path="hero.h1" /></motion.div>
        <motion.div {...fade(1)}><Rich as="p" className="lead hero__sub lang-swap" html={t.hero.sub} path="hero.sub" /></motion.div>
        <motion.div className="hero__cta lang-swap" {...fade(2)}>
          <div className="row wrap">
            <a href={`#${SECTION_IDS.waitlist}`} onClick={go(SECTION_IDS.waitlist)} className="btn btn--primary">{t.hero.ctaPrimary}</a>
            <a href={`#${SECTION_IDS.features}`} onClick={go(SECTION_IDS.features)} className="btn btn--ghost">{t.hero.ctaSecondary}</a>
          </div>
          <div className="hero__works">
            <span>{t.hero.worksFor}:</span>
            <ul>{t.hero.industries.map((name, i) => { const Ic = INDUSTRY_ICONS[i % INDUSTRY_ICONS.length]; return <li key={name}><Ic width={14} height={14} />{name}</li> })}</ul>
          </div>
        </motion.div>
        <motion.div {...fade(3)}><Rich as="p" className="sub hero__note lang-swap" html={t.hero.note} path="hero.note" /></motion.div>
      </div>
      <motion.div className="hero__demo dots" initial={{ opacity: 0, y: 40 }} animate={ready ? { opacity: 1, y: 0 } : {}} transition={{ duration: 1, delay: .45, ease: EASE }}>
        <div className="container hero__demo-in">
          <div className="hero__call" data-px="0.14"><CallCard /></div>
          <div className="hero__db" data-px="0.06"><DashboardMock /></div>
        </div>
      </motion.div>
    </section>
  )
}
