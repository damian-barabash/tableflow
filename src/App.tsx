import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
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
import { AnnouncementBar } from './components/AnnouncementBar'
import { useTracking } from './lib/track'
import { useI18n } from './i18n'

// app areas load on demand — the landing bundle stays as it was
const PanelApp = lazy(() => import('./panel/PanelApp'))
const AdminApp = lazy(() => import('./admin/AdminApp'))
const CardPages = lazy(() => import('./public/CardPages'))
const AppLoading = () => <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><span className="tf-orb is-active" style={{ width: 34, height: 34 }} /></div>

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
  const { locale } = useI18n()
  useDesync(`${intro}-${path}`)
  useTracking(path, locale)
  if (path === '/edit-mod') return <><Seo /><EditMod /></>
  if (/^\/panel(\/|$)/.test(path)) return <><Seo /><Suspense fallback={<AppLoading />}><PanelApp /></Suspense></>
  if (/^\/admin(\/|$)/.test(path)) return <><Seo /><Suspense fallback={<AppLoading />}><AdminApp /></Suspense></>
  if (path === '/moja-karta' || path === '/dolacz' || path === '/s') return <><Seo /><Suspense fallback={<AppLoading />}><CardPages /></Suspense></>
  return (
    <>
      <Seo />
      <AnimatePresence>{intro && <Preloader key="pre" onDone={done} />}</AnimatePresence>
      <AnnouncementBar />
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
