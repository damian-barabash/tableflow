import { useEffect, useState } from 'react'
import { get, rpc } from '../app/api'
import { Empty, Kpi, Loading, PageHead, Panel, Segmented, fmtAgo, fmtNum, Ic } from '../app/ui'
import { BarList, Bars, Heatmap, Share } from '../app/charts'
import { usePanel } from './PanelApp'
import { EVENT_LABEL, type Program } from './loyalty/types'

interface Stats {
  cards: number; cards_active: number; new_cards: number; stamps: number; rewards: number; rewards_ready: number; apple: number; google: number
  returning: number; avg_stamps: number; marketing: number
  series: { d: string; stamps: number; cards: number; rewards: number }[]
  heat: { dow: number; h: number; n: number }[]
  progress: { s: number; n: number }[]
  staff: { name: string; n: number }[]
  recent: { kind: string; delta: number; at: string; card: string | null; code: string | null }[]
}

export function StatsPage() {
  const { company } = usePanel()
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const [programs, setPrograms] = useState<Program[]>([])
  const [pid, setPid] = useState('')
  const [s, setS] = useState<Stats | null>(null)
  useEffect(() => { void get<Program[]>(`loyalty_programs?company_id=eq.${company.id}&select=id,name,stamps_required,status&order=created_at.asc`).then(setPrograms).catch(() => {}) }, [company.id])
  useEffect(() => {
    setS(null)
    void rpc<Stats>('loyalty_stats', { p_company: company.id, p_days: +days, p_program: pid || null }).then(setS).catch(() => setS(null))
  }, [company.id, days, pid])
  const req = programs.find(p => p.id === pid)?.stamps_required ?? programs[0]?.stamps_required ?? 10

  return (
    <>
      <PageHead title="Statystyki" chip={`${days} dni`} sub="Karty lojalnościowe, pieczątki i nagrody. Kolejne moduły (rozmowy, rezerwacje) dołączą tutaj automatycznie."
        actions={<>
          {programs.length > 1 && <select className="input ap-select" value={pid} onChange={e => setPid(e.target.value)} aria-label="Program"><option value="">Wszystkie programy</option>{programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <Segmented value={days} onChange={setDays} options={[{ v: '7', label: '7 dni' }, { v: '30', label: '30 dni' }, { v: '90', label: '90 dni' }]} size="sm" />
        </>} />
      {!s ? <Loading /> : !programs.length ? <Empty icon={<Ic.analytics width={22} height={22} />} title="Brak danych" text="Utwórz program lojalnościowy — statystyki pojawią się po pierwszych kartach i pieczątkach." /> : (
        <div className="ap-stack">
          <div className="ap-kpis">
            <Kpi label="Pieczątki" value={fmtNum(s.stamps)} hint={`w ${days} dni`} tone="brand" />
            <Kpi label="Nowe karty" value={fmtNum(s.new_cards)} hint={`razem ${fmtNum(s.cards)}`} />
            <Kpi label="Aktywni klienci" value={fmtNum(s.cards_active)} hint="pieczątka w 30 dni" />
            <Kpi label="Powracający" value={s.cards ? `${Math.round((s.returning / s.cards) * 100)}%` : '—'} hint="min. 2 wizyty" />
            <Kpi label="Nagrody wydane" value={fmtNum(s.rewards)} hint={`${s.rewards_ready} czeka`} />
            <Kpi label="Średnio pieczątek" value={String(s.avg_stamps).replace('.', ',')} hint="na kartę" />
          </div>
          <div className="ap-grid ap-grid--2">
            <Panel title="Pieczątki dziennie"><Bars data={s.series} k="stamps" label="pieczątek" /></Panel>
            <Panel title="Nowe karty dziennie"><Bars data={s.series} k="cards" label="nowych kart" /></Panel>
          </div>
          <div className="ap-grid ap-grid--main">
            <Panel title="Kiedy przychodzą klienci" sub="Pieczątki wg dnia tygodnia i godziny"><Heatmap cells={s.heat} /></Panel>
            <Panel title="Gdzie klienci trzymają kartę">
              <Share parts={[{ label: 'Apple Wallet', n: s.apple, tone: 'a' }, { label: 'Google Wallet', n: s.google, tone: 'b' }, { label: 'Tylko karta online', n: Math.max(0, s.cards - s.apple - s.google), tone: 'c' }]} />
              <p className="ap-muted" style={{ marginTop: 14 }}>Zgody marketingowe: <b>{fmtNum(s.marketing)}</b> z {fmtNum(s.cards)} klientów.</p>
            </Panel>
          </div>
          <div className="ap-grid ap-grid--3">
            <Panel title="Postęp klientów" sub="Ile pieczątek mają aktywne karty">
              <BarList items={Array.from({ length: req + 1 }, (_, i) => ({ k: i >= req ? `${req} — nagroda` : `${i} pieczątek`, n: s.progress.find(p => p.s === i)?.n ?? 0 })).filter(x => x.n > 0)} limit={12} empty="Brak kart" />
            </Panel>
            <Panel title="Zespół" sub="Kto przybija najwięcej pieczątek"><BarList items={s.staff.map(x => ({ k: x.name, n: x.n }))} empty="Brak pieczątek w tym okresie" /></Panel>
            <Panel title="Ostatnie zdarzenia">
              {s.recent.length ? <ul className="ly-feed">{s.recent.slice(0, 9).map((e, i) => <li key={i}><i className={`is-${e.kind}`} /><span><b>{e.card || 'Klient'}</b> · {EVENT_LABEL[e.kind] ?? e.kind}</span><small>{fmtAgo(e.at)}</small></li>)}</ul> : <Empty title="Cisza" />}
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}
