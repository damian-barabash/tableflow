import { useEffect, useState } from 'react'
import { I } from './Icons'
import { useI18n } from '../i18n'
import './voices.css'

export function Voices() {
  const { t, locale } = useI18n()
  const [i, setI] = useState(0)
  const n = t.voices.items.length
  useEffect(() => { setI(0); const id = setInterval(() => setI(v => (v + 1) % n), 5200); return () => clearInterval(id) }, [n, locale])
  return (
    <section className="section section--tight voices">
      <div className="container voices__in">
        <div className="voices__quote rv" data-px="0.06">
          <p className="voices__title eyebrow lang-swap">{t.voices.title}</p>
          <div className="voices__stack">
            {t.voices.items.map((item, k) => (
              <blockquote key={k} className={`voices__item ${k === i ? 'is-active' : ''}`} aria-hidden={k !== i}>
                <p className="voices__text">{item.text}</p>
                <footer><b>{item.who}</b><span>{item.role}</span></footer>
              </blockquote>
            ))}
          </div>
          <div className="voices__dots" role="tablist">{t.voices.items.map((_, k) => <button key={k} role="tab" aria-selected={k === i} className={k === i ? 'is-active' : ''} onClick={() => setI(k)} />)}</div>
        </div>
        <div className="voices__right rv" data-delay="1" data-px="0.12">
          <p className="eyebrow lang-swap">{t.voices.integrationsTitle}</p>
          <ul className="voices__logos lang-swap">
            {t.voices.integrations.map(name => <li key={name}>{logo(name)}<span>{name}</span></li>)}
          </ul>
          <hr />
          <p className="eyebrow lang-swap">{t.voices.channelsTitle}</p>
          <ul className="voices__chips lang-swap">{t.voices.channels.map(c => <li key={c}>{c}</li>)}</ul>
        </div>
      </div>
    </section>
  )
}

function logo(name: string) {
  const n = name.toLowerCase()
  const s = { width: 16, height: 16 }
  if (n.includes('calendar')) return <I.calendar {...s} />
  if (n.includes('wallet')) return <I.wallet {...s} />
  if (n === 'ios') return <I.apple {...s} />
  if (n === 'android') return <I.android {...s} />
  if (n === 'sms') return <I.msg {...s} />
  if (n === 'whatsapp') return <I.phone {...s} />
  return <I.bolt {...s} />
}
