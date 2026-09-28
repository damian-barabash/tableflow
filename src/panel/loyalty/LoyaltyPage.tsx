import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { get, insert, errText, rpc } from '../../app/api'
import { Badge, Empty, Ic, Kpi, Loading, PageHead, Panel, Tabs, fmtAgo, fmtNum, useToast } from '../../app/ui'
import { Bars } from '../../app/charts'
import { designFor, normalizeDesign } from '../../loyalty/design'
import { WebCard } from '../../loyalty/CardVisual'
import { usePanel } from '../PanelApp'
import { CardsTab } from './CardsTab'
import { Designer } from './Designer'
import { MessagesTab } from './MessagesTab'
import { ShareTab } from './ShareTab'
import { ProgramSettings } from './ProgramSettings'
import { EVENT_LABEL, type Program } from './types'
import './loyalty.css'

type View = 'przeglad' | 'karty' | 'projekt' | 'powiadomienia' | 'udostepnij' | 'ustawienia'

export function LoyaltyPage() {
  const { company, canManage, href } = usePanel()
  const loc = useLocation(), nav = useNavigate(), toast = useToast()
  const q = new URLSearchParams(loc.search)
  const [programs, setPrograms] = useState<Program[] | undefined>(undefined)
  const load = useCallback(async () => {
    setPrograms(await get<Program[]>(`loyalty_programs?company_id=eq.${company.id}&order=created_at.asc&select=*`).catch(() => []))
  }, [company.id])
  useEffect(() => { void load() }, [load])

  const pid = q.get('p') && programs?.some(p => p.id === q.get('p')) ? q.get('p')! : programs?.find(p => p.status !== 'archived')?.id ?? programs?.[0]?.id
  const program = programs?.find(p => p.id === pid)
  const view = (q.get('v') as View) || 'przeglad'
  const go = (v: View, p = pid) => nav(href('lojalnosc', { ...(p ? { p } : {}), v }))
  const onSaved = (p: Program) => setPrograms(list => list?.map(x => x.id === p.id ? p : x))

  const create = async () => {
    try {
      const d = designFor(company.industry, company.name)
      const p = await insert<Program>('loyalty_programs', {
        company_id: company.id, name: 'Karta stałego klienta', reward: /kaw|caf/i.test(company.industry ?? '') ? 'Kawa gratis' : 'Nagroda gratis', stamps_required: 10,
        design: d, info: { address: [company.address, company.city].filter(Boolean).join(', ') || undefined, phone: company.phone || undefined, website: company.website || undefined },
      })
      await load(); toast('Utworzono program — zaprojektuj kartę'); go('projekt', p.id)
    } catch (e) { toast(errText(e), 'err') }
  }

  if (programs === undefined) return <Loading />
  if (!programs.length || !program) return <Onboarding onCreate={create} canManage={canManage} />

  const tabs: { v: View; label: string; hidden?: boolean }[] = [
    { v: 'przeglad', label: 'Przegląd' }, { v: 'karty', label: 'Karty klientów' },
    { v: 'projekt', label: 'Projekt karty', hidden: !canManage }, { v: 'powiadomienia', label: 'Powiadomienia', hidden: !canManage },
    { v: 'udostepnij', label: 'Udostępnij' }, { v: 'ustawienia', label: 'Ustawienia', hidden: !canManage },
  ]
  const status = { draft: <Badge tone="warn">Szkic</Badge>, active: <Badge tone="ok">Aktywny</Badge>, archived: <Badge>Archiwum</Badge> }[program.status]

  return (
    <>
      <PageHead title="Lojalność" chip={program.name} sub={<span className="ap-row" style={{ gap: 8 }}>{status}<span>{program.stamps_required} pieczątek → {program.reward}</span></span>}
        actions={<>
          {programs.length > 1 && <select className="input ap-select" value={program.id} onChange={e => go('przeglad', e.target.value)} aria-label="Program">{programs.map(p => <option key={p.id} value={p.id}>{p.name}{p.status === 'archived' ? ' (archiwum)' : ''}</option>)}</select>}
          {canManage && <button className="btn btn--ghost btn--sm" onClick={create}><Ic.plus width={15} height={15} /> Nowy program</button>}
          <Link className="btn btn--primary btn--sm" to={href('skaner')}><Ic.scan width={15} height={15} /> Skaner</Link>
        </>} />
      {program.status === 'draft' && view !== 'projekt' && canManage && (
        <div className="ap-note ap-note--warn" style={{ marginBottom: 20 }}><Ic.sparkle width={18} height={18} /><span><b>Karta jest szkicem.</b> Zaprojektuj ją i kliknij „Opublikuj kartę” — wtedy klienci będą mogli ją dodać do Apple Wallet i Google Wallet.</span><button className="btn btn--primary btn--sm" onClick={() => go('projekt')}>Projektuj</button></div>
      )}
      <Tabs value={view} onChange={v => go(v)} tabs={tabs} />
      {view === 'przeglad' && <Overview program={program} go={go} />}
      {view === 'karty' && <CardsTab program={program} />}
      {view === 'projekt' && canManage && <Designer program={program} onSaved={onSaved} />}
      {view === 'powiadomienia' && canManage && <MessagesTab program={program} />}
      {view === 'udostepnij' && <ShareTab program={program} />}
      {view === 'ustawienia' && canManage && <ProgramSettings program={program} onSaved={onSaved} onDeleted={async () => { await load(); go('przeglad', '') }} />}
    </>
  )
}

