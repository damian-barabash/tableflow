import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { errText, get, insert, remove, rpc, update, upsert } from '../../app/api'
import { Badge, Empty, Field, Ic, Loading, Modal, PageHead, Panel, Tabs, Toggle, useConfirm, useToast } from '../../app/ui'
import { usePanel } from '../PanelApp'
import {
  COLORS, KIND, TEMPLATES, WEEKDAYS, addDays, at, dateLabel, loadSetup, minutesText, performersOf, priceText, today,
  type HoursRow, type Resource, type ResourceKind, type Service, type Setup, type Template, type TimeOff,
} from './model'
import './reception.css'

type View = 'uslugi' | 'zasoby' | 'godziny'

export function SetupPage() {
  const { company, canManage, href } = usePanel()
  const loc = useLocation(), nav = useNavigate()
  const view = (new URLSearchParams(loc.search).get('v') as View) || 'uslugi'
  const [s, setS] = useState<Setup | null>(null)
  const load = useCallback(async () => setS(await loadSetup(company.id)), [company.id])
  useEffect(() => { void load() }, [load])
  if (!s) return <Loading />
  const empty = !s.services.length && !s.resources.length
  return (
    <>
      <PageHead title="Usługi i grafik" sub="Wszystko, co asystent AI i kalendarz wiedzą o Twojej ofercie: usługi z czasem trwania, zespół lub stoliki, godziny pracy i dni wolne." />
      {empty && canManage && <Templates onDone={load} />}
      <Tabs value={view} onChange={v => nav(href('uslugi', { v }))} tabs={[
        { v: 'uslugi', label: `Usługi${s.services.length ? ` · ${s.services.length}` : ''}` },
        { v: 'zasoby', label: `Zespół i zasoby${s.resources.length ? ` · ${s.resources.length}` : ''}` },
        { v: 'godziny', label: 'Godziny i dni wolne' },
      ]} />
      {view === 'uslugi' && <Services s={s} reload={load} />}
      {view === 'zasoby' && <Resources s={s} reload={load} />}
      {view === 'godziny' && <BusinessHours s={s} reload={load} />}
    </>
  )
}

// ================================================================ templates
function Templates({ onDone }: { onDone: () => void }) {
  const { company } = usePanel()
  const toast = useToast(), confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const apply = async (t: Template) => {
    if (!await confirm({ title: `Szablon: ${t.label}`, text: 'Dodamy przykładowe usługi, zasoby i godziny otwarcia. Potem zmienisz nazwy, ceny i czasy na swoje.', ok: 'Użyj szablonu' })) return
    setBusy(t.id)
    try {
      await upsert('rc_settings', { company_id: company.id }, 'company_id').catch(() => {})
      await insert('rc_resources', t.resources.map((r, i) => ({ company_id: company.id, kind: r.kind, name: r.name, title: r.title ?? null, capacity: r.capacity ?? 1, min_capacity: r.min_capacity ?? 1, color: COLORS[i % COLORS.length], sort: i })))
      await insert('rc_services', t.services.map((x, i) => ({ company_id: company.id, name: x.name, category: x.category ?? null, duration_min: x.duration_min, buffer_min: x.buffer_min ?? 0, price_from: x.price_from ?? null, price_to: x.price_to ?? null, resource_kind: x.resource_kind, party_min: x.party_min ?? 1, party_max: x.party_max ?? 1, min_notice_min: x.min_notice_min ?? null, description: x.description ?? null, sort: i })))
      await remove('rc_hours', `company_id=eq.${company.id}&resource_id=is.null`)
      await insert('rc_hours', t.hours.map(([weekday, opens, closes]) => ({ company_id: company.id, resource_id: null, weekday, opens, closes })))
      toast('Dodano szablon — dopasuj go do siebie'); onDone()
    } catch (e) { toast(errText(e), 'err') }
    setBusy(null)
  }
  return (
    <Panel title="Zacznij od szablonu branży" sub="Jeden klik i masz gotową strukturę. Każdy biznes działa tak samo: rezerwujemy osobę, stolik, salę albo ekipę na usługę, która trwa określony czas." className="rc-tpl-panel">
      <div className="rc-tpls">{TEMPLATES.map(t => (
        <button key={t.id} className="rc-tpl" onClick={() => apply(t)} disabled={!!busy}>
          <span className="rc-tpl__e">{t.emoji}</span><div><b>{t.label}</b><small>{busy === t.id ? 'Dodaję…' : t.hint}</small></div>
        </button>
      ))}</div>
    </Panel>
  )
}

