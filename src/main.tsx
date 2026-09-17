import './styles/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nProvider } from './i18n'
import App from './App'

// Clean URLs (indexable). Legacy hash routes (old links, printed QR: /#/karta?src=qr) → /karta?src=qr.
// Trailing slashes are dropped so relative URLs and route matching stay stable.
{
  const { pathname, search, hash } = window.location
  let path = pathname, query = search, frag = hash
  if (hash.startsWith('#/')) {
    const legacy = new URL(hash.slice(1), window.location.origin)
    path = legacy.pathname; query = legacy.search; frag = legacy.hash
  }
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '')
  if (path.endsWith('/index.html')) path = path.slice(0, -'index.html'.length) || '/'
  else if (path.endsWith('.html')) path = path.slice(0, -'.html'.length)   // /regulamin.html → /regulamin
  const next = `${path}${query}${frag}`
  if (next !== `${pathname}${search}${hash}`) history.replaceState(null, '', next)
}

const root = document.getElementById('root')!
// the prerendered snapshot is only for crawlers / no-JS; React takes over from a clean container
root.removeAttribute('data-prerendered')
root.textContent = ''

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
)
