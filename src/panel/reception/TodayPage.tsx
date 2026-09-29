import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { get } from '../../app/api'
import { Badge, Empty, Ic, Kpi, Loading, PageHead, Panel, fmtAgo } from '../../app/ui'
import { usePanel } from '../PanelApp'
import { BookingDetail, BookingModal } from './CalendarPage'
import { CallRow } from './CallsPage'
import { STATUS_LABEL, addDays, at, dateLabel, loadSetup, minOf, prettyPhone, reception, status as fetchStatus, timeOf, today, type Booking, type Call, type Setup, type Status } from './model'
import './reception.css'

export function TodayPage() {
  const { company, href, access } = usePanel()
  const nav = useNavigate()
  const [s, setS] = useState<Setup | null>(null)
  const [st, setSt] = useState<Status | null>(null)
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [newFromPhone, setNewFromPhone] = useState(0)
  const [testCalls, setTestCalls] = useState(0)
  const [open, setOpen] = useState<Booking | null>(null)
  const [create, setCreate] = useState(false)
  const d = today()
  const load = useCallback(async () => {
    const a = at(d, 0).toISOString(), b = at(addDays(d, 1), 0).toISOString(), day = new Date(Date.now() - 86400000).toISOString()
    const [bk, cl, fresh, tests] = await Promise.all([
      get<Booking[]>(`rc_bookings?company_id=eq.${company.id}&starts_at=gte.${a}&starts_at=lt.${b}&status=neq.cancelled&select=*&order=starts_at.asc`).catch(() => []),
      get<Call[]>(`rc_calls?company_id=eq.${company.id}&or=(started_at.gte."${a}",and(needs_callback.eq.true,handled_at.is.null))&select=id,conversation_id,channel,caller_phone,client_id,started_at,duration_s,status,title,summary,outcome,customer_name,has_audio,needs_callback,callback_note,handled_at&order=started_at.desc&limit=60`).catch(() => []),
      get<{ id: string }[]>(`rc_bookings?company_id=eq.${company.id}&source=eq.phone&created_at=gte.${day}&select=id`).catch(() => []),
      get<{ id: string }[]>(`rc_calls?company_id=eq.${company.id}&channel=eq.test&select=id&limit=1`).catch(() => []),
    ])
    setBookings(bk); setCalls(cl); setNewFromPhone(fresh.length); setTestCalls(tests.length)
  }, [company.id, d])
  useEffect(() => { void loadSetup(company.id).then(setS); void fetchStatus(company.id).then(setSt).catch(() => {}); void load() }, [company.id, load])
  useEffect(() => { void reception('calls_pull', { company_id: company.id }).then(load).catch(() => {}) }, [company.id, load])
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30000); return () => clearInterval(t) }, [load])

  const callback = calls.filter(c => c.needs_callback && !c.handled_at)
  const todayCalls = calls.filter(c => c.started_at >= at(d, 0).toISOString() && c.channel === 'phone')
  const now = minOf(new Date())
  const resById = useMemo(() => new Map((s?.resources ?? []).map(r => [r.id, r])), [s])
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Dzień dobry' : hour < 18 ? 'Cześć' : 'Dobry wieczór'
  if (!s || !bookings) return <Loading />

  const steps = [
    { done: s.hours.some(h => !h.resource_id), title: 'Godziny otwarcia', text: 'Kiedy firma przyjmuje klientów', to: href('uslugi', { v: 'godziny' }) },
    { done: s.resources.some(r => r.active), title: 'Zespół, stoliki lub sale', text: 'Kogo lub co rezerwujemy', to: href('uslugi', { v: 'zasoby' }) },
    { done: s.services.some(x => x.active), title: 'Usługi z czasem i ceną', text: 'Co można zarezerwować', to: href('uslugi') },
    { done: !!s.settings.voice_id || s.hasSettings, title: 'Głos i powitanie asystenta', text: 'Jak brzmi Twoja recepcja', to: href('asystent', { v: 'glos' }) },
    { done: testCalls > 0, title: 'Rozmowa testowa', text: 'Zadzwoń do asystenta z przeglądarki', to: href('asystent') },
    { done: !!st && !st.test_mode, title: 'Numer telefonu', text: 'Przydziela zespół TableFlow', to: href('asystent') },
  ]
  const doneN = steps.filter(x => x.done).length
  const active = bookings.filter(b => b.status !== 'cancelled')

  return (
    <>
      <PageHead title={`${hello}${access.name ? `, ${access.name.split(' ')[0]}` : ''}`} sub={`${dateLabel(d)} · ${company.name}`}
        actions={<><Link className="btn btn--ghost btn--sm" to={href('kalendarz')}><Ic.calendar width={15} height={15} /> Kalendarz</Link><button className="btn btn--primary btn--sm" onClick={() => setCreate(true)} disabled={!s.services.length}><Ic.plus width={15} height={15} /> Rezerwacja</button></>} />

      {doneN < steps.length && (
        <Panel title="Uruchom recepcję AI" sub={`${doneN} z ${steps.length} kroków — asystent zacznie zapisywać klientów, gdy uzupełnisz ofertę i grafik.`} className="rc-setup" >
          <div className="rc-progress"><i className="g" style={{ width: `${(doneN / steps.length) * 100}%` }} /></div>
          <div className="rc-steps">{steps.map((x, i) => (
            <button key={x.title} className={`rc-step ${x.done ? 'is-done' : ''}`} onClick={() => nav(x.to)}>
              <span className="rc-step__n">{x.done ? <Ic.check width={14} height={14} /> : i + 1}</span>
              <div><b>{x.title}</b><small>{x.text}</small></div>
              <Ic.chevronR width={16} height={16} />
            </button>
          ))}</div>
        </Panel>
      )}

      <div className="ap-kpis" style={{ margin: doneN < steps.length ? '20px 0' : '0 0 20px' }}>
        <Kpi label="Wizyty dziś" value={active.length} hint={active.length ? `następna ${active.find(b => minOf(b.starts_at) >= now) ? timeOf(active.find(b => minOf(b.starts_at) >= now)!.starts_at) : '—'}` : 'brak'} />
        <Kpi label="Rozmowy AI dziś" value={todayCalls.length} hint={todayCalls.length ? `${todayCalls.filter(c => c.outcome === 'booked').length} z rezerwacją` : st?.test_mode ? 'tryb testowy' : 'czekamy na telefony'} />
        <Kpi label="Rezerwacje z telefonu (24 h)" value={newFromPhone} tone="brand" />
        <Kpi label="Do oddzwonienia" value={callback.length} hint={callback.length ? 'zobacz niżej' : 'wszystko załatwione'} />
      </div>

      <div className="ap-grid ap-grid--main">
        <Panel title="Plan dnia" sub={active.length ? `${active.length} ${active.length === 1 ? 'wizyta' : active.length < 5 ? 'wizyty' : 'wizyt'}` : undefined} actions={<Link className="btn btn--ghost btn--xs" to={href('kalendarz')}>Otwórz kalendarz</Link>}>
          {!active.length ? <Empty icon={<Ic.calendar width={22} height={22} />} title="Dziś nic nie zaplanowano" text={s.services.length ? 'Nowe rezerwacje z telefonu pojawią się tu automatycznie.' : 'Najpierw dodaj usługi i grafik.'} /> : (
            <div className="rc-agenda">
              {active.map((b, i) => {
                const r = b.resource_id ? resById.get(b.resource_id) : null
                const showNow = minOf(b.starts_at) >= now && (i === 0 || minOf(active[i - 1].starts_at) < now)
                return (
                  <div key={b.id}>
                    {showNow && <div className="rc-now">teraz {timeOf(new Date())}</div>}
                    <button className={`rc-agenda__row ${minOf(b.ends_at) < now ? 'is-past' : ''}`} onClick={() => setOpen(b)}>
                      <span className="rc-agenda__t">{timeOf(b.starts_at)}<small>{timeOf(b.ends_at)}</small></span>
                      <i className="rc-agenda__bar" style={{ background: r?.color ?? '#a39f97' }} />
                      <div><b>{b.customer_name || 'Klient'}{b.party_size > 1 ? ` · ${b.party_size} os.` : ''}</b><small>{b.service_name}{r ? ` · ${r.name}` : ''}{b.customer_phone ? ` · ${prettyPhone(b.customer_phone)}` : ''}</small></div>
                      <span className="ap-row" style={{ gap: 6 }}>{b.source === 'phone' && <Badge tone="brand">AI</Badge>}{b.source === 'ai_test' && <Badge>TEST</Badge>}{b.status !== 'confirmed' && <Badge tone={STATUS_LABEL[b.status].tone}>{STATUS_LABEL[b.status].label}</Badge>}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
        <div className="ap-stack">
          <div className="rc-live mesh g">
            <span className="mesh__b" /><span className="mesh__g" />
            <div className="rc-live__top">
              <span className={`rc-live__pill ${!st || st.test_mode ? 'is-test' : ''}`}><i />{!st ? '…' : !st.platform_ok ? 'W konfiguracji' : st.test_mode ? 'Tryb testowy' : 'Odbiera telefony'}</span>
            </div>
            <h3>{s.settings.assistant_name} — Twoja recepcja AI</h3>
            <p>{st && !st.test_mode ? `Klienci dzwonią na ${st.numbers.filter(n => n.el_phone_id).map(n => prettyPhone(n.phone_number)).join(', ')}.` : 'Numer telefonu jeszcze nie jest podłączony — porozmawiaj z asystentem przez przeglądarkę i sprawdź, jak zapisuje klientów.'}</p>
            <Link className="btn btn--sm" style={{ background: '#fff', color: '#1a1916' }} to={href('asystent')}><Ic.mic width={15} height={15} /> {st?.test_mode ? 'Rozmowa testowa' : 'Ustawienia asystenta'}</Link>
          </div>
          <Panel title="Do oddzwonienia" sub={callback.length ? 'Sprawy, których asystent nie mógł załatwić.' : undefined} actions={callback.length > 0 && <Link className="btn btn--ghost btn--xs" to={href('rozmowy', { f: 'callback' })}>Wszystkie</Link>}>
            {!callback.length ? <p className="ap-muted">Nikt nie czeka. 👌</p> : <div className="rc-list">{callback.slice(0, 5).map(c => <CallRow key={c.id} c={c} onClick={() => nav(href('rozmowy', { f: 'callback', c: c.id }))} />)}</div>}
          </Panel>
          <Panel title="Ostatnie rozmowy" actions={<Link className="btn btn--ghost btn--xs" to={href('rozmowy')}>Wszystkie</Link>}>
            {!todayCalls.length ? <p className="ap-muted">Dziś jeszcze nikt nie dzwonił.{calls[0] ? ` Ostatnia rozmowa ${fmtAgo(calls[0].started_at)}.` : ''}</p> : <div className="rc-list">{todayCalls.slice(0, 5).map(c => <CallRow key={c.id} c={c} onClick={() => nav(href('rozmowy', { c: c.id }))} />)}</div>}
          </Panel>
        </div>
      </div>
      <BookingDetail setup={s} booking={open} onClose={() => setOpen(null)} onChanged={load} />
      <BookingModal setup={s} init={create ? { date: d } : null} onClose={() => setCreate(false)} onSaved={async () => { setCreate(false); await load() }} />
    </>
  )
}
