import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { errText, fn, get, insert, remove, rpc, update } from '../app/api'
import { Avatar, Badge, Empty, Field, Ic, Loading, Menu, Modal, PageHead, Panel, Toggle, fmtAgo, fmtDate, fmtNum, useConfirm, useToast } from '../app/ui'
import { Credentials, ROLE_LABEL } from '../panel/TeamPage'
import type { Role } from '../panel/PanelApp'
import type { Lead } from './Leads'

export interface AdminCompany {
  id: string; name: string; industry: string | null; status: 'trial' | 'active' | 'paused'; modules: string[]; city: string | null; email: string | null; phone: string | null
  address: string | null; website: string | null; nip: string | null; logo_url: string | null; created_at: string; waitlist_id: string | null
  members: { user_id: string; role: Role; name: string | null; email: string | null; avatar: string | null; last_sign_in_at: string | null }[]
  programs: number; cards: number; stamps_30d: number
}
export const MODULES: { id: string; label: string; live: boolean; hint: string }[] = [
  { id: 'loyalty', label: 'Karty lojalnościowe', live: true, hint: 'Apple/Google Wallet, skaner, powiadomienia' },
  { id: 'reception', label: 'Recepcja AI (telefon)', live: true, hint: 'Asystent głosowy, Rozmowy + kalendarz i klienci. Wolny numer przydzieli się sam przy pierwszym wgraniu asystenta.' },
  { id: 'calendar', label: 'Kalendarz (bez AI)', live: true, hint: 'Dzisiaj, Kalendarz, Usługi i grafik, Klienci' },
  { id: 'clients', label: 'Klienci (CRM)', live: true, hint: 'Sama baza klientów' },
]
const STATUS = { active: { label: 'Aktywna', tone: 'ok' as const }, trial: { label: 'Okres próbny', tone: 'brand' as const }, paused: { label: 'Wstrzymana', tone: 'warn' as const } }

