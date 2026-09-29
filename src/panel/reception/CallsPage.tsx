import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authFetch } from '../../lib/auth'
import { errText, get, update } from '../../app/api'
import { Badge, Empty, Field, Ic, Loading, Modal, PageHead, Panel, Segmented, Spinner, fmtAgo, fmtDur, useToast } from '../../app/ui'
import { usePanel } from '../PanelApp'
import { OUTCOME, TOOL_LABEL, dateLabel, dayOf, prettyPhone, reception, relDay, timeOf, type Booking, type Call } from './model'
import './reception.css'

type Filter = 'all' | 'callback' | 'booked' | 'test'
const SELECT = 'id,conversation_id,channel,caller_phone,called_number,client_id,started_at,duration_s,status,title,summary,outcome,customer_name,has_audio,needs_callback,callback_note,handled_at,note'

export function CallsPage() {
  const { company, href } = usePanel()
  const loc = useLocation(), nav = useNavigate()
  const q = new URLSearchParams(loc.search)
  const [filter, setFilter] = useState<Filter>((q.get('f') as Filter) || 'all')
  const [list, setList] = useState<Call[] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    const rows = await get<Call[]>(`rc_calls?company_id=eq.${company.id}&select=${SELECT}&order=started_at.desc&limit=200`).catch(() => [])
    setList(rows)
    const ids = [...new Set(rows.map(r => r.client_id).filter(Boolean))] as string[]
    if (ids.length) { const cs = await get<{ id: string; name: string | null }[]>(`rc_clients?id=in.(${ids.join(',')})&select=id,name`).catch(() => []); setNames(Object.fromEntries(cs.filter(c => c.name).map(c => [c.id, c.name!]))) }
  }, [company.id])
  const pull = useCallback(async () => { setSyncing(true); await reception('calls_pull', { company_id: company.id }).catch(() => {}); setSyncing(false); await load() }, [company.id, load])
  useEffect(() => { void load(); void pull() }, [load, pull])
  const open = q.get('c')
  const shown = useMemo(() => (list ?? []).filter(c => filter === 'all' ? c.channel === 'phone' || !list?.some(x => x.channel === 'phone') : filter === 'callback' ? c.needs_callback && !c.handled_at : filter === 'booked' ? ['booked', 'rescheduled'].includes(c.outcome ?? '') : c.channel === 'test'), [list, filter])
  const waiting = (list ?? []).filter(c => c.needs_callback && !c.handled_at).length
  const groups = useMemo(() => { const m = new Map<string, Call[]>(); for (const c of shown) { const d = dayOf(c.started_at); m.set(d, [...(m.get(d) ?? []), c]) } return [...m.entries()] }, [shown])
  return (
    <>
      <PageHead title="Rozmowy" chip={list?.length ? String(list.length) : undefined} sub="Każde połączenie odebrane przez asystenta: streszczenie, transkrypcja, nagranie i to, co zrobił w kalendarzu."
        actions={<button className="btn btn--ghost btn--sm" onClick={pull} disabled={syncing}>{syncing ? <Spinner size={14} /> : <Ic.refresh width={14} height={14} />} Odśwież</button>} />
      <div className="ap-row" style={{ marginBottom: 16 }}>
        <Segmented value={filter} onChange={v => { setFilter(v); nav(href('rozmowy', v === 'all' ? {} : { f: v }), { replace: true }) }} options={[
          { v: 'all', label: 'Połączenia' }, { v: 'callback', label: <>Do oddzwonienia{waiting ? <Badge tone="err">{waiting}</Badge> : null}</> }, { v: 'booked', label: 'Rezerwacje' }, { v: 'test', label: 'Testy' },
        ]} />
      </div>
      {!list ? <Loading /> : !shown.length ? (
        <Panel><Empty icon={<Ic.phone width={22} height={22} />} title={filter === 'callback' ? 'Nikt nie czeka na telefon' : 'Brak rozmów'} text={filter === 'test' || !list.length ? 'Porozmawiaj z asystentem w zakładce Asystent AI — rozmowa pojawi się tutaj.' : 'Tu pojawią się połączenia odebrane przez asystenta.'} action={<Link className="btn btn--ghost btn--sm" to={href('asystent')}>Asystent AI</Link>} /></Panel>
      ) : groups.map(([d, calls]) => (
        <Panel key={d} title={relDay(d) === dateLabel(d, { weekday: 'short', day: 'numeric', month: 'short' }) ? dateLabel(d) : `${relDay(d)} · ${dateLabel(d, { day: 'numeric', month: 'long' })}`} className="rc-daygroup">
          <div className="rc-list" style={{ marginTop: -8 }}>{calls.map(c => <CallRow key={c.id} c={c} name={c.client_id ? names[c.client_id] : undefined} onClick={() => nav(href('rozmowy', { ...(filter !== 'all' ? { f: filter } : {}), c: c.id }))} />)}</div>
        </Panel>
      ))}
      <CallDetail id={open} onClose={() => { q.delete('c'); nav({ search: q.toString() }, { replace: true }) }} onChanged={load} />
    </>
  )
}