// ================================================================ services
function Services({ s, reload }: { s: Setup; reload: () => Promise<void> }) {
  const { canManage } = usePanel()
  const [edit, setEdit] = useState<Partial<Service> | null>(null)
  const cats = [...new Set(s.services.map(x => x.category || 'Usługi'))]
  return (
    <>
      <div className="ap-row ap-row--between" style={{ marginBottom: 14 }}>
        <p className="ap-muted">Czas trwania i przerwa po usłudze decydują o wolnych terminach. Ceny i opisy asystent podaje klientom przez telefon.</p>
        {canManage && <button className="btn btn--primary btn--sm" onClick={() => setEdit({})}><Ic.plus width={15} height={15} /> Nowa usługa</button>}
      </div>
      {!s.services.length ? <Panel><Empty icon={<Ic.list width={22} height={22} />} title="Brak usług" text="Dodaj usługi, które klienci mogą zarezerwować — np. strzyżenie 45 min, stolik na 2 godziny, catering dla 50 osób." action={canManage && <button className="btn btn--primary btn--sm" onClick={() => setEdit({})}>Dodaj usługę</button>} /></Panel> : cats.map(c => (
        <div key={c}>
          <div className="rc-cat">{c}</div>
          <div className="rc-cards">{s.services.filter(x => (x.category || 'Usługi') === c).map(x => {
            const who = performersOf(s, x)
            return (
              <button key={x.id} className={`rc-card ${x.active ? '' : 'is-off'}`} onClick={() => canManage && setEdit(x)} style={{ cursor: canManage ? 'pointer' : 'default' }}>
                <b>{x.name}</b>
                <small>{minutesText(x.duration_min)}{x.buffer_min ? ` + ${x.buffer_min} min przerwy` : ''}{priceText(x) ? ` · ${priceText(x)}` : ''}</small>
                <div className="rc-card__meta">
                  <Badge>{KIND[x.resource_kind].icon} {who.length ? who.length <= 3 ? who.map(r => r.name).join(', ') : `${who.length} × ${KIND[x.resource_kind].one.toLowerCase()}` : 'nikt nie przypisany'}</Badge>
                  {x.party_max > 1 && <Badge tone="brand">{x.party_min}–{x.party_max} os.</Badge>}
                  {!x.ai_bookable && <Badge tone="warn">bez AI</Badge>}
                  {!x.active && <Badge>ukryta</Badge>}
                </div>
              </button>
            )
          })}</div>
        </div>
      ))}
      <ServiceModal s={s} init={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload() }} />
    </>
  )
}

