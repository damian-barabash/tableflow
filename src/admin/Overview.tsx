import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { get, rpc } from '../app/api'
import { Badge, Empty, Kpi, Loading, PageHead, Panel, deltaPct, fmtAgo, fmtNum } from '../app/ui'
import { Bars } from '../app/charts'
import type { AnalyticsData } from './Analytics'
import { AUDIT_LABEL, type AuditRow } from './Audit'

interface Ov {
  leads: number; leads_7d: number; leads_new: number; companies: number; users: number; cards: number; stamps_7d: number; views_today: number; visitors_today: number; live: number
  latest_leads: { id: string; email: string | null; phone: string | null; company: string | null; business_type: string | null; source: string; created_at: string; status: string }[]
}
export function Overview() {
  const [o, setO] = useState<Ov | null>(null)
  const [a, setA] = useState<AnalyticsData | null>(null)
  const [log, setLog] = useState<AuditRow[]>([])
  useEffect(() => {
    void rpc<Ov>('admin_overview').then(setO).catch(() => {})
    void rpc<AnalyticsData>('admin_analytics', { p_days: 14 }).then(setA).catch(() => {})
    void get<AuditRow[]>('audit_log?select=*&order=created_at.desc&limit=8').then(setLog).catch(() => {})
  }, [])
  if (!o) return <Loading />
  return (
    <>
      <PageHead title="Przegląd" chip={new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })} sub="Najważniejsze liczby platformy w jednym miejscu." />
      <div className="ap-stack">
        <div className="ap-kpis">
          <Kpi label="Teraz na stronie" value={fmtNum(o.live)} hint="ostatnie 5 min" tone="brand" />
          <Kpi label="Odwiedzający dziś" value={fmtNum(o.visitors_today)} hint={`${fmtNum(o.views_today)} odsłon`} />
          <Kpi label="Zgłoszenia" value={fmtNum(o.leads)} hint={`+${o.leads_7d} w 7 dni · ${o.leads_new} nowych`} />
          <Kpi label="Firmy" value={fmtNum(o.companies)} hint={`${o.users} kont`} />
          <Kpi label="Karty lojalnościowe" value={fmtNum(o.cards)} hint={`${fmtNum(o.stamps_7d)} pieczątek w 7 dni`} />
        </div>
        <div className="ap-grid ap-grid--main">
          <Panel title="Odwiedzający" sub="Ostatnie 14 dni" actions={<Link className="btn btn--ghost btn--xs" to="/admin/analityka">Pełna analityka</Link>}>
            {a ? <><Bars data={a.series} k="visitors" label="odwiedzających" /><p className="ap-muted" style={{ marginTop: 10 }}>{fmtNum(a.visitors)} odwiedzających · {fmtNum(a.views)} odsłon · zmiana {(() => { const d = deltaPct(a.visitors, a.prev_visitors); return d == null ? '—' : `${d >= 0 ? '+' : ''}${Math.round(d)}%` })()} vs poprzednie 14 dni</p></> : <Loading />}
          </Panel>
          <Panel title="Najnowsze zgłoszenia" actions={<Link className="btn btn--ghost btn--xs" to="/admin/zgloszenia">Wszystkie</Link>}>
            {o.latest_leads.length ? <ul className="ad-list">{o.latest_leads.map(l => <li key={l.id}><div><b>{l.company || l.email || (l.phone ? `+${l.phone}` : '—')}</b><small>{[l.business_type, l.email, l.source].filter(Boolean).join(' · ')}</small></div><span>{l.status === 'pending' && <Badge tone="brand">nowe</Badge>}<small>{fmtAgo(l.created_at)}</small></span></li>)}</ul> : <Empty title="Brak zgłoszeń" />}
          </Panel>
        </div>
        <Panel title="Ostatnie zmiany" actions={<Link className="btn btn--ghost btn--xs" to="/admin/dziennik">Dziennik</Link>}>
          {log.length ? <ul className="ad-list">{log.map(l => <li key={l.id}><div><b>{AUDIT_LABEL(l)}</b><small>{l.actor_email ?? 'system / klient'}</small></div><small>{fmtAgo(l.created_at)}</small></li>)}</ul> : <Empty title="Brak zmian" />}
        </Panel>
      </div>
    </>
  )
}
