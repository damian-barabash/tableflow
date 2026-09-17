import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { I } from '../components/Icons'
import { useI18n } from '../i18n'

export function Policy({ kind }: { kind: 'privacy' | 'cookies' | 'terms' }) {
  const { t } = useI18n()
  const p = t.policies[kind]
  useEffect(() => { document.title = `${p.title} — TableFlow AI`; window.scrollTo(0, 0) }, [p.title])
  return (
    <main className="section" style={{ paddingTop: 'clamp(40px, 6vw, 80px)' }}>
      <div className="container">
        <Link to="/" className="link" style={{ marginBottom: 28, fontSize: 14 }}><I.chevronL width={14} height={14} /> {t.common.back}</Link>
        <article className="prose">
          <h1>{p.title}</h1>
          <p className="meta">{t.common.updated}: {p.updated}</p>
          <p style={{ marginTop: 16 }}>{p.intro}</p>
          {p.sections.map(s => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {s.p.map((para, i) => <p key={i}>{para}</p>)}
              {s.list && <ul>{s.list.map(li => <li key={li}>{li}</li>)}</ul>}
            </section>
          ))}
        </article>
      </div>
    </main>
  )
}
