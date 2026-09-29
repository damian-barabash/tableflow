import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { errText, get, insert, remove, rpc, update } from '../../app/api'
import { Avatar, Badge, Empty, Field, Ic, Loading, Modal, PageHead, Panel, Tabs, fmtAgo, fmtNum, useConfirm, useToast } from '../../app/ui'
import { usePanel } from '../PanelApp'
import { CallRow } from './CallsPage'
import { BookingModal } from './CalendarPage'
import { SOURCE_LABEL, STATUS_LABEL, dateLabel, dayOf, loadSetup, normPhone, prettyPhone, timeOf, today, type Booking, type Call, type Client, type Setup } from './model'
import './reception.css'

type Sort = 'recent' | 'visits' | 'name'

export function ClientsPage() {
  const { company, href } = usePanel()
  const loc = useLocation(), nav = useNavigate()
  const q = new URLSearchParams(loc.search)
  const [list, setList] = useState<Client[] | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const [adding, setAdding] = useState(false)
  const load = useCallback(async () => setList(await rpc<Client[]>('rc_clients_list', { p_company: company.id }).catch(() => [])), [company.id])
  useEffect(() => { void load() }, [load])
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase(), d = search.replace(/\D/g, '')
    const l = (list ?? []).filter(c => !s || c.name?.toLowerCase().includes(s) || (d.length >= 3 && c.phone?.includes(d)) || c.email?.toLowerCase().includes(s) || c.tags.some(t => t.toLowerCase().includes(s)))
    return sort === 'visits' ? [...l].sort((a, b) => (b.visits ?? 0) - (a.visits ?? 0)) : sort === 'name' ? [...l].sort((a, b) => (a.name ?? '~').localeCompare(b.name ?? '~', 'pl')) : l
  }, [list, search, sort])
  const open = q.get('id')
  const stats = useMemo(() => ({ all: list?.length ?? 0, returning: (list ?? []).filter(c => (c.visits ?? 0) >= 2).length, upcoming: (list ?? []).filter(c => c.next_at).length, loyal: (list ?? []).filter(c => c.loyalty).length }), [list])
  return (
    <>
      <PageHead title="Klienci" chip={list ? fmtNum(list.length) : undefined} sub="Baza budowana automatycznie: każdy dzwoniący trafia tu od razu, asystent zapamiętuje imię, wizyty i preferencje — i rozpoznaje klienta przy następnym telefonie."
        actions={<button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><Ic.plus width={15} height={15} /> Dodaj klienta</button>} />
      {!list ? <Loading /> : (
        <>
          <div className="ap-kpis" style={{ marginBottom: 20 }}>
            <div className="ap-kpi"><span className="ap-kpi__l">Wszyscy</span><b className="ap-kpi__v">{fmtNum(stats.all)}</b></div>
            <div className="ap-kpi"><span className="ap-kpi__l">Wracający (2+ wizyty)</span><b className="ap-kpi__v">{fmtNum(stats.returning)}</b></div>
            <div className="ap-kpi"><span className="ap-kpi__l">Z zaplanowaną wizytą</span><b className="ap-kpi__v">{fmtNum(stats.upcoming)}</b></div>
            <div className="ap-kpi"><span className="ap-kpi__l">Z kartą lojalnościową</span><b className="ap-kpi__v">{fmtNum(stats.loyal)}</b></div>
          </div>
          <div className="ap-row" style={{ marginBottom: 14 }}>
            <label className="ap-search"><Ic.search width={16} height={16} /><input className="input" placeholder="Imię, telefon, e-mail, tag…" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <select className="input ap-select" value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sortuj"><option value="recent">Ostatni kontakt</option><option value="visits">Najwięcej wizyt</option><option value="name">Alfabetycznie</option></select>
          </div>
          <Panel pad>
            {!shown.length ? <Empty icon={<Ic.users width={22} height={22} />} title={list.length ? 'Brak wyników' : 'Jeszcze nikogo'} text="Klienci pojawią się automatycznie po pierwszej rozmowie z asystentem albo rezerwacji w kalendarzu." /> : (
              <div className="ap-table-wrap"><table className="ap-table">
                <thead><tr><th>Klient</th><th>Wizyty</th><th className="ap-table-hide-sm">Następna</th><th className="ap-table-hide-sm">Ostatni kontakt</th><th className="ap-table-hide-sm" /></tr></thead>
                <tbody>{shown.map(c => (
                  <tr key={c.id} className="is-click" onClick={() => nav(href('klienci', { id: c.id }))}>
                    <td><div className="ap-cell-user"><Avatar name={c.name || '?'} size={32} /><div><b>{c.name || <span className="ap-muted">Bez imienia</span>}</b><small>{prettyPhone(c.phone) || c.email || '—'}</small></div></div></td>
                    <td>{c.visits ?? 0}{c.no_shows ? <small style={{ color: '#b1321f' }}>{c.no_shows} nieobecn.</small> : null}</td>
                    <td className="ap-table-hide-sm">{c.next_at ? `${dateLabel(dayOf(c.next_at), { day: 'numeric', month: 'short' })}, ${timeOf(c.next_at)}` : '—'}</td>
                    <td className="ap-table-hide-sm">{fmtAgo(c.last_at)}</td>
                    <td className="ap-table-hide-sm"><div className="ap-chips">{c.loyalty && <Badge tone="brand"><Ic.card width={11} height={11} /> {c.loyalty.stamps % c.loyalty.required}/{c.loyalty.required}</Badge>}{c.tags.slice(0, 2).map(t => <Badge key={t}>{t}</Badge>)}<Badge>{SOURCE_LABEL[c.source] ?? c.source}</Badge></div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Panel>
        </>
      )}
      <ClientModal id={open} onClose={() => nav(href('klienci'), { replace: true })} onChanged={load} />
      <AddClient open={adding} onClose={() => setAdding(false)} onDone={async id => { setAdding(false); await load(); nav(href('klienci', { id })) }} />
    </>
  )
}

function AddClient({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const { company } = usePanel()
  const toast = useToast()
  const [f, setF] = useState({ name: '', phone: '', email: '', notes: '' })
  useEffect(() => { if (open) setF({ name: '', phone: '', email: '', notes: '' }) }, [open])
  const save = async () => {
    const phone = f.phone.trim() ? normPhone(f.phone) : null
    if (f.phone.trim() && !phone) { toast('Nieprawidłowy numer telefonu', 'err'); return }
    try {
      if (phone) { const ex = await get<Client[]>(`rc_clients?company_id=eq.${company.id}&phone=eq.${phone}&select=id`); if (ex[0]) { toast('Klient z tym numerem już jest w bazie', 'info'); onDone(ex[0].id); return } }
      const c = await insert<Client>('rc_clients', { company_id: company.id, name: f.name.trim() || null, phone, email: f.email.trim() || null, notes: f.notes.trim() || null, source: 'panel' })
      toast('Dodano klienta'); onDone(c.id)
    } catch (e) { toast(errText(e), 'err') }
  }
  return (
    <Modal open={open} onClose={onClose} title="Nowy klient" footer={<><button className="btn btn--ghost btn--sm" onClick={onClose}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={!f.name.trim() && !f.phone.trim()} onClick={save}>Dodaj</button></>}>
      <div className="ap-form">
        <Field label="Imię i nazwisko"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <div className="ap-form ap-form--2"><Field label="Telefon"><input className="input" inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field><Field label="E-mail"><input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field></div>
        <Field label="Notatki" hint="Asystent AI przeczyta je, gdy klient zadzwoni."><textarea className="input" rows={3} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="np. woli Kasię, alergia na lateks" /></Field>
      </div>
    </Modal>
  )
}

function ClientModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { company, canManage, href } = usePanel()
  const toast = useToast(), confirm = useConfirm(), nav = useNavigate()
  const [c, setC] = useState<Client | null>(null)
  const [f, setF] = useState({ name: '', phone: '', email: '', notes: '', tags: '' })
  const [bookings, setBookings] = useState<Booking[]>([])
  const [calls, setCalls] = useState<Call[]>([])
  const [loyal, setLoyal] = useState<{ code: string; stamps: number; total_stamps: number; program: { name: string; stamps_required: number; reward: string } } | null>(null)
  const [tab, setTab] = useState<'wizyty' | 'rozmowy'>('wizyty')
  const [setup, setSetup] = useState<Setup | null>(null)
  const [book, setBook] = useState(false)
  const load = useCallback(async () => {
    if (!id) return
    const [row] = await get<Client[]>(`rc_clients?id=eq.${id}&select=*`).catch(() => [])
    setC(row ?? null)
    if (!row) return
    setF({ name: row.name ?? '', phone: prettyPhone(row.phone), email: row.email ?? '', notes: row.notes ?? '', tags: row.tags.join(', ') })
    const [bk, cl, lc] = await Promise.all([
      get<Booking[]>(`rc_bookings?client_id=eq.${id}&select=*&order=starts_at.desc&limit=100`).catch(() => []),
      get<Call[]>(`rc_calls?client_id=eq.${id}&select=id,conversation_id,channel,caller_phone,started_at,duration_s,status,title,summary,outcome,customer_name,has_audio,needs_callback,callback_note,handled_at&order=started_at.desc&limit=50`).catch(() => []),
      row.phone ? get<NonNullable<typeof loyal>[]>(`loyalty_cards?company_id=eq.${company.id}&phone=eq.${row.phone}&select=code,stamps,total_stamps,program:loyalty_programs(name,stamps_required,reward)&order=created_at.desc&limit=1`).catch(() => []) : Promise.resolve([]),
    ])
    setBookings(bk); setCalls(cl); setLoyal(lc[0] ?? null)
  }, [id, company.id])
  useEffect(() => { setC(null); setTab('wizyty'); void load() }, [load])
  if (!id) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const dirty = c && (f.name !== (c.name ?? '') || normPhone(f.phone) !== c.phone && !(f.phone === '' && !c.phone) || f.email !== (c.email ?? '') || f.notes !== (c.notes ?? '') || f.tags !== c.tags.join(', '))
  const save = async () => {
    if (!c) return
    const phone = f.phone.trim() ? normPhone(f.phone) : null
    if (f.phone.trim() && !phone) { toast('Nieprawidłowy numer telefonu', 'err'); return }
    try { await update('rc_clients', `id=eq.${c.id}`, { name: f.name.trim() || null, phone, email: f.email.trim() || null, notes: f.notes.trim() || null, tags: f.tags.split(',').map(t => t.trim()).filter(Boolean) }); toast('Zapisano'); await load(); onChanged() }
    catch (e) { toast(/duplicate|unique/i.test(errText(e)) ? 'Inny klient ma już ten numer.' : errText(e), 'err') }
  }
  const del = async () => {
    if (!c || !await confirm({ title: 'Usunąć klienta (RODO)?', text: 'Usuniemy dane kontaktowe i notatki. Rezerwacje i rozmowy zostaną w historii bez powiązania z klientem.', ok: 'Usuń', danger: true, typeToConfirm: c.name || undefined })) return
    try { await remove('rc_clients', `id=eq.${c.id}`); toast('Usunięto'); onChanged(); onClose() } catch (e) { toast(errText(e), 'err') }
  }
  const past = bookings.filter(b => b.starts_at < new Date().toISOString())
  const next = bookings.filter(b => b.starts_at >= new Date().toISOString() && ['pending', 'confirmed'].includes(b.status)).reverse()
  const visits = past.filter(b => ['confirmed', 'completed'].includes(b.status)).length
  const spent = past.filter(b => ['confirmed', 'completed'].includes(b.status)).reduce((s, b) => s + Number(b.price ?? 0), 0)
  return (
    <>
      <Modal open onClose={onClose} wide="xl" title={c ? <span className="ap-row"><Avatar name={c.name || '?'} size={34} />{c.name || 'Bez imienia'}</span> : 'Klient'} sub={c ? `W bazie od ${dateLabel(dayOf(c.created_at), { day: 'numeric', month: 'long', year: 'numeric' })} · ${SOURCE_LABEL[c.source] ?? c.source}` : undefined}
        footer={c && <>{canManage && <button className="btn btn--ghost btn--sm" style={{ color: '#b1321f', marginRight: 'auto' }} onClick={del}><Ic.trash width={14} height={14} /> Usuń (RODO)</button>}{c.phone && <a className="btn btn--ghost btn--sm" href={`tel:+${c.phone}`}><Ic.phone width={14} height={14} /> Zadzwoń</a>}<button className="btn btn--ghost btn--sm" onClick={() => void loadSetup(company.id).then(s => { setSetup(s); setBook(true) })}><Ic.calendar width={14} height={14} /> Umów wizytę</button><button className="btn btn--primary btn--sm" disabled={!dirty} onClick={save}>Zapisz</button></>}>
        {!c ? <Loading /> : (
          <div className="rc-split" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)' }}>
            <div className="ap-stack" style={{ gap: 14 }}>
              <div className="ap-kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
                <div className="ap-kpi"><span className="ap-kpi__l">Wizyty</span><b className="ap-kpi__v">{visits}</b></div>
                <div className="ap-kpi"><span className="ap-kpi__l">Rozmowy</span><b className="ap-kpi__v">{calls.length}</b></div>
                <div className="ap-kpi"><span className="ap-kpi__l">Wydał(a)</span><b className="ap-kpi__v" style={{ fontSize: 20 }}>{spent ? `${Math.round(spent)} zł` : '—'}</b></div>
              </div>
              <Field label="Imię i nazwisko"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
              <div className="ap-form ap-form--2"><Field label="Telefon"><input className="input" inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field><Field label="E-mail"><input className="input" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field></div>
              <Field label="Notatki i preferencje" hint="Asystent zna te notatki i sam dopisuje nowe (z datą), gdy klient coś powie."><textarea className="input" rows={5} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
              <Field label="Tagi" hint="Po przecinku, np. VIP, stały, firma"><input className="input" value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })} /></Field>
              {loyal ? <div className="ap-note" style={{ alignItems: 'center' }}><Ic.card width={18} height={18} /><span>„{loyal.program.name}”: <b>{loyal.stamps % loyal.program.stamps_required}/{loyal.program.stamps_required}</b> · razem {loyal.total_stamps} pieczątek</span><Link className="btn btn--primary btn--sm" to={href('skaner', { c: loyal.code })}>Otwórz</Link></div>
                : c.phone && <p className="ap-muted"><Ic.card width={14} height={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Brak karty lojalnościowej na ten numer.</p>}
            </div>
            <div>
              <Tabs value={tab} onChange={setTab} tabs={[{ v: 'wizyty', label: `Wizyty · ${bookings.length}` }, { v: 'rozmowy', label: `Rozmowy · ${calls.length}` }]} />
              {tab === 'wizyty' ? (!bookings.length ? <Empty title="Brak wizyt" /> : (
                <div className="rc-list">
                  {[...next, ...past].map(b => (
                    <Link key={b.id} to={href('kalendarz', { d: dayOf(b.starts_at), b: b.id })} className="rc-li" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <span className={`rc-ico ${b.starts_at >= new Date().toISOString() ? 'is-brand' : b.status === 'no_show' || b.status === 'cancelled' ? 'is-err' : 'is-ok'}`}><Ic.calendar width={16} height={16} /></span>
                      <div><b>{b.service_name ?? 'Wizyta'}</b><small>{dateLabel(dayOf(b.starts_at), { weekday: 'short', day: 'numeric', month: 'short', year: dayOf(b.starts_at).slice(0, 4) !== today().slice(0, 4) ? 'numeric' : undefined })}, {timeOf(b.starts_at)} · {SOURCE_LABEL[b.source] ?? b.source}</small></div>
                      <span className="rc-li__side"><Badge tone={STATUS_LABEL[b.status].tone}>{STATUS_LABEL[b.status].label}</Badge></span>
                    </Link>
                  ))}
                </div>
              )) : (!calls.length ? <Empty title="Brak rozmów" /> : <div className="rc-list">{calls.map(k => <CallRow key={k.id} c={k} onClick={() => nav(href('rozmowy', { c: k.id }))} />)}</div>)}
            </div>
          </div>
        )}
      </Modal>
      {setup && <BookingModal setup={setup} init={book && c ? { date: today(), client: c } : null} onClose={() => setBook(false)} onSaved={async () => { setBook(false); toast('Umówiono'); await load(); onChanged() }} />}
    </>
  )
}
