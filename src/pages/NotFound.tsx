import { Link } from 'react-router-dom'
import { I } from '../components/Icons'
import { useI18n } from '../i18n'
import { INDUSTRIES } from '../seo/industries'
import { LOCALE_HOME } from '../seo/routes'
import './industry-page.css'

/** Real 404 page (the old behaviour rendered the home page = soft 404). */
export function NotFound() {
  const { t, locale } = useI18n()
  return (
    <main className="section nf">
      <div className="container">
        <p className="eyebrow">404</p>
        <h1 className="h1" style={{ marginTop: 12 }}>{t.common.notFoundTitle}</h1>
        <p className="lead">{t.common.notFoundText}</p>
        <div className="ip-cta"><Link className="btn btn--primary" to={LOCALE_HOME[locale]}>{t.common.back} <I.arrow className="arrow" width={16} height={16} /></Link></div>
        <h2 className="sub" style={{ marginTop: 48, fontWeight: 500 }}>{t.common.industriesHead}</h2>
        <ul className="ip-others" style={{ marginTop: 14 }}>
          {INDUSTRIES.map(o => <li key={o.slug}><Link to={`/${o.slug}`}>{o.name} <I.chevronR width={14} height={14} aria-hidden="true" /></Link></li>)}
        </ul>
      </div>
    </main>
  )
}
