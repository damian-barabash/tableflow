import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { errText, get, insert, remove, update } from '../../app/api'
import { Badge, Empty, Field, Ic, Loading, Modal, PageHead, Segmented, Spinner, useConfirm, useToast } from '../../app/ui'
import { usePanel } from '../PanelApp'
import {
  KIND, SOURCE_LABEL, STATUS_LABEL, WD_SHORT, addDays, at, dateLabel, dayOf, hhmm, loadSetup, minOf, minutesText, mondayOf, normPhone, performersOf,
  prettyPhone, priceText, slots as fetchSlots, timeOf, toMin, today, weekdayOf, type Booking, type BookingStatus, type Client, type Resource, type Service, type Setup,
} from './model'
import './reception.css'

const PX = 1.1   // pixels per minute

export function CalendarPage() {
  const { company, href } = usePanel()
  const loc = useLocation(), nav = useNavigate()
  const q = new URLSearchParams(loc.search)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('d') ?? '') ? q.get('d')! : today()
  const mode = (q.get('w') === '1' ? 'week' : 'day') as 'day' | 'week'
  const focus = q.get('r') ?? ''
  const go = (o: { d?: string; w?: boolean; r?: string }) => nav(href('kalendarz', { d: o.d ?? date, ...((o.w ?? mode === 'week') ? { w: '1' } : {}), ...((o.r ?? focus) ? { r: o.r ?? focus } : {}) }), { replace: true })

  const [s, setS] = useState<Setup | null>(null)
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [off, setOff] = useState<{ resource_id: string | null; starts_at: string; ends_at: string; reason: string | null }[]>([])
  const [create, setCreate] = useState<{ date: string; time?: string; resource_id?: string } | null>(null)
  const [open, setOpen] = useState<Booking | null>(null)
  const from = mode === 'week' ? mondayOf(date) : date
  const days = mode === 'week' ? 7 : 1

  useEffect(() => { void loadSetup(company.id).then(setS) }, [company.id])
  const load = useCallback(async () => {
    const a = at(from, 0).toISOString(), b = at(addDays(from, days), 0).toISOString()
    const [bk, o] = await Promise.all([
      get<Booking[]>(`rc_bookings?company_id=eq.${company.id}&starts_at=lt.${b}&ends_at=gt.${a}&select=*&order=starts_at.asc`).catch(() => []),
      get<typeof off>(`rc_time_off?company_id=eq.${company.id}&starts_at=lt.${b}&ends_at=gt.${a}&select=resource_id,starts_at,ends_at,reason`).catch(() => []),
    ])
    setBookings(bk); setOff(o)
  }, [company.id, from, days])
  useEffect(() => { setBookings(null); void load() }, [load])
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30000); return () => clearInterval(t) }, [load])
  useEffect(() => { const id = q.get('b'); if (id && bookings) { const b = bookings.find(x => x.id === id); if (b) setOpen(b) } }, [bookings]) // eslint-disable-line react-hooks/exhaustive-deps

  const resources = useMemo(() => (s?.resources ?? []).filter(r => r.active), [s])
  if (!s) return <Loading />
  const label0 = mode === 'week' ? `${dateLabel(from, { day: 'numeric', month: 'short' })} – ${dateLabel(addDays(from, 6), { day: 'numeric', month: 'short', year: 'numeric' })}` : dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })
  const label = label0.charAt(0).toUpperCase() + label0.slice(1)

  return (
    <>
      <PageHead title="Kalendarz" sub="Rezerwacje z telefonu (AI), z panelu i przyszłe integracje w jednym miejscu. Kliknij puste pole, aby dodać wizytę."
        actions={<button className="btn btn--primary btn--sm" onClick={() => setCreate({ date })} disabled={!s.services.length}><Ic.plus width={15} height={15} /> Nowa rezerwacja</button>} />
      {!resources.length || !s.services.length ? (
        <div className="ap-panel"><Empty icon={<Ic.calendar width={22} height={22} />} title="Najpierw usługi i grafik" text="Dodaj usługi i osoby (albo stoliki, sale) — wtedy kalendarz i asystent AI zaczną działać." action={<Link className="btn btn--primary btn--sm" to={href('uslugi')}>Przejdź do ustawień</Link>} /></div>
      ) : (
        <>
          <div className="rc-cal-bar">
            <button className="ap-icon-btn" onClick={() => go({ d: addDays(date, -days) })} aria-label="Wcześniej"><Ic.chevronL width={18} height={18} /></button>
            <button className="btn btn--ghost btn--xs" onClick={() => go({ d: today() })}>Dziś</button>
            <button className="ap-icon-btn" onClick={() => go({ d: addDays(date, days) })} aria-label="Później"><Ic.chevronR width={18} height={18} /></button>
            <span className="rc-cal-bar__date">{label}</span>
            <span className="rc-cal-bar__sp" />
            <input className="input rc-date" type="date" value={date} onChange={e => e.target.value && go({ d: e.target.value })} aria-label="Wybierz dzień" />
            {mode === 'week' && <select className="input ap-select" value={focus} onChange={e => go({ r: e.target.value })} aria-label="Kto"><option value="">Wszyscy</option>{resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
            <Segmented size="sm" value={mode} onChange={v => nav(href('kalendarz', { d: date, ...(v === 'week' ? { w: '1' } : {}) }), { replace: true })} options={[{ v: 'day', label: 'Dzień' }, { v: 'week', label: 'Tydzień' }]} />
          </div>
          {!bookings ? <Loading /> : (
            <Grid s={s} from={from} days={days} columns={mode === 'week' ? null : resources} focus={mode === 'week' ? focus : ''} bookings={bookings} off={off}
              onEmpty={(d, t, r) => setCreate({ date: d, time: t, resource_id: r })} onOpen={setOpen} />
          )}
          <div className="rc-legend">
            <span><i style={{ background: '#464f96' }} />potwierdzona</span>
            <span><i style={{ background: 'repeating-linear-gradient(135deg,#6f6396 0 4px,#8a80ad 4px 8px)' }} />do potwierdzenia</span>
            <span><i style={{ background: 'repeating-linear-gradient(135deg,#f7f6f3 0 4px,#ecebe7 4px 8px)', border: '1px solid #e5e3de' }} />poza grafikiem</span>
            <span><i style={{ background: '#d24a3f', height: 2, borderRadius: 1, verticalAlign: 4 }} />teraz</span>
          </div>
        </>
      )}
      <BookingModal setup={s} init={create} onClose={() => setCreate(null)} onSaved={async () => { setCreate(null); await load() }} />
      <BookingDetail setup={s} booking={open} onClose={() => { setOpen(null); if (q.get('b')) { q.delete('b'); nav({ search: q.toString() }, { replace: true }) } }} onChanged={async () => { await load() }} />
    </>
  )
}

// ---------------------------------------------------------------- grid
interface GridProps {
  s: Setup; from: string; days: number; columns: Resource[] | null; focus: string; bookings: Booking[]
  off: { resource_id: string | null; starts_at: string; ends_at: string; reason: string | null }[]
  onEmpty: (date: string, time: string, resource?: string) => void; onOpen: (b: Booking) => void
}
function Grid({ s, from, days, columns, focus, bookings, off, onEmpty, onOpen }: GridProps) {
  const box = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ col: number; min: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])
  const resById = new Map(s.resources.map(r => [r.id, r]))
  const step = s.settings.slot_step_min || 15
  // visible hours: from the earliest opening to the latest closing (at least 8–20), plus bookings outside
  const allH = s.hours.map(h => [toMin(h.opens.slice(0, 5)), toMin(h.closes.slice(0, 5))])
  const bMin = bookings.map(b => [minOf(b.starts_at), Math.max(minOf(b.ends_at), minOf(b.starts_at) + 30)])
  const startMin = Math.max(0, Math.floor(Math.min(8 * 60, ...allH.map(x => x[0]), ...bMin.map(x => x[0])) / 60) * 60)
  const endMin = Math.min(24 * 60, Math.ceil(Math.max(20 * 60, ...allH.map(x => x[1]), ...bMin.map(x => x[1])) / 60) * 60)
  const height = (endMin - startMin) * PX
  const cols: { key: string; date: string; res: Resource | null; title: string; sub?: string; color?: string }[] = columns
    ? columns.map(r => ({ key: r.id, date: from, res: r, title: r.name, sub: r.title ?? (r.kind !== 'staff' && r.capacity > 1 ? `${r.capacity} os.` : KIND[r.kind].one), color: r.color }))
    : Array.from({ length: days }, (_, i) => { const d = addDays(from, i); return { key: d, date: d, res: focus ? resById.get(focus) ?? null : null, title: `${WD_SHORT[weekdayOf(d)]} ${Number(d.slice(8))}`, sub: dateLabel(d, { month: 'short' }) } })

  // scroll to ~1h before now/opening on first paint
  useEffect(() => {
    const el = box.current
    if (!el) return
    const target = (dayOf(new Date()) >= from && dayOf(new Date()) < addDays(from, days) ? minOf(new Date()) - 90 : (allH[0]?.[0] ?? 9 * 60) - 30) - startMin
    el.scrollTop = Math.max(0, target * PX)
  }, [from, days]) // eslint-disable-line react-hooks/exhaustive-deps

  const workRanges = (res: Resource | null, date: string): [number, number][] => {
    const wd = weekdayOf(date)
    const own = res ? s.hours.filter(h => h.resource_id === res.id) : []
    const rows = own.length ? own.filter(h => h.weekday === wd) : s.hours.filter(h => !h.resource_id && h.weekday === wd)
    return rows.map(h => [toMin(h.opens.slice(0, 5)), toMin(h.closes.slice(0, 5))] as [number, number]).sort((a, b) => a[0] - b[0])
  }
  const y = (m: number) => (m - startMin) * PX

  return (
    <div className="rc-cal" ref={box}>
      <div className="rc-cal__grid" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(${columns ? 150 : 110}px, 1fr))` }}>
        <div className="rc-cal__corner" />
        {cols.map(c => (
          <div key={c.key} className={`rc-cal__col-h ${c.date === today() && !columns ? 'is-today' : ''}`}>
            {c.color && <i className="dot" style={{ background: c.color }} />}
            <div style={{ minWidth: 0 }}><span>{c.title}</span>{c.sub && <small>{c.sub}</small>}</div>
          </div>
        ))}
        <div className="rc-cal__axis" style={{ height }}>
          {Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => <span key={i} style={{ top: i * 60 * PX }}>{i ? hhmm(startMin + i * 60) : ''}</span>)}
        </div>
        {cols.map((c, ci) => {
          const work = workRanges(c.res, c.date)
          const dayStart = at(c.date, 0).getTime(), dayEnd = at(addDays(c.date, 1), 0).getTime()
          const offBlocks: [number, number, string | null][] = []
          let cur = startMin
          for (const [o, cl] of work) { if (o > cur) offBlocks.push([cur, o, null]); cur = Math.max(cur, cl) }
          if (cur < endMin) offBlocks.push([cur, endMin, null])
          const away = off.filter(o => (o.resource_id === null || o.resource_id === c.res?.id) && Date.parse(o.starts_at) < dayEnd && Date.parse(o.ends_at) > dayStart)
            .map(o => [Math.max(startMin, Date.parse(o.starts_at) <= dayStart ? 0 : minOf(o.starts_at)), Math.min(endMin, Date.parse(o.ends_at) >= dayEnd ? 24 * 60 : minOf(o.ends_at)), o.reason] as [number, number, string | null])
          const list = bookings.filter(b => dayOf(b.starts_at) === c.date && (columns ? b.resource_id === c.res!.id : !focus || b.resource_id === focus))
          // side-by-side layout for overlapping events in week view (all resources in one column)
          const lanes: Booking[][] = []
          const laneOf = new Map<string, number>()
          for (const b of [...list].sort((a, b2) => a.starts_at.localeCompare(b2.starts_at))) {
            let li = lanes.findIndex(l => l.every(x => x.block_until <= b.starts_at || x.starts_at >= b.block_until))
            if (li < 0) { lanes.push([]); li = lanes.length - 1 }
            lanes[li].push(b); laneOf.set(b.id, li)
          }
          const isToday = c.date === dayOf(new Date(now))
          return (
            <div key={c.key} className={`rc-cal__col ${c.date < today() ? 'is-ro' : ''}`} style={{ height }}
              onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const m = startMin + Math.floor((e.clientY - r.top) / PX / step) * step; setHover({ col: ci, min: m }) }}
              onMouseLeave={() => setHover(null)}
              onClick={e => { if ((e.target as HTMLElement).closest('.rc-ev')) return; const r = e.currentTarget.getBoundingClientRect(); const m = startMin + Math.floor((e.clientY - r.top) / PX / step) * step; onEmpty(c.date, hhmm(m), c.res?.id) }}>
              {Array.from({ length: (endMin - startMin) / 30 }, (_, i) => <div key={i} className={`rc-cal__hour ${i % 2 ? 'is-half' : ''}`} style={{ top: i * 30 * PX }} />)}
              {offBlocks.map(([a, b], i) => <div key={i} className="rc-cal__off" style={{ top: y(a), height: (b - a) * PX }} />)}
              {away.map(([a, b, why], i) => <div key={`a${i}`} className="rc-cal__away" style={{ top: y(a), height: (b - a) * PX }}>{why || 'Nieobecność'}</div>)}
              {hover?.col === ci && !list.some(b => minOf(b.starts_at) <= hover.min && minOf(b.block_until) > hover.min) && <div className="rc-cal__ghost" style={{ top: y(hover.min), height: 30 * PX }}>+ {hhmm(hover.min)}</div>}
              {list.map(b => {
                const res = b.resource_id ? resById.get(b.resource_id) : null
                const top = y(minOf(b.starts_at)), h = Math.max(22, (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60000 * PX)
                const buf = (Date.parse(b.block_until) - Date.parse(b.ends_at)) / 60000 * PX
                const lane = laneOf.get(b.id) ?? 0, n = columns ? 1 : lanes.length
                return (
                  <button key={b.id} className={`rc-ev ${b.status === 'pending' ? 'is-pending' : ''} ${b.status === 'completed' || b.status === 'no_show' ? 'is-done' : ''} ${b.status === 'cancelled' ? 'is-cancelled' : ''}`}
                    style={{ top, height: h + buf, background: res?.color ?? '#6b665e', left: `calc(${(lane / n) * 100}% + 3px)`, right: `calc(${((n - lane - 1) / n) * 100}% + 3px)` }}
                    onClick={() => onOpen(b)} title={`${timeOf(b.starts_at)}–${timeOf(b.ends_at)} ${b.customer_name ?? ''} · ${b.service_name ?? ''}`}>
                    {(b.source === 'phone' || b.source === 'ai_test') && <span className="rc-ev__ai">{b.source === 'ai_test' ? 'TEST' : 'AI'}</span>}
                    <b>{timeOf(b.starts_at)} {b.customer_name || 'Klient'}</b>
                    {h > 34 && <span>{b.service_name}{b.party_size > 1 ? ` · ${b.party_size} os.` : ''}{!columns && res ? ` · ${res.name}` : ''}</span>}
                    {buf > 0 && <i className="rc-ev__buf" style={{ height: buf }} />}
                  </button>
                )
              })}
              {isToday && minOf(new Date(now)) >= startMin && minOf(new Date(now)) <= endMin && <div className="rc-nowline" style={{ top: y(minOf(new Date(now))) }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- create / edit
export function BookingModal({ setup, init, onClose, onSaved }: { setup: Setup; init: { date: string; time?: string; resource_id?: string; booking?: Booking; client?: Client } | null; onClose: () => void; onSaved: (b: Booking) => void }) {
  const { company } = usePanel()
  const toast = useToast()
  const editing = init?.booking
  const services = setup.services.filter(x => x.active || x.id === editing?.service_id)
  const [f, setF] = useState({ service_id: '', resource_id: '', date: today(), time: '', party: 1, notes: '', manual: false })
  const [client, setClient] = useState<Client | null>(null)
  const [newClient, setNewClient] = useState({ name: '', phone: '' })
  const [avail, setAvail] = useState<{ time: string; resources: string[] }[] | null>(null)
  const [closed, setClosed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!init) return
    const b = init.booking
    const res = init.resource_id ? setup.resources.find(r => r.id === init.resource_id) : null
    const svc = b?.service_id ?? (res ? services.find(x => performersOf(setup, x).some(p => p.id === res.id)) : services[0])?.id ?? ''
    setF({ service_id: typeof svc === 'string' ? svc : '', resource_id: b?.resource_id ?? init.resource_id ?? '', date: b ? dayOf(b.starts_at) : init.date, time: b ? timeOf(b.starts_at) : init.time ?? '', party: b?.party_size ?? 1, notes: b?.notes ?? '', manual: false })
    setClient(init.client ?? null)
    setNewClient({ name: b?.customer_name ?? '', phone: b?.customer_phone ? prettyPhone(b.customer_phone) : '' })
    if (b?.client_id && !init.client) void get<Client[]>(`rc_clients?id=eq.${b.client_id}&select=*`).then(r => setClient(r[0] ?? null)).catch(() => {})
  }, [init]) // eslint-disable-line react-hooks/exhaustive-deps
  const svc = services.find(x => x.id === f.service_id)
  const who = svc ? performersOf(setup, svc) : []
  useEffect(() => {
    if (!init || !svc) { setAvail(null); return }
    let alive = true
    setAvail(null)
    fetchSlots(company.id, { service_id: svc.id, date: f.date, party: f.party, resource_id: f.resource_id || undefined, exclude: editing?.id })
      .then(d => { if (alive) { setAvail(d[0]?.slots ?? []); setClosed(d[0]?.slots.length ? null : d[0]?.reason ?? null) } })
      .catch(() => alive && setAvail([]))
    return () => { alive = false }
  }, [init, company.id, f.service_id, f.date, f.party, f.resource_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!svc) return
    setBusy(true)
    try {
      let c = client
      if (!c && (newClient.name.trim() || newClient.phone.trim())) {
        const phone = normPhone(newClient.phone)
        if (newClient.phone.trim() && !phone) throw new Error('Nieprawidłowy numer telefonu.')
        const ex = phone ? await get<Client[]>(`rc_clients?company_id=eq.${company.id}&phone=eq.${phone}&select=*`) : []
        c = ex[0] ?? await insert<Client>('rc_clients', { company_id: company.id, name: newClient.name.trim() || null, phone, source: 'panel' })
        if (ex[0] && !ex[0].name && newClient.name.trim()) await update('rc_clients', `id=eq.${ex[0].id}`, { name: newClient.name.trim() })
      }
      const slot = avail?.find(a => a.time === f.time)
      let resource = f.resource_id || (slot ? pickLeast(setup, svc, slot.resources, f.party) : who[0]?.id) || null
      if (!f.resource_id && !slot && f.manual) resource = who[0]?.id ?? null
      const starts = at(f.date, toMin(f.time)), ends = new Date(starts.getTime() + svc.duration_min * 60000)
      const row = {
        company_id: company.id, service_id: svc.id, service_name: svc.name, resource_id: resource, client_id: c?.id ?? null, starts_at: starts.toISOString(), ends_at: ends.toISOString(),
        block_until: new Date(ends.getTime() + svc.buffer_min * 60000).toISOString(), party_size: f.party, notes: f.notes.trim() || null,
        customer_name: c?.name ?? (newClient.name.trim() || null), customer_phone: c?.phone ?? normPhone(newClient.phone), price: svc.price_from,
      }
      const b = editing ? (await update<Booking>('rc_bookings', `id=eq.${editing.id}`, row))[0] : await insert<Booking>('rc_bookings', { ...row, status: 'confirmed', source: 'panel' })
      toast(editing ? 'Zapisano zmiany' : 'Dodano rezerwację'); onSaved(b)
    } catch (e) {
      const m = errText(e)
      toast(/no_overlap|exclusion/i.test(m) ? 'Ten termin koliduje z inną rezerwacją tej osoby / zasobu.' : m, 'err')
    }
    setBusy(false)
  }
  const groups = avail ? [['Rano', 0, 12 * 60], ['Po południu', 12 * 60, 17 * 60], ['Wieczorem', 17 * 60, 24 * 60]].map(([l, a, b]) => [l, avail.filter(x => toMin(x.time) >= (a as number) && toMin(x.time) < (b as number))] as const).filter(g => g[1].length) : []
  const canSave = !!svc && !!f.time && (!!client || newClient.name.trim().length > 1) && (f.manual || !!avail?.some(a => a.time === f.time) || !!editing)
  return (
    <Modal open={!!init} onClose={onClose} wide title={editing ? 'Zmień rezerwację' : 'Nowa rezerwacja'} sub={svc ? `${minutesText(svc.duration_min)}${priceText(svc) ? ` · ${priceText(svc)}` : ''}` : undefined}
      footer={<><button className="btn btn--ghost btn--sm" onClick={onClose}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={busy || !canSave} onClick={save}>{busy ? 'Zapisuję…' : editing ? 'Zapisz' : 'Zarezerwuj'}</button></>}>
      <div className="ap-form ap-form--2">
        <Field label="Usługa" className="span-2"><select className="input" value={f.service_id} onChange={e => setF({ ...f, service_id: e.target.value, time: '' })}>{services.map(x => <option key={x.id} value={x.id}>{x.name} — {minutesText(x.duration_min)}</option>)}</select></Field>
        <Field label={svc ? KIND[svc.resource_kind].one : 'Kto'}><select className="input" value={f.resource_id} onChange={e => setF({ ...f, resource_id: e.target.value })}><option value="">Dowolny / automatycznie</option>{who.map(r => <option key={r.id} value={r.id}>{r.name}{r.kind !== 'staff' && r.capacity > 1 ? ` (${r.capacity} os.)` : ''}</option>)}</select></Field>
        <Field label="Dzień"><input className="input" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value, time: '' })} /></Field>
        {svc && svc.party_max > 1 && <Field label="Liczba osób"><input className="input" type="number" min={svc.party_min} max={svc.party_max} value={f.party} onChange={e => setF({ ...f, party: Math.max(1, Number(e.target.value) || 1), time: '' })} /></Field>}
      </div>
      <div className="ap-field">
        <span className="ap-row ap-row--between">Godzina <button type="button" className="ap-link" style={{ alignSelf: 'auto' }} onClick={() => setF({ ...f, manual: !f.manual })}>{f.manual ? 'Pokaż wolne terminy' : 'Wpisz dowolną godzinę'}</button></span>
        {f.manual ? <input className="input" type="time" step={300} value={f.time} onChange={e => setF({ ...f, time: e.target.value })} style={{ maxWidth: 160 }} />
          : !avail ? <div className="ap-row"><Spinner size={16} /><span className="ap-muted">Sprawdzam wolne terminy…</span></div>
          : !avail.length ? <p className="ap-muted">{closed ?? 'Brak wolnych terminów'} — wybierz inny dzień{f.resource_id ? ' albo inną osobę' : ''}.</p>
          : groups.map(([l, list]) => <div key={l}><div className="rc-slots-group">{l}</div><div className="rc-slots">{list.map(a => <button key={a.time} type="button" className={`rc-slot ${f.time === a.time ? 'is-on' : ''}`} onClick={() => setF({ ...f, time: a.time })}>{a.time}</button>)}</div></div>)}
        {editing && !f.manual && f.time && !avail?.some(a => a.time === f.time) && <small>Obecna godzina: {f.time}</small>}
      </div>
      <ClientPicker value={client} onChange={setClient} draft={newClient} onDraft={setNewClient} />
      <Field label="Uwagi (widzi zespół)"><textarea className="input" rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="np. pierwsza wizyta, alergia, okazja" /></Field>
    </Modal>
  )
}
function pickLeast(s: Setup, svc: Service, ids: string[], party: number) {
  if (svc.party_max > 1) return [...ids].map(id => s.resources.find(r => r.id === id)!).filter(Boolean).sort((a, b) => a.capacity - b.capacity)[0]?.id ?? ids[0]
  void party
  return ids[0]
}

export function ClientPicker({ value, onChange, draft, onDraft }: { value: Client | null; onChange: (c: Client | null) => void; draft: { name: string; phone: string }; onDraft: (d: { name: string; phone: string }) => void }) {
  const { company } = usePanel()
  const [hits, setHits] = useState<Client[]>([])
  const [focus, setFocus] = useState(false)
  const term = draft.name.trim() || draft.phone.replace(/\D/g, '')
  useEffect(() => {
    if (value || term.length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      const digits = draft.phone.replace(/\D/g, '')
      const flt = digits.length >= 3 ? `phone=ilike.*${digits}*` : `name=ilike.*${encodeURIComponent(draft.name.trim())}*`
      setHits(await get<Client[]>(`rc_clients?company_id=eq.${company.id}&${flt}&select=*&limit=6`).catch(() => []))
    }, 220)
    return () => clearTimeout(t)
  }, [term, value, company.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (value) return (
    <div className="ap-field"><span>Klient</span>
      <div className="rc-chosen"><Ic.users width={18} height={18} /><div><b>{value.name || 'Bez imienia'}</b><small>{prettyPhone(value.phone) || value.email || '—'}</small></div><button className="ap-icon-btn" onClick={() => onChange(null)} aria-label="Zmień klienta"><Ic.close width={15} height={15} /></button></div>
    </div>
  )
  return (
    <div className="rc-client-pick" onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}>
      <div className="ap-form ap-form--2">
        <Field label="Klient — imię"><input className="input" value={draft.name} onChange={e => onDraft({ ...draft, name: e.target.value })} placeholder="Wpisz, aby wyszukać lub dodać" /></Field>
        <Field label="Telefon"><input className="input" inputMode="tel" value={draft.phone} onChange={e => onDraft({ ...draft, phone: e.target.value })} placeholder="600 123 456" /></Field>
      </div>
      {focus && hits.length > 0 && (
        <div className="rc-client-pop">{hits.map(c => <button key={c.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(c); setHits([]) }}><Ic.users width={15} height={15} />{c.name || 'Bez imienia'}<small>{prettyPhone(c.phone)}</small></button>)}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- detail
export function BookingDetail({ setup, booking, onClose, onChanged }: { setup: Setup; booking: Booking | null; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const { company, canManage, href } = usePanel()
  const toast = useToast(), confirm = useConfirm()
  const [b, setB] = useState<Booking | null>(booking)
  const [edit, setEdit] = useState(false)
  const [loyal, setLoyal] = useState<{ code: string; stamps: number; required: number } | null>(null)
  const [note, setNote] = useState('')
  useEffect(() => { setB(booking); setNote(booking?.internal_note ?? ''); setLoyal(null)
    if (booking?.customer_phone) void get<{ code: string; stamps: number; program: { stamps_required: number } }[]>(`loyalty_cards?company_id=eq.${company.id}&phone=eq.${booking.customer_phone}&status=eq.active&select=code,stamps,program:loyalty_programs(stamps_required)&limit=1`).then(r => r[0] && setLoyal({ code: r[0].code, stamps: r[0].stamps, required: r[0].program.stamps_required })).catch(() => {})
  }, [booking, company.id])
  if (!b) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const res = setup.resources.find(r => r.id === b.resource_id)
  const setStatus = async (status: BookingStatus, extra: Record<string, unknown> = {}) => {
    try { const [x] = await update<Booking>('rc_bookings', `id=eq.${b.id}`, { status, ...extra }); setB(x); toast('Zapisano'); await onChanged() } catch (e) { toast(errText(e), 'err') }
  }
  const past = Date.parse(b.starts_at) < Date.now()
  return (
    <>
      <Modal open={!edit} onClose={onClose} title={<span className="ap-row">{b.customer_name || 'Klient'} <Badge tone={STATUS_LABEL[b.status].tone}>{STATUS_LABEL[b.status].label}</Badge></span>}
        sub={`${dateLabel(dayOf(b.starts_at))}, ${timeOf(b.starts_at)}–${timeOf(b.ends_at)}`}
        footer={<>
          {canManage && <button className="btn btn--ghost btn--sm" style={{ color: '#b1321f', marginRight: 'auto' }} onClick={async () => { if (await confirm({ title: 'Usunąć rezerwację na zawsze?', text: 'Zwykle lepiej ją odwołać — zostaje ślad w historii klienta.', ok: 'Usuń', danger: true })) { await remove('rc_bookings', `id=eq.${b.id}`).catch(e => toast(errText(e), 'err')); await onChanged(); onClose() } }}><Ic.trash width={14} height={14} /></button>}
          {['pending', 'confirmed'].includes(b.status) && <button className="btn btn--ghost btn--sm" onClick={async () => { if (await confirm({ title: 'Odwołać wizytę?', text: 'Termin zwolni się w kalendarzu i asystent będzie mógł go zaproponować innym.', ok: 'Odwołaj', danger: true })) await setStatus('cancelled', { cancelled_at: new Date().toISOString(), cancel_reason: 'Odwołano w panelu' }) }}>Odwołaj</button>}
          {['pending', 'confirmed'].includes(b.status) && <button className="btn btn--ghost btn--sm" onClick={() => setEdit(true)}><Ic.edit width={14} height={14} /> Przełóż</button>}
          {b.status === 'pending' && <button className="btn btn--primary btn--sm" onClick={() => setStatus('confirmed')}><Ic.check width={14} height={14} /> Potwierdź</button>}
          {b.status === 'confirmed' && past && <><button className="btn btn--ghost btn--sm" onClick={() => setStatus('no_show')}>Nie przyszedł</button><button className="btn btn--primary btn--sm" onClick={() => setStatus('completed')}><Ic.check width={14} height={14} /> Zrealizowana</button></>}
          {['cancelled', 'no_show', 'completed'].includes(b.status) && <button className="btn btn--ghost btn--sm" onClick={() => setStatus('confirmed', { cancelled_at: null, cancel_reason: null })}>Przywróć</button>}
        </>}>
        <dl className="ap-kv">
          <dt>Usługa</dt><dd>{b.service_name ?? '—'}{b.party_size > 1 ? ` · ${b.party_size} os.` : ''}</dd>
          <dt>{res ? KIND[res.kind].one : 'Kto'}</dt><dd>{res ? <span className="ap-row" style={{ gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: '50%', background: res.color, display: 'inline-block' }} />{res.name}</span> : '—'}</dd>
          <dt>Telefon</dt><dd>{b.customer_phone ? <a href={`tel:+${b.customer_phone}`} className="ap-mono">{prettyPhone(b.customer_phone)}</a> : '—'}</dd>
          <dt>Źródło</dt><dd><Badge tone={b.source === 'phone' ? 'brand' : 'neutral'}>{SOURCE_LABEL[b.source] ?? b.source}</Badge>{b.call_id && <> · <Link to={href('rozmowy', { c: b.call_id })}>rozmowa z AI</Link></>}</dd>
          {b.price != null && <><dt>Cena</dt><dd>{Number(b.price).toLocaleString('pl-PL')} zł</dd></>}
          {b.notes && <><dt>Uwagi klienta</dt><dd>{b.notes}</dd></>}
          {b.cancel_reason && <><dt>Odwołanie</dt><dd>{b.cancel_reason}</dd></>}
          {b.client_id && <><dt>Klient</dt><dd><Link to={href('klienci', { id: b.client_id })}>Karta klienta →</Link></dd></>}
        </dl>
        {loyal && <div className="ap-note" style={{ alignItems: 'center' }}><Ic.card width={18} height={18} /><span>Karta lojalnościowa: <b>{loyal.stamps % loyal.required}/{loyal.required}</b> pieczątek{loyal.stamps >= loyal.required ? ' — nagroda do odebrania!' : ''}</span><Link className="btn btn--primary btn--sm" to={href('skaner', { c: loyal.code })}>Pieczątka</Link></div>}
        <Field label="Notatka wewnętrzna"><textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== (b.internal_note ?? '') && update('rc_bookings', `id=eq.${b.id}`, { internal_note: note || null }).then(() => onChanged()).catch(e => toast(errText(e), 'err'))} placeholder="Widoczna tylko dla zespołu" /></Field>
      </Modal>
      <BookingModal setup={setup} init={edit ? { date: dayOf(b.starts_at), booking: b } : null} onClose={() => setEdit(false)} onSaved={async x => { setEdit(false); setB(x); await onChanged() }} />
    </>
  )
}