function Onboarding({ onCreate, canManage }: { onCreate: () => void; canManage: boolean }) {
  const { company } = usePanel()
  const d = designFor(company.industry, company.name)
  const [demo, setDemo] = useState(3)
  useEffect(() => { const id = setInterval(() => setDemo(v => v >= 10 ? 1 : v + 1), 1100); return () => clearInterval(id) }, [])
  return (
    <>
      <PageHead title="Lojalność" chip="Start" />
      <div className="ly-onb">
        <div className="ly-onb__text">
          <span className="eyebrow">Karty w Apple Wallet i Google Wallet</span>
          <h2>Twoja karta stałego klienta — w telefonie każdego klienta.</h2>
          <p>Zaprojektuj kartę w kolorach firmy, udostępnij kod QR przy kasie, a obsługa przybija pieczątki skanerem w telefonie lub laptopie. Klient dostaje powiadomienie przy każdej pieczątce i nagrodzie.</p>
          <ol>
            <li><b>1</b><span><strong>Projekt</strong> — logo, kolory, gradient, własne pieczątki.</span></li>
            <li><b>2</b><span><strong>Udostępnij</strong> — plakat z QR, link na Instagram i stronę.</span></li>
            <li><b>3</b><span><strong>Skanuj</strong> — pieczątka w 2 sekundy, statystyki na bieżąco.</span></li>
          </ol>
          {canManage ? <button className="btn btn--primary" onClick={onCreate}>Utwórz kartę lojalnościową <Ic.arrow className="arrow" width={16} height={16} /></button> : <p className="ap-muted">Poproś właściciela firmy o utworzenie programu.</p>}
        </div>
        <div className="ly-onb__card"><WebCard design={normalizeDesign(d)} data={{ name: 'Karta stałego klienta', reward: 'Nagroda gratis', required: 10, company: company.name, stamps: demo, customer: 'Anna K.' }} /></div>
      </div>
    </>
  )
}