export function Companies() {
  const loc = useLocation(), nav = useNavigate()
  const q = new URLSearchParams(loc.search)
  const [rows, setRows] = useState<AdminCompany[] | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState<Partial<AdminCompany> | null>(null)
  const load = useCallback(async () => setRows(await rpc<AdminCompany[]>('admin_companies').catch(() => [])), [])
  useEffect(() => { void load() }, [load])
  // "Utwórz firmę z tego zgłoszenia"
  useEffect(() => {
    if (q.get('nowa') !== '1') return
    const lead = q.get('lead')
    if (!lead) { setCreating({}); return }
    void get<Lead[]>(`waitlist_subscribers?id=eq.${lead}&select=*`).then(([l]) => setCreating({ name: l?.company ?? '', industry: l?.business_type ?? '', email: l?.email ?? '', phone: l?.phone ? `+${l.phone}` : '', waitlist_id: l?.id ?? null }))
  }, [loc.search]) // eslint-disable-line react-hooks/exhaustive-deps
  const openId = q.get('id')
  const current = rows?.find(c => c.id === openId) ?? null
  const list = useMemo(() => (rows ?? []).filter(c => !search || [c.name, c.industry, c.city, c.email, ...c.members.map(m => m.email)].some(v => v?.toLowerCase().includes(search.toLowerCase()))), [rows, search])

  return (
    <>
      <PageHead title="Firmy" chip={rows ? String(rows.length) : undefined} sub="Klienci TableFlow: pakiety, konta i dostęp do ich paneli."
        actions={<button className="btn btn--primary btn--sm" onClick={() => setCreating({})}><Ic.plus width={15} height={15} /> Nowa firma</button>} />
      {!rows ? <Loading /> : (
        <>
          <div className="ap-row" style={{ marginBottom: 16 }}><label className="ap-search"><Ic.search width={16} height={16} /><input className="input" placeholder="Szukaj firmy, miasta, konta…" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
          {!list.length ? <Panel><Empty icon={<Ic.building width={22} height={22} />} title={rows.length ? 'Brak wyników' : 'Nie ma jeszcze firm'} text="Utwórz firmę, dodaj do niej konta klienta i włącz moduły." action={<button className="btn btn--primary btn--sm" onClick={() => setCreating({})}>Nowa firma</button>} /></Panel> : (
            <div className="ad-cos">
              {list.map(c => (
                <button key={c.id} className="ad-co" onClick={() => nav(`/admin/firmy?id=${c.id}`)}>
                  <div className="ad-co__head"><Avatar name={c.name} src={c.logo_url} size={40} /><div><b>{c.name}</b><small>{[c.industry, c.city].filter(Boolean).join(' · ') || '—'}</small></div><Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge></div>
                  <div className="ap-chips">{MODULES.filter(m => c.modules.includes(m.id)).map(m => <Badge key={m.id} tone={m.live ? 'brand' : 'neutral'}>{m.label}</Badge>)}</div>
                  <div className="ad-co__stats"><span><b>{c.members.length}</b> kont</span><span><b>{fmtNum(c.cards)}</b> kart</span><span><b>{fmtNum(c.stamps_30d)}</b> pieczątek / 30 dni</span></div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <CreateCompany init={creating} onClose={() => { setCreating(null); if (q.get('nowa')) nav('/admin/firmy', { replace: true }) }} onCreated={async id => { setCreating(null); await load(); nav(`/admin/firmy?id=${id}`, { replace: true }) }} />
      <CompanyModal c={current} onClose={() => nav('/admin/firmy')} reload={load} />
    </>
  )
}

function CreateCompany({ init, onClose, onCreated }: { init: Partial<AdminCompany> | null; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast()
  const [f, setF] = useState({ name: '', industry: '', city: '', email: '', phone: '', status: 'active', loyalty: true })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (init) setF({ name: init.name ?? '', industry: init.industry ?? '', city: '', email: init.email ?? '', phone: init.phone ?? '', status: 'active', loyalty: true }) }, [init])
  const submit = async () => {
    setBusy(true)
    try {
      const c = await insert<{ id: string }>('companies', { name: f.name.trim(), industry: f.industry || null, city: f.city || null, email: f.email || null, phone: f.phone || null, status: f.status, modules: f.loyalty ? ['loyalty'] : [], waitlist_id: init?.waitlist_id ?? null })
      if (init?.waitlist_id) await update('waitlist_subscribers', `id=eq.${init.waitlist_id}`, { status: 'confirmed' }).catch(() => {})
      toast('Utworzono firmę'); onCreated(c.id)
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  return (
    <Modal open={!!init} onClose={onClose} title="Nowa firma" sub={init?.waitlist_id ? 'Dane uzupełnione ze zgłoszenia.' : 'Następnie dodasz konta klienta i włączysz moduły.'}
      footer={<><button className="btn btn--ghost btn--sm" onClick={onClose}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={busy || !f.name.trim()} onClick={submit}>{busy ? 'Tworzę…' : 'Utwórz firmę'}</button></>}>
      <div className="ap-form ap-form--2">
        <Field label="Nazwa" className="span-2"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Branża"><input className="input" value={f.industry} onChange={e => setF({ ...f, industry: e.target.value })} placeholder="Kawiarnia, barbershop…" /></Field>
        <Field label="Miasto"><input className="input" value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="E-mail"><input className="input" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Telefon"><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Aktywna</option><option value="trial">Okres próbny</option><option value="paused">Wstrzymana</option></select></Field>
        <div className="span-2"><Toggle checked={f.loyalty} onChange={v => setF({ ...f, loyalty: v })} label="Karty lojalnościowe" hint="Moduł gotowy do użycia." /></div>
      </div>
    </Modal>
  )
}

function CompanyModal({ c, onClose, reload }: { c: AdminCompany | null; onClose: () => void; reload: () => Promise<void> }) {
  const toast = useToast(), confirm = useConfirm(), nav = useNavigate()
  const [f, setF] = useState<AdminCompany | null>(c)
  const [addOpen, setAddOpen] = useState(false)
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null)
  useEffect(() => setF(c), [c])
  if (!c || !f) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const save = async (patch: Partial<AdminCompany>, msg = 'Zapisano') => {
    try { await update('companies', `id=eq.${c.id}`, patch); await reload(); toast(msg) } catch (e) { toast(errText(e), 'err') }
  }
  const toggleModule = (id: string, on: boolean) => { const modules = on ? [...new Set([...f.modules, id])] : f.modules.filter(m => m !== id); setF({ ...f, modules }); void save({ modules }, 'Zmieniono pakiet') }
  const member = async (body: Record<string, unknown>, ok: string) => {
    try { const r = await fn<{ password?: string }>('admin-api', { company_id: c.id, ...body }); await reload(); toast(ok); return r } catch (e) { toast(errText(e), 'err'); return null }
  }
  const del = async () => {
    if (!await confirm({ title: 'Usunąć firmę?', text: 'Usunięte zostaną programy lojalnościowe, karty klientów i członkostwa. Konta użytkowników zostaną (możesz je usunąć w zakładce Konta).', ok: 'Usuń firmę', danger: true, typeToConfirm: c.name })) return
    try { await remove('companies', `id=eq.${c.id}`); await reload(); toast('Usunięto firmę'); onClose() } catch (e) { toast(errText(e), 'err') }
  }
  const dirty = (['name', 'industry', 'city', 'email', 'phone', 'address', 'website', 'nip'] as const).some(k => (f[k] ?? '') !== (c[k] ?? ''))

  return (
    <>
      <Modal open onClose={onClose} wide="xl" title={<span className="ap-row"><Avatar name={c.name} src={c.logo_url} size={34} />{c.name}</span>} sub={`Utworzona ${fmtDate(c.created_at)} · ${c.programs} programów · ${fmtNum(c.cards)} kart`}
        footer={<><button className="btn btn--ghost btn--sm" style={{ color: '#b1321f' }} onClick={del}><Ic.trash width={14} height={14} /> Usuń firmę</button><span style={{ flex: 1 }} /><Link className="btn btn--primary btn--sm" to={`/panel?firma=${c.id}`}>Otwórz panel firmy <Ic.arrow width={14} height={14} /></Link></>}>
        <div className="ad-co-detail">
          <div className="ap-stack">
            <Panel title="Konta klienta" sub="Kilka osób może mieć dostęp do jednej firmy." actions={<button className="btn btn--ghost btn--xs" onClick={() => setAddOpen(true)}><Ic.plus width={13} height={13} /> Dodaj konto</button>}>
              {!c.members.length ? <Empty title="Brak kont" text="Dodaj konto właściciela — dostanie login i hasło do panelu." /> : (
                <ul className="ad-members">{c.members.map(m => (
                  <li key={m.user_id}>
                    <Avatar name={m.name || m.email || '?'} src={m.avatar} size={30} />
                    <div><b>{m.name || m.email}</b><small>{m.email} · logowanie {fmtAgo(m.last_sign_in_at)}</small></div>
                    <Badge tone={m.role === 'owner' ? 'dark' : m.role === 'manager' ? 'brand' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
                    <Menu items={[
                      ...(['owner', 'manager', 'staff'] as Role[]).filter(r => r !== m.role).map(r => ({ label: `Zmień na: ${ROLE_LABEL[r]}`, onClick: () => void member({ action: 'update_member', user_id: m.user_id, role: r }, 'Zmieniono rolę') })),
                      { label: 'Nowe hasło', icon: <Ic.lock width={15} height={15} />, onClick: async () => { const r = await member({ action: 'reset_password', user_id: m.user_id }, 'Wygenerowano hasło'); if (r?.password) setSecret({ email: m.email ?? '', password: r.password }) } },
                      { label: 'Odłącz od firmy', icon: <Ic.close width={15} height={15} />, danger: true, onClick: async () => { if (await confirm({ title: 'Odłączyć konto?', text: `${m.email} straci dostęp do ${c.name}. Konto pozostanie.`, ok: 'Odłącz', danger: true })) void member({ action: 'remove_member', user_id: m.user_id }, 'Odłączono') } },
                    ]} />
                  </li>
                ))}</ul>
              )}
            </Panel>
            <Panel title="Pakiet — moduły" sub="Zablokowane moduły klient widzi z kłódką.">
              <div className="ap-check-list">
                {MODULES.map(m => <Toggle key={m.id} checked={f.modules.includes(m.id)} onChange={v => toggleModule(m.id, v)} label={<>{m.label} {!m.live && <Badge>wkrótce</Badge>}</>} hint={m.hint} />)}
              </div>
              <div className="ap-divider" style={{ margin: '14px 0' }} />
              <Field label="Status firmy"><select className="input" value={f.status} onChange={e => { const status = e.target.value as AdminCompany['status']; setF({ ...f, status }); void save({ status }, 'Zmieniono status') }}><option value="active">Aktywna</option><option value="trial">Okres próbny</option><option value="paused">Wstrzymana (karty klientów nieaktywne)</option></select></Field>
            </Panel>
          </div>
          <Panel title="Dane firmy">
            <div className="ap-form ap-form--2">
              <Field label="Nazwa" className="span-2"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Branża"><input className="input" value={f.industry ?? ''} onChange={e => setF({ ...f, industry: e.target.value })} /></Field>
              <Field label="Miasto"><input className="input" value={f.city ?? ''} onChange={e => setF({ ...f, city: e.target.value })} /></Field>
              <Field label="E-mail"><input className="input" value={f.email ?? ''} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Telefon"><input className="input" value={f.phone ?? ''} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label="Adres" className="span-2"><input className="input" value={f.address ?? ''} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
              <Field label="NIP"><input className="input" value={f.nip ?? ''} onChange={e => setF({ ...f, nip: e.target.value })} /></Field>
              <Field label="Strona www"><input className="input" value={f.website ?? ''} onChange={e => setF({ ...f, website: e.target.value })} /></Field>
            </div>
            <div className="ap-row ap-row--between" style={{ marginTop: 16 }}>
              {c.waitlist_id ? <button className="btn btn--ghost btn--xs" onClick={() => nav('/admin/zgloszenia')}><Ic.inbox width={13} height={13} /> Ze zgłoszenia</button> : <span />}
              <button className="btn btn--primary btn--sm" disabled={!dirty || !f.name.trim()} onClick={() => save({ name: f.name.trim(), industry: f.industry || null, city: f.city || null, email: f.email || null, phone: f.phone || null, address: f.address || null, nip: f.nip || null, website: f.website || null })}>Zapisz dane</button>
            </div>
          </Panel>
        </div>
      </Modal>
      <AddAccount open={addOpen} company={c} onClose={() => setAddOpen(false)} onDone={async (email, pw) => { setAddOpen(false); await reload(); if (pw) setSecret({ email, password: pw }) }} />
      <Credentials data={secret} onClose={() => setSecret(null)} />
    </>
  )
}

function AddAccount({ open, company, onClose, onDone }: { open: boolean; company: AdminCompany; onClose: () => void; onDone: (email: string, password: string | null) => void }) {
  const toast = useToast()
  const [f, setF] = useState({ email: '', name: '', role: (company.members.length ? 'staff' : 'owner') as Role })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF({ email: '', name: '', role: company.members.length ? 'staff' : 'owner' }) }, [open, company.members.length])
  const submit = async () => {
    setBusy(true)
    try {
      const r = await fn<{ password: string | null; existing: boolean }>('admin-api', { action: 'create_user', company_id: company.id, email: f.email, name: f.name, role: f.role })
      toast(r.existing ? 'Podłączono istniejące konto' : 'Utworzono konto'); onDone(f.email.trim().toLowerCase(), r.password)
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  return (
    <Modal open={open} onClose={onClose} title={`Konto dla: ${company.name}`} sub="Jeśli konto z tym e-mailem już istnieje, zostanie podłączone do firmy (bez zmiany hasła)."
      footer={<><button className="btn btn--ghost btn--sm" onClick={onClose}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={busy || !f.email.includes('@')} onClick={submit}>{busy ? 'Zapisuję…' : 'Dodaj konto'}</button></>}>
      <div className="ap-form">
        <Field label="E-mail (login)"><input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoFocus /></Field>
        <Field label="Imię i nazwisko"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Rola w firmie"><select className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}><option value="owner">Właściciel</option><option value="manager">Menedżer</option><option value="staff">Obsługa</option></select></Field>
      </div>
    </Modal>
  )
}
