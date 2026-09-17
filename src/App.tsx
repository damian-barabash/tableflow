import { useCallback, useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { Preloader } from './components/Preloader'
import { LangAssistant } from './components/LangAssistant'
import { CookieBanner } from './components/CookieBanner'
import { Home } from './pages/Home'
import { Policy } from './pages/Policy'
import { Karta } from './pages/Karta'
import { useDesync } from './lib/useDesync'
import { EditMod } from './pages/EditMod'
import { Seo } from './seo/Seo'

function useHashScroll() {
  const loc = useLocation()
  useEffect(() => {
    if (loc.pathname !== '/') return
    const id = decodeURIComponent(loc.hash.slice(1))
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [loc])
}

export default function App() {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [intro, setIntro] = useState(!reduced)
  const [ready, setReady] = useState(reduced)
  const done = useCallback(() => { setIntro(false); setReady(true) }, [])
  useHashScroll()
  const path = useLocation().pathname
  useDesync(`${intro}-${path}`)
  if (path === '/edit-mod') return <><Seo /><EditMod /></>
  return (
    <>
      <Seo />
      <AnimatePresence>{intro && <Preloader key="pre" onDone={done} />}</AnimatePresence>
      <Nav />
      <Routes>
        <Route path="/" element={<Home ready={ready} />} />
        <Route path="/polityka-prywatnosci" element={<Policy kind="privacy" />} />
        <Route path="/polityka-cookies" element={<Policy kind="cookies" />} />
        <Route path="/regulamin" element={<Policy kind="terms" />} />
        <Route path="/karta" element={<Karta ready={ready} />} />
        <Route path="*" element={<Home ready={ready} />} />
      </Routes>
      <Footer />
      <CookieBanner ready={ready} />
      <LangAssistant ready={ready} />
    </>
  )
}
