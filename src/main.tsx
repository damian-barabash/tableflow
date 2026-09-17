import './styles/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { I18nProvider } from './i18n'
import App from './App'

// GitHub Pages serves 404.html (= index) for /edit-mod, /karta, /polityka-…; map such paths to hash routes.
{
  const { pathname, search, hash } = window.location
  const base = document.querySelector('base')?.getAttribute('href') || '/'
  const rel = pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
  if (rel && rel !== '/' && !rel.includes('.') && !hash) {
    window.location.replace(`${base}#${rel.replace(/\/$/, '')}${search}`)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </I18nProvider>
  </StrictMode>,
)
