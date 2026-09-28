import { useCallback, useEffect, useMemo, useState } from 'react'
import { get, remove, rpc, update, errText } from '../../app/api'
import { Badge, Empty, Field, Ic, Loading, Menu, Modal, Panel, Segmented, fmtAgo, fmtDate, useConfirm, useCopy, useToast } from '../../app/ui'
import { StampDots } from '../../app/charts'
import { Qr } from '../../loyalty/CardVisual'
import { usePanel } from '../PanelApp'
import { EVENT_LABEL, cardUrl, lookup, notifyWallet, redeem, stamp, unstamp, type CardRow, type Program, type ScannedCard } from './types'

type Filter = 'all' | 'ready' | 'near' | 'inactive' | 'wallet' | 'blocked'

export function CardsTab({ program }: { program: Program }) {
  const { canManage } = usePanel()
  const [rows, setRows] = useState<CardRow[] | null>(null)
  const [q, setQ] = useState(''); const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [issue, setIssue] = useState(false)
  const load = useCallback(async () => {
    setRows(await get<CardRow[]>(`loyalty_cards?program_id=eq.${program.id}&order=created_at.desc&limit=2000&select=*`).catch(() => []))
  }, [program.id])
  useEffect(() => { void load() }, [load])

  const req = program.stamps_required
  const list = useMemo(() => {
    if (!rows) return []
    const s = q.trim().toLowerCase()
    const month = Date.now() - 30 * 86400000
    return rows.filter(r => {
      if (s && ![r.customer_name, r.email, r.phone, r.code].some(v => v?.toLowerCase().includes(s.replace(/\s/g, '')) || v?.toLowerCase().includes(s))) return false
      if (filter === 'ready') return r.stamps >= req
      if (filter === 'near') return r.stamps < req && r.stamps >= req - 2
      if (filter === 'inactive') return Date.parse(r.last_stamp_at ?? r.created_at) < month
      if (filter === 'wallet') return r.apple_devices > 0 || r.google_saved
      if (filter === 'blocked') return r.status === 'blocked'
      return true
    })
  }, [rows, q, filter, req])

  const exportCsv = () => {
    const head = ['Imię', 'E-mail', 'Telefon', 'Kod', 'Pieczątki', 'Wszystkie pieczątki', 'Nagrody', 'Apple', 'Google', 'Zgoda marketingowa', 'Ostatnia wizyta', 'Utworzono']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [head, ...list.map(r => [r.customer_name, r.email, r.phone, r.code, r.stamps, r.total_stamps, r.rewards_redeemed, r.apple_devices > 0 ? 'tak' : '', r.google_saved ? 'tak' : '', r.consent_marketing ? 'tak' : 'nie', r.last_stamp_at ?? '', r.created_at])].map(r => r.map(esc).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `karty-${program.slug}.csv`; a.click()
  }

  if (!rows) return <Loading />
  return (
    <Panel pad>
      <div className="ap-row" style={{ marginBottom: 14 }}>
        <label className="ap-search"><Ic.search width={16} height={16} /><input className="input" placeholder="Szukaj: imię, telefon, e-mail, kod" value={q} onChange={e => setQ(e.target.value)} /></label>
        <select className="input ap-select" value={filter} onChange={e => setFilter(e.target.value as Filter)} aria-label="Filtr">
          <option value="all">Wszystkie ({rows.length})</option><option value="ready">Nagroda do odbioru</option><option value="near">Blisko nagrody</option>
          <option value="inactive">Nieaktywni 30+ dni</option><option value="wallet">W Apple/Google Wallet</option><option value="blocked">Zablokowane</option>
        </select>
        <div className="ap-row" style={{ marginLeft: 'auto' }}>
          {canManage && rows.length > 0 && <button className="btn btn--ghost btn--sm" onClick={exportCsv}><Ic.download width={15} height={15} /> CSV</button>}
          <button className="btn btn--primary btn--sm" onClick={() => setIssue(true)}><Ic.plus width={15} height={15} /> Dodaj klienta</button>
        </div>
      </div>
      {!list.length ? <Empty icon={<Ic.card width={22} height={22} />} title={rows.length ? 'Brak wyników' : 'Nie ma jeszcze kart'} text={rows.length ? 'Zmień wyszukiwanie lub filtr.' : 'Klienci dostają kartę, skanując kod QR z plakatu (zakładka Udostępnij). Możesz też dodać klienta ręcznie.'} /> : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead><tr><th>Klient</th><th className="ap-table-hide-sm">Kontakt</th><th>Postęp</th><th className="ap-table-hide-sm">Portfel</th><th className="ap-table-hide-sm">Ostatnia wizyta</th></tr></thead>
            <tbody>
              {list.slice(0, 300).map(r => (
                <tr key={r.id} className="is-click" onClick={() => setOpen(r.code)}>
                  <td><b style={{ fontWeight: 500 }}>{r.customer_name || '—'}</b><small className="ap-mono">{r.code}</small></td>
                  <td className="ap-table-hide-sm"><span>{r.phone ? `+${r.phone}` : '—'}</span><small>{r.email}</small></td>
                  <td><StampDots n={r.stamps} of={req} />{r.status === 'blocked' && <Badge tone="err">zablokowana</Badge>}</td>
                  <td className="ap-table-hide-sm"><span className="ly-wallets">{r.apple_devices > 0 && <Ic.apple width={15} height={15} aria-label="Apple Wallet" />}{r.google_saved && <Ic.android width={15} height={15} aria-label="Google Wallet" />}{!r.apple_devices && !r.google_saved && <small>tylko online</small>}</span></td>
                  <td className="ap-table-hide-sm">{fmtAgo(r.last_stamp_at)}<small>od {fmtDate(r.created_at)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > 300 && <p className="ap-muted" style={{ padding: 12 }}>Pokazano 300 z {list.length} — zawęź wyszukiwanie.</p>}
        </div>
      )}
      <CardModal code={open} onClose={() => setOpen(null)} onChanged={load} />
      <IssueModal open={issue} program={program} onClose={() => setIssue(false)} onDone={load} />
    </Panel>
  )
}

/** Card detail: stamps +/−, reward, contact edit, customer link, block/delete, history. */
export function CardModal({ code, onClose, onChanged }: { code: string | null; onClose: () => void; onChanged?: () => void }) {
  const { canManage } = usePanel()
  const toast = useToast(), confirm = useConfirm(), copy = useCopy()
  const [c, setC] = useState<ScannedCard | null>(null)
  const [row, setRow] = useState<CardRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<{ customer_name: string; email: string; phone: string; note: string } | null>(null)
  const [showQr, setShowQr] = useState(false)
  useEffect(() => {
    setC(null); setRow(null); setEdit(null); setShowQr(false)
    if (!code) return
    void lookup(code).then(setC).catch(e => toast(errText(e), 'err'))
    void get<CardRow[]>(`loyalty_cards?code=eq.${code}&select=*`).then(r => setRow(r[0] ?? null)).catch(() => {})
  }, [code, toast])
  const act = async (fnc: () => Promise<{ status: string; card: ScannedCard; wait_minutes?: number }>, ok: string, force?: () => Promise<{ status: string; card: ScannedCard }>) => {
    if (!c) return
    setBusy(true)
    try {
      const r = await fnc()
      if (r.status === 'cooldown') {
        if (force && canManage && await confirm({ title: 'Pieczątka była przed chwilą', text: `Ostatnia pieczątka została przybita niedawno (blokada jeszcze ${r.wait_minutes} min). Dodać mimo to?`, ok: 'Dodaj mimo to' })) {
          const f = await force(); setC(f.card); toast(ok); notifyWallet(c.id); onChanged?.()
        } else toast(`Blokada: jeszcze ${r.wait_minutes} min`, 'info')
      } else { setC(r.card); toast(ok); notifyWallet(c.id); onChanged?.() }
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  const saveEdit = async () => {
    if (!c || !edit) return
    try {
      await update('loyalty_cards', `id=eq.${c.id}`, { customer_name: edit.customer_name.trim(), email: edit.email.trim() || null, phone: edit.phone.replace(/\D/g, '') || null, note: edit.note.trim() || null })
      setC(await lookup(c.code)); setRow(r => r && { ...r, ...edit }); setEdit(null); toast('Zapisano'); onChanged?.(); notifyWallet(c.id)
    } catch (e) { toast(errText(e), 'err') }
  }
  const setBlocked = async (blocked: boolean) => {
    if (!c) return
    try { await update('loyalty_cards', `id=eq.${c.id}`, { status: blocked ? 'blocked' : 'active' }); setC(await lookup(c.code)); toast(blocked ? 'Karta zablokowana' : 'Karta odblokowana'); notifyWallet(c.id); onChanged?.() } catch (e) { toast(errText(e), 'err') }
  }
  const del = async () => {
    if (!c || !await confirm({ title: 'Usunąć kartę?', text: `Karta ${c.name} (${c.code}) i jej historia zostaną usunięte. Karta w portfelu klienta przestanie się aktualizować.`, ok: 'Usuń kartę', danger: true })) return
    try { await remove('loyalty_cards', `id=eq.${c.id}`); toast('Usunięto kartę'); onChanged?.(); onClose() } catch (e) { toast(errText(e), 'err') }
  }
  const req = c?.program.stamps_required ?? 10
  const link = row ? cardUrl(row.token) : ''

  return (
    <Modal open={!!code} onClose={onClose} wide title={c ? c.name || 'Klient' : 'Karta'} sub={c ? <span className="ap-row" style={{ gap: 8 }}><span className="ap-mono">{c.code}</span>{c.apple_devices > 0 && <Badge tone="dark"><Ic.apple width={11} height={11} /> Apple</Badge>}{c.google_saved && <Badge tone="brand">Google</Badge>}{c.status === 'blocked' && <Badge tone="err">Zablokowana</Badge>}</span> : undefined}
      footer={c && canManage ? <><Menu items={[
        { label: 'Edytuj dane', icon: <Ic.edit width={15} height={15} />, onClick: () => setEdit({ customer_name: c.name, email: c.email ?? '', phone: c.phone ?? '', note: row?.note ?? '' }) },
        c.status === 'active' ? { label: 'Zablokuj kartę', icon: <Ic.lock width={15} height={15} />, onClick: () => void setBlocked(true) } : { label: 'Odblokuj kartę', icon: <Ic.lock width={15} height={15} />, onClick: () => void setBlocked(false) },
        { label: 'Usuń kartę', icon: <Ic.trash width={15} height={15} />, onClick: del, danger: true },
      ]} /><span style={{ flex: 1 }} /><button className="btn btn--ghost btn--sm" onClick={onClose}>Zamknij</button></> : undefined}>
      {!c ? <Loading /> : edit ? (
        <div className="ap-form ap-form--2">
          <Field label="Imię i nazwisko" className="span-2"><input className="input" value={edit.customer_name} onChange={e => setEdit({ ...edit, customer_name: e.target.value })} /></Field>
          <Field label="E-mail"><input className="input" type="email" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} /></Field>
          <Field label="Telefon"><input className="input" inputMode="tel" value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="Notatka (widoczna tylko dla zespołu)" className="span-2"><textarea className="input" value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} /></Field>
          <div className="ap-row ap-row--end span-2"><button className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>Anuluj</button><button className="btn btn--primary btn--sm" onClick={saveEdit}>Zapisz</button></div>
        </div>
      ) : (
        <>
          <div className="ly-progress">
            <div className="ly-progress__n"><b>{Math.min(c.stamps, req)}</b><span>/ {req}</span></div>
            <div className="ly-progress__dots">{Array.from({ length: req }, (_, i) => <i key={i} className={i < c.stamps ? 'is-on g' : ''} />)}</div>
            {c.stamps >= req && <div className="ly-progress__ready"><Ic.gift width={16} height={16} /> Nagroda do odbioru: <b>{c.program.reward}</b></div>}
          </div>
          <div className="ly-stamp-actions">
            <button className="btn btn--primary" disabled={busy || c.status !== 'active'} onClick={() => act(() => stamp(c.id, 1), 'Dodano pieczątkę', () => stamp(c.id, 1, true))}><Ic.plus width={16} height={16} /> Pieczątka</button>
            {c.stamps >= req && <button className="btn btn--brand" disabled={busy} onClick={() => act(() => redeem(c.id), 'Nagroda odebrana 🎉')}><Ic.gift width={16} height={16} /> Wydaj nagrodę</button>}
            {canManage && c.stamps > 0 && <button className="btn btn--ghost" disabled={busy} onClick={() => act(() => unstamp(c.id, 1), 'Cofnięto pieczątkę')}><Ic.minus width={16} height={16} /> Cofnij</button>}
          </div>
          <dl className="ap-kv">
            <dt>Telefon</dt><dd>{c.phone ? `+${c.phone}` : '—'}</dd>
            <dt>E-mail</dt><dd>{c.email || '—'}</dd>
            <dt>Łącznie pieczątek</dt><dd>{c.total_stamps} · nagród odebranych: {c.rewards_redeemed}</dd>
            <dt>Karta od</dt><dd>{fmtDate(c.created_at)} · ostatnia wizyta {fmtAgo(c.last_stamp_at)}</dd>
            {row?.note && <><dt>Notatka</dt><dd>{row.note}</dd></>}
          </dl>
          {link && (
            <div className="ly-link">
              <span>Karta online klienta</span>
              <div className="ap-row"><button className="btn btn--ghost btn--xs" onClick={() => copy(link, 'Skopiowano link do karty')}><Ic.copy width={13} height={13} /> Kopiuj link</button><button className="btn btn--ghost btn--xs" onClick={() => setShowQr(v => !v)}><Ic.qr width={13} height={13} /> {showQr ? 'Ukryj QR' : 'QR dla klienta'}</button></div>
              {showQr && <div className="ly-link__qr"><Qr text={link} /><small>Klient skanuje aparatem — otworzy swoją kartę i doda ją do portfela.</small></div>}
            </div>
          )}
          <div>
            <h4 className="ly-h4">Historia</h4>
            <ul className="ly-feed">{c.history.map((h, i) => <li key={i}><i className={`is-${h.kind}`} /><span>{EVENT_LABEL[h.kind] ?? h.kind}{h.delta && h.kind === 'stamp' && h.delta > 1 ? ` ×${h.delta}` : ''}{h.by && <small> · {h.by}</small>}{h.note === 'force' && <small> · poza blokadą</small>}</span><small>{fmtDate(h.at, true)}</small></li>)}</ul>
          </div>
        </>
      )}
    </Modal>
  )
}

function IssueModal({ open, program, onClose, onDone }: { open: boolean; program: Program; onClose: () => void; onDone: () => void }) {
  const toast = useToast(), copy = useCopy()
  const [f, setF] = useState({ name: '', email: '', phone: '' })
  const [res, setRes] = useState<{ token: string; code: string } | null>(null)
  const [via, setVia] = useState<'qr' | 'link'>('qr')
  useEffect(() => { if (open) { setF({ name: '', email: '', phone: '' }); setRes(null) } }, [open])
  const submit = async () => {
    try {
      const r = await rpc<{ card: ScannedCard; token: string }>('loyalty_issue', { p_program: program.id, p_name: f.name, p_email: f.email || null, p_phone: f.phone || null })
      setRes({ token: r.token, code: r.card.code }); onDone()
    } catch (e) { toast(errText(e), 'err') }
  }
  const link = res ? cardUrl(res.token) : ''
  return (
    <Modal open={open} onClose={onClose} title={res ? 'Karta gotowa' : 'Dodaj klienta'} sub={res ? 'Pokaż klientowi kod — otworzy kartę na swoim telefonie i doda ją do portfela.' : 'Wydaj kartę klientowi przy ladzie.'}
      footer={res ? <button className="btn btn--primary btn--sm" onClick={onClose}>Gotowe</button> : <><button className="btn btn--ghost btn--sm" onClick={onClose}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={f.name.trim().length < 1} onClick={submit}>Wydaj kartę</button></>}>
      {res ? (
        <div className="ly-issued">
          <Segmented value={via} onChange={setVia} options={[{ v: 'qr', label: 'Kod QR' }, { v: 'link', label: 'Link' }]} size="sm" />
          {via === 'qr' ? <div className="ly-link__qr ly-link__qr--big"><Qr text={link} /></div> : <div className="ap-secret"><span>{link}</span><button onClick={() => copy(link)}><Ic.copy width={16} height={16} /></button></div>}
          <p className="ap-muted">Numer karty: <span className="ap-mono">{res.code}</span></p>
        </div>
      ) : (
        <div className="ap-form">
          <Field label="Imię klienta"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <div className="ap-form ap-form--2">
            <Field label="Telefon (opcjonalnie)"><input className="input" inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="E-mail (opcjonalnie)"><input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          </div>
        </div>
      )}
    </Modal>
  )
}