export function CallRow({ c, name, onClick }: { c: Call; name?: string; onClick: () => void }) {
  const o = c.status === 'failed' ? { label: 'Nieodebrane', tone: 'err' as const } : c.status === 'in_progress' ? { label: 'W trakcie', tone: 'brand' as const } : OUTCOME[c.outcome ?? 'other']
  const ico = c.needs_callback && !c.handled_at ? 'is-err' : c.outcome === 'booked' || c.outcome === 'rescheduled' ? 'is-ok' : c.channel === 'test' ? 'is-brand' : ''
  return (
    <button className="rc-li" onClick={onClick}>
      <span className={`rc-ico ${ico}`}>{c.channel === 'test' ? <Ic.mic width={16} height={16} /> : <Ic.phone width={16} height={16} />}</span>
      <div><b>{name || c.customer_name || prettyPhone(c.caller_phone) || (c.channel === 'test' ? 'Rozmowa testowa' : 'Numer ukryty')}{c.title ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {c.title}</span> : null}</b><small>{c.needs_callback && c.callback_note ? c.callback_note : c.summary ?? (c.status === 'in_progress' ? 'Rozmowa trwa albo jest przetwarzana…' : '—')}</small></div>
      <span className="rc-li__side"><span>{timeOf(c.started_at)}{c.duration_s ? ` · ${fmtDur(c.duration_s)}` : ''}</span><Badge tone={o.tone}>{c.needs_callback && !c.handled_at ? 'Oddzwoń' : o.label}</Badge></span>
    </button>
  )
}

