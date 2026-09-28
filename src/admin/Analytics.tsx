import { useEffect, useState } from 'react'
import { rpc } from '../app/api'
import { Badge, Empty, Kpi, Loading, PageHead, Panel, Segmented, deltaPct, fmtAgo, fmtDur, fmtNum, pct, Ic } from '../app/ui'
import { BarList, Bars } from '../app/charts'

interface KN { k: string; n: number; dur?: number }
interface Session {
  visitor: string; started: string; ended: string; views: number; dur: number; scroll: number; referrer: string | null; utm: string | null
  device: string; browser: string; os: string; country: string | null; locale: string | null
  pages: { path: string; at: string; dur: number; scroll: number; sections: string[]; clicks: { c: string; t: number }[] }[]
}
export interface AnalyticsData {
  views: number; visitors: number; sessions: number; avg_duration: number; engaged: number; avg_scroll: number
  prev_views: number; prev_visitors: number; live: number; signups: number; prev_signups: number
  series: { d: string; views: number; visitors: number; signups: number }[]
  hours: { h: number; n: number }[]
  pages: KN[]; referrers: KN[]; utm: KN[]; devices: KN[]; browsers: KN[]; os: KN[]; countries: KN[]; locales: KN[]; sections: KN[]; clicks: KN[]
  home_views: number; scroll_buckets: Record<'25' | '50' | '75' | '100' | 'all', number>
  recent: Session[]
}

// landing sections in page order (ids from src/components/Nav SECTION_IDS + section ids)
const SECTION_ORDER: [string, string][] = [['top', 'Hero'], ['voices', 'Tak brzmi recepcja'], ['stats', 'Metryki'], ['features', 'Platforma'], ['integrations', 'Integracje'], ['industries', 'Branże'], ['hist', 'Dlaczego AI zdecydowała'], ['loyalty', 'Lojalność'], ['app', 'Aplikacja'], ['faq', 'FAQ'], ['waitlist', 'Lista oczekujących']]
const COUNTRY = (k: string) => { try { return k === '?' ? 'Nieznany' : new Intl.DisplayNames(['pl'], { type: 'region' }).of(k) ?? k } catch { return k } }
const DEVICE: Record<string, string> = { desktop: 'Komputer', mobile: 'Telefon', tablet: 'Tablet' }
const LANG: Record<string, string> = { pl: 'Polski', en: 'Angielski', ru: 'Rosyjski', fr: 'Francuski', es: 'Hiszpański' }

