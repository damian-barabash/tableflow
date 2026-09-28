import { useCallback, useEffect, useState } from 'react'
import { errText, fn, get } from '../../app/api'
import { Empty, Field, Ic, Panel, fmtDate, useConfirm, useToast, Badge } from '../../app/ui'
import { normalizeDesign } from '../../loyalty/design'
import { usePanel } from '../PanelApp'
import type { Program } from './types'

const SEGMENTS: { v: string; label: string; hint: string }[] = [
  { v: 'all', label: 'Wszyscy klienci', hint: 'Każda aktywna karta' },
  { v: 'wallet', label: 'Tylko z kartą w portfelu', hint: 'Apple / Google Wallet' },
  { v: 'near', label: 'Blisko nagrody', hint: 'Brakuje 1–2 pieczątek' },
  { v: 'ready', label: 'Nagroda do odbioru', hint: 'Zebrali komplet' },
  { v: 'inactive', label: 'Dawno nie było wizyty', hint: 'Brak pieczątki od 30 dni' },
  { v: 'new', label: 'Nowi klienci', hint: 'Karta z ostatnich 7 dni' },
]
const TEMPLATES = [
  { t: 'Tęsknimy!', b: 'Dawno Cię nie było — wpadnij w tym tygodniu, czeka na Ciebie pieczątka.' },
  { t: 'Podwójne pieczątki', b: 'Tylko w ten weekend: za każdą wizytę dostajesz 2 pieczątki.' },
  { t: 'Nagroda czeka', b: 'Masz komplet pieczątek — odbierz nagrodę przy następnej wizycie.' },
]
interface Msg { id: string; title: string; body: string; segment: string; cards: number; apple: number; google: number; created_at: string }

export function MessagesTab({ program }: { program: Program }) {
  const { company, wallet } = usePanel()
  const toast = useToast(), confirm = useConfirm()
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [segment, setSegment] = useState('all')
  const [count, setCount] = useState<{ cards: number; apple: number; google: number } | null>(null)
  const [history, setHistory] = useState<Msg[]>([])
  const [sending, setSending] = useState(false)
  const loadHistory = useCallback(async () => setHistory(await get<Msg[]>(`loyalty_messages?program_id=eq.${program.id}&order=created_at.desc&limit=30&select=*`).catch(() => [])), [program.id])
  useEffect(() => { void loadHistory() }, [loadHistory])
  useEffect(() => {
    setCount(null)
    const id = setTimeout(() => { void fn<{ cards: number; apple: number; google: number }>('wallet/message', { program_id: program.id, segment, body: 'x', dry_run: true }).then(setCount).catch(() => setCount(null)) }, 150)
    return () => clearTimeout(id)
  }, [program.id, segment])
  const d = normalizeDesign(program.design)

  const send = async () => {
    if (!count?.cards) { toast('Brak klientów w tej grupie', 'info'); return }
    if (!await confirm({ title: 'Wysłać powiadomienie?', text: <>Wiadomość trafi do <b>{count.cards}</b> kart ({count.apple} w Apple Wallet, {count.google} w Google Wallet). Pojawi się też na karcie online.</>, ok: 'Wyślij' })) return
    setSending(true)
    try {
      const r = await fn<{ cards: number; apple: number; google: number }>('wallet/message', { program_id: program.id, title, body, segment })
      toast(`Wysłano do ${r.cards} kart`); setTitle(''); setBody(''); void loadHistory()
    } catch (e) { toast(errText(e), 'err') }
    setSending(false)
  }

  return (
    <div className="ap-grid ap-grid--main">
      <div className="ap-stack">
        <Panel title="Nowe powiadomienie" sub="Pojawi się na ekranie blokady klientów, którzy mają kartę w Apple Wallet lub Google Wallet.">
          <div className="ap-form">
            {!(wallet?.apple || wallet?.google) && <div className="ap-note"><Ic.bell width={18} height={18} /><span>Integracje z portfelami są w konfiguracji. Wiadomość i tak zapisze się na kartach online klientów, a po włączeniu portfeli trafi też na ekran blokady.</span></div>}
            <div className="ly-templates">{TEMPLATES.map(t => <button key={t.t} onClick={() => { setTitle(t.t); setBody(t.b) }}>{t.t}</button>)}</div>
            <Field label="Tytuł (opcjonalnie)"><input className="input" maxLength={40} value={title} onChange={e => setTitle(e.target.value)} placeholder="Np. Podwójne pieczątki" /></Field>
            <Field label={`Treść · ${body.length}/200`} hint="Krótko i konkretnie — Google pozwala na 3 powiadomienia dziennie na kartę."><textarea className="input" maxLength={200} value={body} onChange={e => setBody(e.target.value)} placeholder="Co chcesz przekazać klientom?" /></Field>
            <div className="ly-segs">
              {SEGMENTS.map(s => <label key={s.v} className={`ly-seg ${segment === s.v ? 'is-on' : ''}`}><input type="radio" name="seg" checked={segment === s.v} onChange={() => setSegment(s.v)} /><b>{s.label}</b><small>{s.hint}</small></label>)}
            </div>
            <div className="ap-row ap-row--between">
              <span className="ap-muted">{count ? <>Odbiorcy: <b>{count.cards}</b> · Apple {count.apple} · Google {count.google}</> : 'Liczę odbiorców…'}</span>
              <button className="btn btn--primary btn--sm" onClick={send} disabled={sending || !body.trim()}>{sending ? 'Wysyłam…' : <>Wyślij <Ic.send width={14} height={14} /></>}</button>
            </div>
          </div>
        </Panel>
        <Panel title="Historia wysyłek">
          {history.length ? <ul className="ly-msgs">{history.map(m => (
            <li key={m.id}><div><b>{m.title || 'Wiadomość'}</b><p>{m.body}</p><small>{fmtDate(m.created_at, true)} · {SEGMENTS.find(s => s.v === m.segment)?.label}</small></div><span className="ap-chips"><Badge>{m.cards} kart</Badge>{m.apple > 0 && <Badge tone="dark">Apple {m.apple}</Badge>}{m.google > 0 && <Badge tone="brand">Google {m.google}</Badge>}</span></li>
          ))}</ul> : <Empty title="Nie wysłano jeszcze żadnej wiadomości" />}
        </Panel>
      </div>
      <Panel title="Podgląd na iPhonie">
        <div className="ly-lock">
          <div className="ly-lock__time">9:41</div>
          <div className="ly-lock__date">{new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div className="ly-notif">
            <span className="ly-notif__icon" style={{ background: d.pass_bg }}>{d.logo_url ? <img src={d.logo_url} alt="" /> : <b style={{ color: d.fg }}>{company.name[0]}</b>}</span>
            <div><div className="ly-notif__top"><b>{company.name}</b><small>teraz</small></div><p>{title ? `${title}: ` : ''}{body || 'Treść powiadomienia pojawi się tutaj.'}</p></div>
          </div>
        </div>
        <p className="ap-muted" style={{ marginTop: 12 }}>Przy każdej pieczątce klienci z Apple Wallet dostają też automatyczne powiadomienie z aktualnym stanem karty.</p>
      </Panel>
    </div>
  )
}