const DURATIONS = [10, 15, 20, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360, 480, 600, 720]
function ServiceModal({ s, init, onClose, onSaved }: { s: Setup; init: Partial<Service> | null; onClose: () => void; onSaved: () => void }) {
  const { company } = usePanel()
  const toast = useToast(), confirm = useConfirm()
  const blank: Partial<Service> = { name: '', category: '', description: '', duration_min: 60, buffer_min: 0, price_from: null, price_to: null, price_note: '', resource_kind: s.resources[0]?.kind ?? 'staff', party_min: 1, party_max: 1, min_notice_min: null, ai_bookable: true, active: true }
  const [f, setF] = useState<Partial<Service>>(blank)
  const [who, setWho] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!init) return
    setF({ ...blank, ...init })
    setWho(init.id ? s.links.filter(l => l.service_id === init.id).map(l => l.resource_id) : [])
  }, [init]) // eslint-disable-line react-hooks/exhaustive-deps
  const kindRes = s.resources.filter(r => r.kind === f.resource_kind)
  const group = (f.party_max ?? 1) > 1
  const cats = [...new Set(s.services.map(x => x.category).filter(Boolean))] as string[]
  const save = async () => {
    setBusy(true)
    try {
      const row = {
        company_id: company.id, name: f.name!.trim(), category: f.category?.trim() || null, description: f.description?.trim() || null, duration_min: Number(f.duration_min), buffer_min: Number(f.buffer_min) || 0,
        price_from: f.price_from === null || f.price_from === undefined || String(f.price_from) === '' ? null : Number(f.price_from), price_to: f.price_to === null || f.price_to === undefined || String(f.price_to) === '' ? null : Number(f.price_to),
        price_note: f.price_note?.trim() || null, resource_kind: f.resource_kind, party_min: Number(f.party_min) || 1, party_max: Math.max(Number(f.party_min) || 1, Number(f.party_max) || 1),
        min_notice_min: f.min_notice_min === null || f.min_notice_min === undefined || String(f.min_notice_min) === '' ? null : Number(f.min_notice_min), ai_bookable: !!f.ai_bookable, active: !!f.active,
      }
      const id = init?.id ? (await update<Service>('rc_services', `id=eq.${init.id}`, row))[0].id : (await insert<Service>('rc_services', { ...row, sort: s.services.length })).id
      await remove('rc_service_resources', `service_id=eq.${id}`)
      const keep = who.filter(r => kindRes.some(k => k.id === r))
      if (keep.length) await insert('rc_service_resources', keep.map(resource_id => ({ service_id: id, resource_id, company_id: company.id })))
      toast('Zapisano usługę'); onSaved()
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  const del = async () => {
    if (!init?.id || !await confirm({ title: 'Usunąć usługę?', text: 'Istniejące rezerwacje zostaną w kalendarzu (bez powiązania z usługą). Zamiast usuwać możesz ją ukryć.', ok: 'Usuń', danger: true })) return
    try { await remove('rc_services', `id=eq.${init.id}`); toast('Usunięto'); onSaved() } catch (e) { toast(errText(e), 'err') }
  }
  return (
    <Modal open={!!init} onClose={onClose} wide title={init?.id ? 'Edytuj usługę' : 'Nowa usługa'}
      footer={<>{init?.id && <button className="btn btn--ghost btn--sm" style={{ color: '#b1321f', marginRight: 'auto' }} onClick={del}><Ic.trash width={14} height={14} /> Usuń</button>}<button className="btn btn--ghost btn--sm" onClick={onClose}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={busy || !f.name?.trim()} onClick={save}>{busy ? 'Zapisuję…' : 'Zapisz'}</button></>}>
      <div className="ap-form ap-form--2">
        <Field label="Nazwa usługi" className="span-2"><input className="input" value={f.name ?? ''} onChange={e => setF({ ...f, name: e.target.value })} placeholder="np. Strzyżenie męskie, Rezerwacja stolika" autoFocus /></Field>
        <Field label="Kategoria" hint="Grupuje usługi w ofercie."><input className="input" list="rc-cats" value={f.category ?? ''} onChange={e => setF({ ...f, category: e.target.value })} placeholder="np. Włosy" /><datalist id="rc-cats">{cats.map(c => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Kto lub co realizuje">
          <select className="input" value={f.resource_kind} onChange={e => setF({ ...f, resource_kind: e.target.value as ResourceKind })}>{(Object.keys(KIND) as ResourceKind[]).map(k => <option key={k} value={k}>{KIND[k].one}</option>)}</select>
        </Field>
        <Field label="Czas trwania"><select className="input" value={f.duration_min} onChange={e => setF({ ...f, duration_min: Number(e.target.value) })}>{[...new Set([...DURATIONS, Number(f.duration_min)])].sort((a, b) => a - b).map(d => <option key={d} value={d}>{minutesText(d)}</option>)}</select></Field>
        <Field label="Przerwa po usłudze" hint="Sprzątanie, przygotowanie — blokuje kalendarz, klient jej nie widzi."><select className="input" value={f.buffer_min} onChange={e => setF({ ...f, buffer_min: Number(e.target.value) })}>{[0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180].map(d => <option key={d} value={d}>{d ? minutesText(d) : 'bez przerwy'}</option>)}</select></Field>
        <Field label="Cena od (zł)"><input className="input" type="number" min={0} value={f.price_from ?? ''} onChange={e => setF({ ...f, price_from: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
        <Field label="Cena do (zł)" hint="Zostaw puste przy stałej cenie."><input className="input" type="number" min={0} value={f.price_to ?? ''} onChange={e => setF({ ...f, price_to: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
        <Field label="Uwagi do ceny" className="span-2"><input className="input" value={f.price_note ?? ''} onChange={e => setF({ ...f, price_note: e.target.value })} placeholder="np. za osobę, zależnie od długości włosów" /></Field>
        <Field label="Opis dla asystenta" className="span-2" hint="Co obejmuje, dla kogo, jak się przygotować — AI użyje tego, gdy klient zapyta."><textarea className="input" rows={2} value={f.description ?? ''} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <div className="span-2"><Toggle checked={group} onChange={v => setF({ ...f, party_min: 1, party_max: v ? Math.max(2, kindRes.reduce((m, r) => Math.max(m, r.capacity), 2)) : 1 })} label="Rezerwacja dla kilku osób" hint="Stolik, catering, zajęcia grupowe — asystent zapyta o liczbę osób i dobierze pasujący zasób (np. stolik z odpowiednią liczbą miejsc)." /></div>
        {group && <><Field label="Min. osób"><input className="input" type="number" min={1} value={f.party_min} onChange={e => setF({ ...f, party_min: Number(e.target.value) })} /></Field><Field label="Maks. osób"><input className="input" type="number" min={1} value={f.party_max} onChange={e => setF({ ...f, party_max: Number(e.target.value) })} /></Field></>}
        <Field label="Minimalne wyprzedzenie" hint="Pusta = jak w zasadach asystenta."><select className="input" value={f.min_notice_min ?? ''} onChange={e => setF({ ...f, min_notice_min: e.target.value === '' ? null : Number(e.target.value) })}><option value="">domyślne</option>{[0, 30, 60, 120, 240, 720, 1440, 2880, 4320, 10080, 20160].map(m => <option key={m} value={m}>{m === 0 ? 'bez wyprzedzenia' : m < 1440 ? minutesText(m) : `${m / 1440} ${m === 1440 ? 'dzień' : 'dni'}`}</option>)}</select></Field>
        <div className="span-2 ap-field"><span>{KIND[f.resource_kind as ResourceKind].many} — kto wykonuje</span>
          {!kindRes.length ? <p className="ap-muted">Nie masz jeszcze zasobów typu „{KIND[f.resource_kind as ResourceKind].one.toLowerCase()}” — dodaj je w zakładce Zespół i zasoby.</p> : (
            <div className="rc-checks">{kindRes.map(r => <label key={r.id} className={`rc-check ${who.includes(r.id) ? 'is-on' : ''}`}><input type="checkbox" checked={who.includes(r.id)} onChange={e => setWho(e.target.checked ? [...who, r.id] : who.filter(x => x !== r.id))} />{r.name}</label>)}</div>
          )}
          <small>Nic nie zaznaczone = każdy z listy może wykonać tę usługę.</small>
        </div>
        <Toggle checked={!!f.ai_bookable} onChange={v => setF({ ...f, ai_bookable: v })} label="Rezerwacja przez asystenta AI" hint="Wyłącz, jeśli tę usługę umawia tylko człowiek." />
        <Toggle checked={!!f.active} onChange={v => setF({ ...f, active: v })} label="Aktywna" hint="Ukryte usługi nie są w ofercie." />
      </div>
    </Modal>
  )
}

// ================================================================ resources
function Resources({ s, reload }: { s: Setup; reload: () => Promise<void> }) {
  const { canManage } = usePanel()
  const [edit, setEdit] = useState<Partial<Resource> | null>(null)
  const kinds = (Object.keys(KIND) as ResourceKind[]).filter(k => s.resources.some(r => r.kind === k))
  return (
    <>
      <div className="ap-row ap-row--between" style={{ marginBottom: 14 }}>
        <p className="ap-muted">To są kolumny w kalendarzu: ludzie, stoliki, sale, ekipy lub sprzęt. Każdy może mieć własny grafik i urlopy.</p>
        {canManage && <button className="btn btn--primary btn--sm" onClick={() => setEdit({})}><Ic.plus width={15} height={15} /> Dodaj</button>}
      </div>
      {!s.resources.length ? <Panel><Empty icon={<Ic.users width={22} height={22} />} title="Nikogo jeszcze nie ma" text="Dodaj pracowników (barber, lekarz, trener), stoliki z liczbą miejsc, sale albo ekipy." action={canManage && <button className="btn btn--primary btn--sm" onClick={() => setEdit({})}>Dodaj pierwszy zasób</button>} /></Panel> : kinds.map(k => (
        <div key={k}>
          <div className="rc-cat">{KIND[k].many}</div>
          <div className="rc-cards">{s.resources.filter(r => r.kind === k).map(r => {
            const own = s.hours.filter(h => h.resource_id === r.id)
            const svc = s.services.filter(x => performersOf(s, x).some(p => p.id === r.id))
            return (
              <button key={r.id} className={`rc-card ${r.active ? '' : 'is-off'}`} onClick={() => canManage && setEdit(r)} style={{ cursor: canManage ? 'pointer' : 'default', paddingLeft: 20 }}>
                <span className="rc-card__color" style={{ background: r.color }} />
                <b>{r.name}</b>
                <small>{[r.title, k !== 'staff' && r.capacity > 1 ? `${r.min_capacity > 1 ? `${r.min_capacity}–` : 'do '}${r.capacity} os.` : null].filter(Boolean).join(' · ') || KIND[k].one}</small>
                <div className="rc-card__meta">
                  <Badge>{own.length ? 'własny grafik' : 'godziny firmy'}</Badge>
                  <Badge tone="brand">{svc.length} {svc.length === 1 ? 'usługa' : 'usług'}</Badge>
                  {!r.ai_bookable && <Badge tone="warn">bez AI</Badge>}
                  {!r.active && <Badge>nieaktywny</Badge>}
                </div>
              </button>
            )
          })}</div>
        </div>
      ))}
      <ResourceModal s={s} init={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload() }} />
    </>
  )
}

function ResourceModal({ s, init, onClose, onSaved }: { s: Setup; init: Partial<Resource> | null; onClose: () => void; onSaved: () => void }) {
  const { company } = usePanel()
  const toast = useToast(), confirm = useConfirm()
  const [f, setF] = useState<Partial<Resource>>({})
  const [ownHours, setOwnHours] = useState(false)
  const [hours, setHours] = useState<HoursRow[]>([])
  const [team, setTeam] = useState<{ user_id: string; display_name: string | null; email: string | null }[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!init) return
    const base: Partial<Resource> = { kind: s.resources[0]?.kind ?? 'staff', name: '', title: '', description: '', capacity: 1, min_capacity: 1, color: COLORS[s.resources.length % COLORS.length], member_user_id: null, ai_bookable: true, active: true }
    setF({ ...base, ...init })
    const own = init.id ? s.hours.filter(h => h.resource_id === init.id) : []
    setOwnHours(own.length > 0)
    setHours(own.length ? own : s.hours.filter(h => !h.resource_id).map(h => ({ ...h, id: undefined, resource_id: init.id ?? null })))
    void rpc<typeof team>('company_team', { p_company: company.id }).then(setTeam).catch(() => {})
  }, [init]) // eslint-disable-line react-hooks/exhaustive-deps
  const kind = f.kind as ResourceKind
  const save = async () => {
    setBusy(true)
    try {
      const row = { company_id: company.id, kind, name: f.name!.trim(), title: f.title?.trim() || null, description: f.description?.trim() || null, capacity: Math.max(1, Number(f.capacity) || 1), min_capacity: Math.max(1, Number(f.min_capacity) || 1), color: f.color, member_user_id: f.member_user_id || null, ai_bookable: !!f.ai_bookable, active: !!f.active }
      const id = init?.id ? (await update<Resource>('rc_resources', `id=eq.${init.id}`, row))[0].id : (await insert<Resource>('rc_resources', { ...row, sort: s.resources.length })).id
      await remove('rc_hours', `resource_id=eq.${id}`)
      if (ownHours && hours.length) await insert('rc_hours', hours.map(h => ({ company_id: company.id, resource_id: id, weekday: h.weekday, opens: h.opens, closes: h.closes })))
      toast('Zapisano'); onSaved()
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  const del = async () => {
    if (!init?.id || !await confirm({ title: `Usunąć: ${init.name}?`, text: 'Rezerwacje zostaną w kalendarzu bez przypisania. Jeśli ktoś tylko odchodzi na urlop — dodaj nieobecność albo wyłącz „Aktywny”.', ok: 'Usuń', danger: true })) return
    try { await remove('rc_resources', `id=eq.${init.id}`); toast('Usunięto'); onSaved() } catch (e) { toast(errText(e), 'err') }
  }
  if (!init || !f.kind) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  return (
    <Modal open onClose={onClose} wide="xl" title={init.id ? f.name || 'Edytuj' : KIND[kind].add}
      footer={<>{init.id && <button className="btn btn--ghost btn--sm" style={{ color: '#b1321f', marginRight: 'auto' }} onClick={del}><Ic.trash width={14} height={14} /> Usuń</button>}<button className="btn btn--ghost btn--sm" onClick={onClose}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={busy || !f.name?.trim()} onClick={save}>{busy ? 'Zapisuję…' : 'Zapisz'}</button></>}>
      <div className="rc-split" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)' }}>
        <div className="ap-form">
          {!init.id && <Field label="Rodzaj" hint={KIND[kind].hint}><select className="input" value={kind} onChange={e => setF({ ...f, kind: e.target.value as ResourceKind })}>{(Object.keys(KIND) as ResourceKind[]).map(k => <option key={k} value={k}>{KIND[k].one}</option>)}</select></Field>}
          <Field label={kind === 'staff' ? 'Imię (tak mówi asystent)' : 'Nazwa'}><input className="input" value={f.name ?? ''} onChange={e => setF({ ...f, name: e.target.value })} placeholder={kind === 'staff' ? 'np. Kasia' : kind === 'table' ? 'np. Stolik 4' : 'np. Sala A'} autoFocus /></Field>
          <Field label={kind === 'staff' ? 'Stanowisko / specjalizacja' : 'Opis krótki'}><input className="input" value={f.title ?? ''} onChange={e => setF({ ...f, title: e.target.value })} placeholder={kind === 'staff' ? 'np. Barberka, koloryzacja' : kind === 'table' ? 'np. przy oknie, ogródek' : ''} /></Field>
          {kind !== 'staff' && <div className="ap-form ap-form--2"><Field label="Min. osób"><input className="input" type="number" min={1} value={f.min_capacity} onChange={e => setF({ ...f, min_capacity: Number(e.target.value) })} /></Field><Field label="Maks. osób" hint="Miejsca przy stoliku / pojemność."><input className="input" type="number" min={1} value={f.capacity} onChange={e => setF({ ...f, capacity: Number(e.target.value) })} /></Field></div>}
          <Field label="O tej osobie / zasobie" hint="Asystent może o tym powiedzieć klientowi."><textarea className="input" rows={2} value={f.description ?? ''} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <div className="ap-field"><span>Kolor w kalendarzu</span><div className="rc-swatches">{COLORS.map(c => <button key={c} type="button" className={`rc-swatch ${f.color === c ? 'is-on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c} />)}</div></div>
          {kind === 'staff' && team.length > 0 && <Field label="Konto w panelu" hint="Połącz z kontem pracownika — zobaczy swój grafik."><select className="input" value={f.member_user_id ?? ''} onChange={e => setF({ ...f, member_user_id: e.target.value || null })}><option value="">— bez konta —</option>{team.map(t => <option key={t.user_id} value={t.user_id}>{t.display_name || t.email}</option>)}</select></Field>}
          <Toggle checked={!!f.ai_bookable} onChange={v => setF({ ...f, ai_bookable: v })} label="Asystent AI może tu zapisywać" />
          <Toggle checked={!!f.active} onChange={v => setF({ ...f, active: v })} label="Aktywny" hint="Nieaktywni nie pojawiają się w kalendarzu ani u asystenta." />
        </div>
        <div className="ap-stack">
          <Panel title="Grafik" sub="Kiedy przyjmuje rezerwacje." actions={<Toggle checked={ownHours} onChange={setOwnHours} label="Własny grafik" />}>
            {ownHours ? <WeekEditor rows={hours} onChange={setHours} /> : <p className="ap-muted">Pracuje w godzinach otwarcia firmy. Włącz „Własny grafik”, jeśli ma inne godziny (np. tylko popołudnia albo wybrane dni).</p>}
          </Panel>
          {init.id && <TimeOffPanel resource={init as Resource} />}
        </div>
      </div>
    </Modal>
  )
}

// ================================================================ hours
export function WeekEditor({ rows, onChange, disabled }: { rows: HoursRow[]; onChange: (r: HoursRow[]) => void; disabled?: boolean }) {
  const set = (wd: number, list: HoursRow[]) => onChange([...rows.filter(r => r.weekday !== wd), ...list].sort((a, b) => a.weekday - b.weekday || a.opens.localeCompare(b.opens)))
  const copyDown = (wd: number) => { const src = rows.filter(r => r.weekday === wd); onChange([...rows.filter(r => r.weekday <= wd || r.weekday > 4), ...[1, 2, 3, 4].filter(d => d > wd).flatMap(d => src.map(r => ({ ...r, id: undefined, weekday: d })))].sort((a, b) => a.weekday - b.weekday)) }
  return (
    <div className="rc-week">
      {WEEKDAYS.map((name, wd) => {
        const list = rows.filter(r => r.weekday === wd)
        return (
          <div key={wd} className="rc-day">
            <Toggle checked={list.length > 0} disabled={disabled} onChange={v => set(wd, v ? [{ resource_id: rows[0]?.resource_id ?? null, weekday: wd, opens: '09:00', closes: '17:00' }] : [])} label={name} />
            <div className="rc-day__ranges">
              {!list.length ? <span className="rc-closed">Nieczynne</span> : list.map((r, i) => (
                <div key={i} className="rc-range-row">
                  <input className="input" type="time" step={300} value={r.opens.slice(0, 5)} disabled={disabled} onChange={e => set(wd, list.map((x, j) => j === i ? { ...x, opens: e.target.value } : x))} />
                  <span className="ap-muted">–</span>
                  <input className="input" type="time" step={300} value={r.closes.slice(0, 5)} disabled={disabled} onChange={e => set(wd, list.map((x, j) => j === i ? { ...x, closes: e.target.value } : x))} />
                  {!disabled && (i === 0
                    ? <button className="btn btn--ghost btn--xs" onClick={() => set(wd, [...list, { ...r, id: undefined, opens: r.closes.slice(0, 5) < '20:00' ? addMinutes(r.closes, 60) : '18:00', closes: '20:00' }])} title="Dodaj przedział (np. po przerwie)"><Ic.plus width={13} height={13} /> przerwa</button>
                    : <button className="ap-icon-btn" onClick={() => set(wd, list.filter((_, j) => j !== i))} aria-label="Usuń przedział"><Ic.close width={14} height={14} /></button>)}
                  {!disabled && i === 0 && wd < 4 && <button className="btn btn--ghost btn--xs" onClick={() => copyDown(wd)} title="Skopiuj na kolejne dni robocze">↓ na dni robocze</button>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
function addMinutes(t: string, m: number) { const [h, mi] = t.split(':').map(Number); const x = Math.min(23 * 60, h * 60 + mi + m); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }

function BusinessHours({ s, reload }: { s: Setup; reload: () => Promise<void> }) {
  const { company, canManage } = usePanel()
  const toast = useToast()
  const initial = useMemo(() => s.hours.filter(h => !h.resource_id), [s.hours])
  const [rows, setRows] = useState<HoursRow[]>(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => setRows(initial), [initial])
  const dirty = JSON.stringify(rows.map(r => [r.weekday, r.opens.slice(0, 5), r.closes.slice(0, 5)])) !== JSON.stringify(initial.map(r => [r.weekday, r.opens.slice(0, 5), r.closes.slice(0, 5)]))
  const bad = rows.some(r => r.closes.slice(0, 5) <= r.opens.slice(0, 5))
  const save = async () => {
    setBusy(true)
    try {
      await remove('rc_hours', `company_id=eq.${company.id}&resource_id=is.null`)
      if (rows.length) await insert('rc_hours', rows.map(r => ({ company_id: company.id, resource_id: null, weekday: r.weekday, opens: r.opens, closes: r.closes })))
      toast('Zapisano godziny otwarcia'); await reload()
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  return (
    <div className="ap-grid ap-grid--main">
      <Panel title="Godziny otwarcia" sub="Asystent podaje je klientom. Pracownicy bez własnego grafiku pracują w tych godzinach." actions={canManage && <button className="btn btn--primary btn--sm" disabled={!dirty || busy || bad} onClick={save}>{busy ? 'Zapisuję…' : 'Zapisz'}</button>}>
        <WeekEditor rows={rows} onChange={setRows} disabled={!canManage} />
        {bad && <p className="ap-err" style={{ marginTop: 8 }}>Godzina zamknięcia musi być późniejsza niż otwarcia.</p>}
      </Panel>
      <TimeOffPanel resource={null} />
    </div>
  )
}

function TimeOffPanel({ resource }: { resource: Resource | null }) {
  const { company } = usePanel()
  const toast = useToast()
  const [list, setList] = useState<TimeOff[] | null>(null)
  const [f, setF] = useState({ from: today(), to: today(), reason: '', partial: false, start: '09:00', end: '13:00' })
  const load = useCallback(async () => setList(await get<TimeOff[]>(`rc_time_off?company_id=eq.${company.id}&resource_id=${resource ? `eq.${resource.id}` : 'is.null'}&ends_at=gt.${new Date().toISOString()}&select=*&order=starts_at.asc`).catch(() => [])), [company.id, resource])
  useEffect(() => { void load() }, [load])
  const add = async () => {
    try {
      const [sh, sm] = f.start.split(':').map(Number), [eh, em] = f.end.split(':').map(Number)
      const starts = f.partial ? at(f.from, sh * 60 + sm) : at(f.from, 0), ends = f.partial ? at(f.from, eh * 60 + em) : at(addDays(f.to < f.from ? f.from : f.to, 1), 0)
      await insert('rc_time_off', { company_id: company.id, resource_id: resource?.id ?? null, starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: f.reason.trim() || null })
      toast('Dodano'); setF({ ...f, reason: '' }); await load()
    } catch (e) { toast(errText(e), 'err') }
  }
  const fmt = (o: TimeOff) => {
    const s = new Date(o.starts_at), e = new Date(o.ends_at)
    const sameDay = e.getTime() - s.getTime() < 86400000 && s.getHours() !== 0
    return sameDay ? `${dateLabel(o.starts_at.slice(0, 10), { day: 'numeric', month: 'short' })}, ${s.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}–${e.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
      : `${s.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })} – ${new Date(e.getTime() - 1).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  return (
    <Panel title={resource ? 'Urlopy i nieobecności' : 'Dni wolne i święta'} sub={resource ? 'W tym czasie nikt nie zostanie zapisany.' : 'Firma zamknięta — asystent nie zapisze na te dni.'}>
      <div className="ap-form" style={{ marginBottom: 14 }}>
        <Toggle checked={f.partial} onChange={v => setF({ ...f, partial: v })} label="Tylko część dnia" />
        <div className="ap-form ap-form--2">
          <Field label={f.partial ? 'Dzień' : 'Od'}><input className="input" type="date" value={f.from} min={today()} onChange={e => setF({ ...f, from: e.target.value, to: e.target.value > f.to ? e.target.value : f.to })} /></Field>
          {f.partial ? <div className="ap-row" style={{ alignItems: 'flex-end' }}><Field label="Od"><input className="input" type="time" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></Field><Field label="Do"><input className="input" type="time" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></Field></div>
            : <Field label="Do (włącznie)"><input className="input" type="date" value={f.to} min={f.from} onChange={e => setF({ ...f, to: e.target.value })} /></Field>}
        </div>
        <div className="ap-row"><input className="input ap-input" style={{ flex: 1 }} placeholder={resource ? 'Powód (np. urlop, szkolenie)' : 'Powód (np. Wszystkich Świętych)'} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} /><button className="btn btn--ghost btn--sm" onClick={add}><Ic.plus width={14} height={14} /> Dodaj</button></div>
      </div>
      {!list ? <Loading /> : !list.length ? <p className="ap-muted">Brak zaplanowanych.</p> : (
        <div className="rc-list">{list.map(o => (
          <div key={o.id} className="rc-li"><span className="rc-ico is-warn"><Ic.calendar width={16} height={16} /></span><div><b>{fmt(o)}</b>{o.reason && <small>{o.reason}</small>}</div>
            <button className="ap-icon-btn" aria-label="Usuń" onClick={async () => { await remove('rc_time_off', `id=eq.${o.id}`).catch(e => toast(errText(e), 'err')); await load() }}><Ic.trash width={15} height={15} /></button></div>
        ))}</div>
      )}
    </Panel>
  )
}