export function Analytics() {
  const [days, setDays] = useState<'1' | '7' | '30' | '90'>('30')
  const [a, setA] = useState<AnalyticsData | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { setA(null); void rpc<AnalyticsData>('admin_analytics', { p_days: +days }).then(setA).catch(() => {}) }, [days])
  useEffect(() => { const id = setInterval(() => { void rpc<AnalyticsData>('admin_analytics', { p_days: +days }).then(setA).catch(() => {}) }, 60000); return () => clearInterval(id) }, [days])

  const sectionN = (id: string) => a?.sections.find(s => s.k === id)?.n ?? 0
  return (
    <>
      <PageHead title="Analityka ruchu" chip={a ? <><span className="ad-live" /> {a.live} teraz</> : undefined}
        sub="Bez cookies: odwiedzający liczeni anonimowo (dzienny skrót, bez zapisywania IP). Panel, admin i edytor nie są liczone."
        actions={<Segmented value={days} onChange={setDays} options={[{ v: '1', label: 'Dziś' }, { v: '7', label: '7 dni' }, { v: '30', label: '30 dni' }, { v: '90', label: '90 dni' }]} size="sm" />} />
      {!a ? <Loading /> : (
        <div className="ap-stack">
          <div className="ap-kpis">
            <Kpi label="Odwiedzający" value={fmtNum(a.visitors)} delta={deltaPct(a.visitors, a.prev_visitors)} tone="brand" />
            <Kpi label="Odsłony" value={fmtNum(a.views)} delta={deltaPct(a.views, a.prev_views)} />
            <Kpi label="Sesje" value={fmtNum(a.sessions)} hint={`${a.sessions ? (a.views / a.sessions).toFixed(1).replace('.', ',') : 0} strony / sesję`} />
            <Kpi label="Średni czas" value={fmtDur(a.avg_duration)} hint={`zaangażowanie ${a.engaged}%`} />
            <Kpi label="Zapisy na listę" value={fmtNum(a.signups)} delta={deltaPct(a.signups, a.prev_signups)} hint={`konwersja ${a.visitors ? ((a.signups / a.visitors) * 100).toFixed(1).replace('.', ',') : 0}%`} />
          </div>
          <Panel title={days === '1' ? 'Dziś według godzin' : 'Odwiedzający dziennie'}>
            {days === '1'
              ? <BarList items={a.hours.map(h => ({ k: `${h.h}:00`, n: h.n }))} limit={24} empty="Brak wizyt dzisiaj" />
              : <Bars data={a.series} k="visitors" label="odwiedzających" height={200} />}
          </Panel>
          <div className="ap-grid ap-grid--3">
            <Panel title="Strony"><BarList items={a.pages.map(p => ({ k: p.k, n: p.n, sub: p.dur ? `śr. ${fmtDur(p.dur)}` : undefined }))} /></Panel>
            <Panel title="Źródła ruchu" sub="Pierwsza strona sesji"><BarList items={a.referrers} /></Panel>
            <Panel title="Kampanie (UTM)"><BarList items={a.utm} empty="Brak linków z parametrami utm_" /></Panel>
          </div>
          <div className="ap-grid ap-grid--2">
            <Panel title="Jak daleko przewijają stronę główną" sub={`${fmtNum(a.home_views)} odsłon strony głównej · średnio ${a.avg_scroll}% strony`}>
              <div className="ad-funnel">
                {SECTION_ORDER.map(([id, label]) => { const n = sectionN(id); const p = pct(n, a.home_views); return (
                  <div key={id} className="ad-funnel__row" title={`${label}: ${n} odsłon (${p}%)`}><span>{label}</span><div><i style={{ width: `${p}%` }} /></div><b>{p}%</b></div>
                ) })}
              </div>
            </Panel>
            <Panel title="Kliknięcia" sub="Przyciski i linki na stronie"><BarList items={a.clicks} empty="Brak kliknięć w tym okresie" limit={10} /></Panel>
          </div>
          <div className="ap-grid ap-grid--3">
            <Panel title="Urządzenia"><BarList items={a.devices} labelOf={k => DEVICE[k] ?? k} /><div className="ap-divider" style={{ margin: '12px 0' }} /><BarList items={a.os} limit={5} /></Panel>
            <Panel title="Przeglądarki"><BarList items={a.browsers} /></Panel>
            <Panel title="Kraje i języki"><BarList items={a.countries} labelOf={COUNTRY} limit={6} /><div className="ap-divider" style={{ margin: '12px 0' }} /><BarList items={a.locales} labelOf={k => LANG[k] ?? k} /></Panel>
          </div>
          <Panel title="Ostatnie sesje" sub="Ścieżka każdej wizyty: strony, przewinięte sekcje, kliknięcia, czas." pad>
            {!a.recent.length ? <Empty title="Brak sesji w tym okresie" /> : (
              <ul className="ad-sessions">
                {a.recent.map((s, i) => (
                  <li key={i} className={open === i ? 'is-open' : ''}>
                    <button onClick={() => setOpen(open === i ? null : i)}>
                      <span className="ad-sessions__who">{s.device === 'mobile' ? '📱' : s.device === 'tablet' ? '📲' : '💻'}<b>{s.country ? COUNTRY(s.country) : '—'}</b><small>{s.browser} · {s.os}</small></span>
                      <span className="ad-sessions__src">{s.utm ? <Badge tone="brand">{s.utm}</Badge> : s.referrer ?? 'bezpośrednio'}</span>
                      <span>{s.views} {s.views === 1 ? 'strona' : 'strony'}</span>
                      <span>{fmtDur(s.dur / 1000)}</span>
                      <span className="ad-sessions__at">{fmtAgo(s.started)}</span>
                      <Ic.chevron width={14} height={14} />
                    </button>
                    {open === i && (
                      <ol className="ad-path">
                        {s.pages.map((p, j) => (
                          <li key={j}>
                            <b>{p.path}</b><small>{new Date(p.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })} · {fmtDur(p.dur / 1000)} · przewinięto {p.scroll}%</small>
                            {p.sections.length > 0 && <div className="ap-chips">{SECTION_ORDER.filter(([id]) => p.sections.includes(id)).map(([id, l]) => <Badge key={id}>{l}</Badge>)}</div>}
                            {p.clicks.length > 0 && <div className="ap-chips">{p.clicks.map((c, k) => <Badge key={k} tone="dark">↳ {c.c}</Badge>)}</div>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  )
}
