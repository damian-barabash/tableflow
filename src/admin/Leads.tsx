import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errText, get, remove, update } from '../app/api'
import { Badge, Empty, Field, Ic, Loading, Menu, Modal, PageHead, Panel, fmtDate, useConfirm, useCopy, useToast } from '../app/ui'

export interface Lead {
  id: string; email: string | null; phone: string | null; locale: string; business_type: string | null; company: string | null; source: string
  consent_marketing: boolean; consent_at: string | null; utm: Record<string, string>; user_agent: string | null; status: 'pending' | 'confirmed' | 'unsubscribed'; notes: string | null; created_at: string
}
const STATUS: Record<Lead['status'], { label: string; tone: 'brand' | 'ok' | 'neutral' }> = { pending: { label: 'Nowe', tone: 'brand' }, confirmed: { label: 'Skontaktowano', tone: 'ok' }, unsubscribed: { label: 'Wypisane', tone: 'neutral' } }
const SOURCE: Record<string, string> = { landing: 'Formularz na stronie', card: 'Karta demo (QR)' }

export function Leads({ onChange }: { onChange: () => void }) {
  const toast = useToast(), confirm = useConfirm(), copy = useCopy(), nav = useNavigate()
  const [rows, setRows] = useState<Lead[] | null>(null)
  const [q, setQ] = useState(''); const [st, setSt] = useState<'all' | Lead['status']>('all'); const [src, setSrc] = useState('all')
  const [open, setOpen] = useState<Lead | null>(null)
  const load = useCallback(async () => setRows(await get<Lead[]>('waitlist_subscribers?select=*&order=created_at.desc&limit=5000').catch(() => [])), [])
  useEffect(() => { void load() }, [load])
  const list = useMemo(() => (rows ?? []).filter(r => (st === 'all' || r.status === st) && (src === 'all' || r.source === src) && (!q || [r.email, r.phone, r.company, r.business_type, r.notes].some(v => v?.toLowerCase().includes(q.toLowerCase())))), [rows, q, st, src])
  const sources = useMemo(() => [...new Set((rows ?? []).map(r => r.source))], [rows])

  const setStatus = async (r: Lead, status: Lead['status']) => {
    try { await update('waitlist_subscribers', `id=eq.${r.id}`, { status }); setRows(v => v?.map(x => x.id === r.id ? { ...x, status } : x) ?? null); setOpen(o => o && o.id === r.id ? { ...o, status } : o); onChange() } catch (e) { toast(errText(e), 'err') }
  }
  const del = async (r: Lead) => {
    if (!await confirm({ title: 'Usunąć zgłoszenie?', text: `${r.email ?? r.phone} zostanie trwale usunięty (np. na prośbę o usunięcie danych — RODO).`, ok: 'Usuń', danger: true })) return
    try { await remove('waitlist_subscribers', `id=eq.${r.id}`); setRows(v => v?.filter(x => x.id !== r.id) ?? null); setOpen(null); onChange(); toast('Usunięto') } catch (e) { toast(errText(e), 'err') }
  }
  const csv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['E-mail', 'Telefon', 'Firma', 'Branża', 'Język', 'Źródło', 'Status', 'Zgoda', 'UTM', 'Notatki', 'Data']
    const body = list.map(r => [r.email, r.phone ? `+${r.phone}` : '', r.company, r.business_type, r.locale, r.source, STATUS[r.status].label, r.consent_marketing ? 'tak' : 'nie', Object.entries(r.utm ?? {}).map(([k, v]) => `${k}=${v}`).join('&'), r.notes, r.created_at])
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + [head, ...body].map(x => x.map(esc).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })); a.download = `zgloszenia-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  return (
    <>
      <PageHead title="Zgłoszenia" chip={rows ? String(rows.length) : undefined} sub="Wszystkie zapisy z formularzy: lista oczekujących na stronie i karta demo z kodu QR."
        actions={<button className="btn btn--ghost btn--sm" onClick={csv} disabled={!list.length}><Ic.download width={15} height={15} /> Eksport CSV</button>} />
      {!rows ? <Loading /> : (
        <Panel pad>
          <div className="ap-row" style={{ marginBottom: 14 }}>
            <label className="ap-search"><Ic.search width={16} height={16} /><input className="input" placeholder="Szukaj: e-mail, telefon, firma" value={q} onChange={e => setQ(e.target.value)} /></label>
            <select className="input ap-select" value={st} onChange={e => setSt(e.target.value as typeof st)}><option value="all">Każdy status</option>{(Object.keys(STATUS) as Lead['status'][]).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
            <select className="input ap-select" value={src} onChange={e => setSrc(e.target.value)}><option value="all">Każde źródło</option>{sources.map(s => <option key={s} value={s}>{SOURCE[s] ?? s}</option>)}</select>
          </div>
          {!list.length ? <Empty icon={<Ic.inbox width={22} height={22} />} title={rows.length ? 'Brak wyników' : 'Brak zgłoszeń'} text={rows.length ? undefined : 'Gdy ktoś zapisze się na listę oczekujących, zobaczysz to tutaj.'} /> : (
            <div className="ap-table-wrap"><table className="ap-table">
              <thead><tr><th>Kontakt</th><th className="ap-table-hide-sm">Firma</th><th className="ap-table-hide-sm">Źródło</th><th>Status</th><th className="ap-table-hide-sm">Data</th><th /></tr></thead>
              <tbody>{list.map(r => (
                <tr key={r.id} className="is-click" onClick={() => setOpen(r)}>
                  <td><b style={{ fontWeight: 500 }}>{r.email ?? (r.phone ? `+${r.phone}` : '—')}</b><small>{r.locale.toUpperCase()}{r.consent_marketing ? ' · zgoda marketingowa' : ''}</small></td>
                  <td className="ap-table-hide-sm">{r.company || '—'}<small>{r.business_type}</small></td>
                  <td className="ap-table-hide-sm">{SOURCE[r.source] ?? r.source}{r.utm?.utm_source && <small>utm: {r.utm.utm_source}</small>}</td>
                  <td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
                  <td className="ap-table-hide-sm">{fmtDate(r.created_at, true)}</td>
                  <td className="num" onClick={e => e.stopPropagation()}><Menu items={[
                    r.status !== 'confirmed' && { label: 'Oznacz: skontaktowano', onClick: () => void setStatus(r, 'confirmed') },
                    r.status !== 'pending' && { label: 'Oznacz: nowe', onClick: () => void setStatus(r, 'pending') },
                    { label: 'Utwórz firmę z tego zgłoszenia', icon: <Ic.building width={15} height={15} />, onClick: () => nav(`/admin/firmy?nowa=1&lead=${r.id}`) },
                    r.email ? { label: 'Kopiuj e-mail', icon: <Ic.copy width={15} height={15} />, onClick: () => void copy(r.email!) } : null,
                    { label: 'Usuń (RODO)', icon: <Ic.trash width={15} height={15} />, danger: true, onClick: () => void del(r) },
                  ]} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Panel>
      )}
      <LeadModal lead={open} onClose={() => setOpen(null)} onStatus={setStatus} onDelete={del} onSaved={l => { setRows(v => v?.map(x => x.id === l.id ? l : x) ?? null); setOpen(l) }} />
    </>
  )
}

function LeadModal({ lead, onClose, onStatus, onDelete, onSaved }: { lead: Lead | null; onClose: () => void; onStatus: (l: Lead, s: Lead['status']) => void; onDelete: (l: Lead) => void; onSaved: (l: Lead) => void }) {
  const toast = useToast(), nav = useNavigate()
  const [notes, setNotes] = useState('')
  useEffect(() => setNotes(lead?.notes ?? ''), [lead])
  if (!lead) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const saveNotes = async () => { try { await update('waitlist_subscribers', `id=eq.${lead.id}`, { notes: notes || null }); onSaved({ ...lead, notes: notes || null }); toast('Zapisano notatkę') } catch (e) { toast(errText(e), 'err') } }
  return (
    <Modal open={!!lead} onClose={onClose} wide title={lead.email ?? (lead.phone ? `+${lead.phone}` : 'Zgłoszenie')} sub={`${SOURCE[lead.source] ?? lead.source} · ${fmtDate(lead.created_at, true)}`}
      footer={<><button className="btn btn--ghost btn--sm" style={{ color: '#b1321f' }} onClick={() => onDelete(lead)}>Usuń</button><span style={{ flex: 1 }} /><button className="btn btn--ghost btn--sm" onClick={() => nav(`/admin/firmy?nowa=1&lead=${lead.id}`)}><Ic.building width={14} height={14} /> Utwórz firmę</button>{lead.status === 'pending' ? <button className="btn btn--primary btn--sm" onClick={() => onStatus(lead, 'confirmed')}>Oznacz: skontaktowano</button> : <button className="btn btn--ghost btn--sm" onClick={() => onStatus(lead, 'pending')}>Oznacz jako nowe</button>}</>}>
      <dl className="ap-kv">
        <dt>Status</dt><dd><Badge tone={STATUS[lead.status].tone}>{STATUS[lead.status].label}</Badge></dd>
        <dt>E-mail</dt><dd>{lead.email ? <a href={`mailto:${lead.email}`} className="link--accent">{lead.email}</a> : '—'}</dd>
        <dt>Telefon</dt><dd>{lead.phone ? <a href={`tel:+${lead.phone}`}>+{lead.phone}</a> : '—'}</dd>
        <dt>Firma</dt><dd>{lead.company || '—'}</dd>
        <dt>Branża</dt><dd>{lead.business_type || '—'}</dd>
        <dt>Język strony</dt><dd>{lead.locale.toUpperCase()}</dd>
        <dt>Zgoda</dt><dd>{lead.consent_marketing ? `tak — ${fmtDate(lead.consent_at, true)}` : 'nie'}</dd>
        {Object.keys(lead.utm ?? {}).length > 0 && <><dt>UTM</dt><dd className="ap-mono">{Object.entries(lead.utm).map(([k, v]) => `${k}=${v}`).join(' · ')}</dd></>}
        {lead.user_agent && <><dt>Urządzenie</dt><dd className="ap-muted">{lead.user_agent.slice(0, 140)}</dd></>}
      </dl>
      <Field label="Notatki zespołu"><textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Np. rozmowa 12.10, zainteresowani kartą lojalnościową…" /></Field>
      <div className="ap-row ap-row--end"><button className="btn btn--ghost btn--sm" disabled={notes === (lead.notes ?? '')} onClick={saveNotes}>Zapisz notatkę</button></div>
    </Modal>
  )
}