export function CallDetail({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged?: () => void }) {
  const { company, href } = usePanel()
  const toast = useToast()
  const [c, setC] = useState<Call | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [audio, setAudio] = useState<string | null>(null)
  const [loadingAudio, setLoadingAudio] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => {
    setC(null); setAudio(null); setBookings([])
    if (!id) return
    void (async () => {
      const [row] = await get<Call[]>(`rc_calls?id=eq.${id}&select=*`).catch(() => [])
      setC(row ?? null); setNote(row?.note ?? '')
      if (row) setBookings(await get<Booking[]>(`rc_bookings?call_id=eq.${row.id}&select=*&order=starts_at.asc`).catch(() => []))
      if (row?.conversation_id && (row.status !== 'done' || !row.transcript)) {
        await reception('calls_pull', { company_id: company.id, conversation_id: row.conversation_id }).catch(() => {})
        const [again] = await get<Call[]>(`rc_calls?id=eq.${id}&select=*`).catch(() => [])
        if (again) setC(again)
      }
    })()
  }, [id, company.id])
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio) }, [audio])
  const loadAudio = async () => {
    if (!c) return
    setLoadingAudio(true)
    try {
      const r = await authFetch('/functions/v1/reception', { method: 'POST', body: JSON.stringify({ action: 'call_audio', company_id: company.id, call_id: c.id }) })
      if (!r.ok) throw new Error('Nagranie jest jeszcze niedostępne.')
      setAudio(URL.createObjectURL(await r.blob()))
    } catch (e) { toast(errText(e), 'err') }
    setLoadingAudio(false)
  }
  const handle = async (done: boolean) => {
    if (!c) return
    try { const [x] = await update<Call>('rc_calls', `id=eq.${c.id}`, { handled_at: done ? new Date().toISOString() : null, note: note || null }); setC({ ...c, ...x }); toast(done ? 'Oznaczono jako załatwione' : 'Przywrócono'); onChanged?.() } catch (e) { toast(errText(e), 'err') }
  }
  const o = c ? OUTCOME[c.outcome ?? 'other'] : null
  return (
    <Modal open={!!id} onClose={onClose} wide title={c ? (c.customer_name || prettyPhone(c.caller_phone) || (c.channel === 'test' ? 'Rozmowa testowa' : 'Połączenie')) : 'Rozmowa'}
      sub={c ? `${dateLabel(dayOf(c.started_at), { weekday: 'long', day: 'numeric', month: 'long' })}, ${timeOf(c.started_at)}${c.duration_s ? ` · ${fmtDur(c.duration_s)}` : ''} · ${fmtAgo(c.started_at)}` : undefined}
      footer={c && <>
        {c.caller_phone && <a className="btn btn--ghost btn--sm" href={`tel:+${c.caller_phone}`}><Ic.phone width={14} height={14} /> Zadzwoń</a>}
        {c.client_id && <Link className="btn btn--ghost btn--sm" to={href('klienci', { id: c.client_id })}>Karta klienta</Link>}
        {c.needs_callback && (c.handled_at ? <button className="btn btn--ghost btn--sm" onClick={() => handle(false)}>Przywróć</button> : <button className="btn btn--primary btn--sm" onClick={() => handle(true)}><Ic.check width={14} height={14} /> Załatwione</button>)}
      </>}>
      {!c ? <Loading /> : (
        <>
          <div className="ap-row">
            {o && <Badge tone={o.tone}>{o.label}</Badge>}
            {c.channel === 'test' && <Badge tone="brand">Test w panelu</Badge>}
            {c.needs_callback && <Badge tone={c.handled_at ? 'ok' : 'err'}>{c.handled_at ? 'Oddzwoniono' : 'Czeka na oddzwonienie'}</Badge>}
            {c.status === 'in_progress' && <Badge tone="brand">Przetwarzanie…</Badge>}
          </div>
          {c.needs_callback && c.callback_note && <div className="ap-note ap-note--warn"><Ic.bell width={18} height={18} /><span><b>Do zrobienia:</b> {c.callback_note}</span></div>}
          {c.summary && <p style={{ fontSize: 14.5, lineHeight: 1.55 }}>{c.summary}</p>}
          {bookings.map(b => <Link key={b.id} to={href('kalendarz', { d: dayOf(b.starts_at), b: b.id })} className="rc-chosen" style={{ textDecoration: 'none' }}><Ic.calendar width={18} height={18} /><div><b>{b.service_name}</b><small>{dateLabel(dayOf(b.starts_at))}, {timeOf(b.starts_at)} · {b.status === 'cancelled' ? 'odwołana' : 'w kalendarzu'}</small></div><Ic.chevronR width={16} height={16} /></Link>)}
          {c.has_audio && (audio ? <audio className="rc-audio" src={audio} controls autoPlay /> : <button className="btn btn--ghost btn--sm" onClick={loadAudio} disabled={loadingAudio} style={{ alignSelf: 'flex-start' }}>{loadingAudio ? <Spinner size={14} /> : <Ic.mic width={14} height={14} />} Odsłuchaj nagranie</button>)}
          {c.transcript?.length ? (
            <div className="rc-tx">{c.transcript.flatMap((t, i) => [
              ...t.tools.map((x, j) => <span key={`${i}t${j}`} className={`rc-toolchip ${t.results.some(r => r.name === x.name && r.error) ? 'is-err' : ''}`}><Ic.check width={12} height={12} /> {TOOL_LABEL[x.name] ?? x.name}</span>),
              t.text ? <div key={i} className={`rc-bubble is-${t.role}`}>{t.t != null && <small>{Math.floor(t.t / 60)}:{String(Math.round(t.t % 60)).padStart(2, '0')}</small>}{t.text}</div> : null,
            ])}</div>
          ) : c.status !== 'failed' && <p className="ap-muted">Transkrypcja pojawi się po zakończeniu rozmowy.</p>}
          <Field label="Notatka zespołu"><textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== (c.note ?? '') && update('rc_calls', `id=eq.${c.id}`, { note: note || null }).catch(e => toast(errText(e), 'err'))} placeholder="np. oddzwoniłam, klient przełożył na piątek" /></Field>
        </>
      )}
    </Modal>
  )
}