interface Stats {
  cards: number; cards_active: number; new_cards: number; stamps: number; rewards: number; rewards_ready: number; apple: number; google: number; returning: number; avg_stamps: number
  series: { d: string; stamps: number; cards: number; rewards: number }[]
  recent: { kind: string; delta: number; at: string; card: string | null; code: string | null }[]
}
function Overview({ program, go }: { program: Program; go: (v: View) => void }) {
  const { company, canManage, wallet } = usePanel()
  const [s, setS] = useState<Stats | null>(null)
  useEffect(() => { void rpc<Stats>('loyalty_stats', { p_company: company.id, p_days: 30, p_program: program.id }).then(setS).catch(() => setS(null)) }, [company.id, program.id])
  const design = normalizeDesign(program.design)
  if (!s) return <Loading />
  return (
    <div className="ap-stack">
      <div className="ap-kpis">
        <Kpi label="Karty klientów" value={fmtNum(s.cards)} hint={`+${s.new_cards} w 30 dni`} />
        <Kpi label="Aktywni (30 dni)" value={fmtNum(s.cards_active)} hint={s.cards ? `${Math.round((s.cards_active / s.cards) * 100)}% kart` : '—'} />
        <Kpi label="Pieczątki (30 dni)" value={fmtNum(s.stamps)} />
        <Kpi label="Nagrody wydane" value={fmtNum(s.rewards)} hint={`${s.rewards_ready} czeka na odbiór`} />
        <Kpi label="W portfelu" value={fmtNum(s.apple + s.google)} hint={`Apple ${s.apple} · Google ${s.google}`} tone="brand" />
      </div>
      <div className="ap-grid ap-grid--main">
        <Panel title="Pieczątki dziennie" sub="Ostatnie 30 dni"><Bars data={s.series} k="stamps" label="pieczątek" /></Panel>
        <Panel title="Twoja karta" actions={canManage ? <button className="btn btn--ghost btn--xs" onClick={() => go('projekt')}><Ic.palette width={14} height={14} /> Edytuj</button> : undefined}>
          <WebCard design={design} data={{ name: program.name, reward: program.reward, required: program.stamps_required, company: company.name, stamps: Math.min(3, program.stamps_required), customer: 'Podgląd' }} />
          <div className="ly-wallet-status">
            <span className={wallet?.apple ? 'is-on' : ''}><Ic.apple width={14} height={14} /> Apple Wallet {wallet?.apple ? 'aktywny' : 'w konfiguracji'}</span>
            <span className={wallet?.google ? 'is-on' : ''}><Ic.android width={14} height={14} /> Google Wallet {wallet?.google ? 'aktywny' : 'w konfiguracji'}</span>
          </div>
        </Panel>
      </div>
      <div className="ap-grid ap-grid--2">
        <Panel title="Ostatnia aktywność">
          {s.recent.length ? <ul className="ly-feed">{s.recent.slice(0, 8).map((e, i) => (
            <li key={i}><i className={`is-${e.kind}`} /><span><b>{e.card || 'Klient'}</b> · {EVENT_LABEL[e.kind] ?? e.kind}{e.kind === 'stamp' && e.delta > 1 ? ` ×${e.delta}` : ''}</span><small>{fmtAgo(e.at)}</small></li>
          ))}</ul> : <Empty title="Jeszcze nic się nie wydarzyło" text="Gdy klienci dodadzą kartę i dostaną pierwsze pieczątki, zobaczysz to tutaj." />}
        </Panel>
        <Panel title="Szybkie akcje">
          <div className="ly-actions">
            <button onClick={() => go('udostepnij')}><Ic.qr width={20} height={20} /><b>Plakat z kodem QR</b><small>Wydrukuj i postaw przy kasie</small></button>
            {canManage && <button onClick={() => go('powiadomienia')}><Ic.send width={20} height={20} /><b>Wyślij powiadomienie</b><small>Do klientów z kartą w portfelu</small></button>}
            <button onClick={() => go('karty')}><Ic.users width={20} height={20} /><b>Karty klientów</b><small>Szukaj, dodaj ręcznie, popraw pieczątki</small></button>
            {canManage && <button onClick={() => go('projekt')}><Ic.palette width={20} height={20} /><b>Projekt karty</b><small>Kolory, logo, pieczątki</small></button>}
          </div>
        </Panel>
      </div>
    </div>
  )
}
