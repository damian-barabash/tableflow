import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { errText } from '../app/api'
import { Badge, Ic, PageHead, Spinner, fmtAgo, useConfirm, useToast, EASE } from '../app/ui'
import { usePanel } from './PanelApp'
import { lookup, notifyWallet, redeem, stamp, type ScannedCard, type StampResult } from './loyalty/types'
import './scanner.css'

/** vibrate only after a user gesture (Chrome blocks it otherwise) */
const buzz = (p: number | number[]) => { if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) navigator.vibrate?.(p) }
type Cam = 'off' | 'starting' | 'on' | 'denied' | 'none'
interface Detector { detect: (src: HTMLVideoElement | HTMLCanvasElement) => Promise<{ rawValue: string }[]> }

export function ScannerPage() {
  const { canManage, company } = usePanel()
  const toast = useToast(), confirm = useConfirm()
  const loc = useLocation()
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const paused = useRef(false)
  const [cam, setCam] = useState<Cam>('off')
  const [manual, setManual] = useState('')
  const [card, setCard] = useState<ScannedCard | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<null | 'stamp' | 'reward'>(null)
  const [recent, setRecent] = useState<{ name: string; code: string; at: string; what: string }[]>([])

  const open = useCallback(async (raw: string) => {
    const v = raw.trim(); if (!v) return
    paused.current = true
    setLoading(true); setDone(null)
    try {
      const c = await lookup(v)
      if (c.company_id !== company.id) { toast('Ta karta należy do innej firmy', 'err'); paused.current = false; setLoading(false); return }
      setCard(c); buzz(35)
    } catch (e) { toast(errText(e) === 'Nie znaleziono.' ? 'Nie rozpoznano karty' : errText(e), 'err'); setTimeout(() => { paused.current = false }, 1200) }
    setLoading(false)
  }, [company.id, toast])

  // ?c=CODE (tableflow.pl/s?c=… scanned with the phone camera)
  useEffect(() => { const c = new URLSearchParams(loc.search).get('c'); if (c) void open(c) }, [loc.search, open])

  const stop = useCallback(() => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCam('off') }, [])
  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setCam('none'); return }
    setCam('starting')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      stream.current = s
      const v = video.current!; v.srcObject = s; v.setAttribute('playsinline', 'true'); await v.play()
      setCam('on')
    } catch (e) { setCam(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'none') }
  }, [])
  useEffect(() => () => stop(), [stop])
  useEffect(() => { if (window.matchMedia('(max-width: 900px)').matches) void start() }, [start])

  // detection loop: native BarcodeDetector (Chrome/Android) or jsQR fallback (Safari/iOS, Firefox)
  useEffect(() => {
    if (cam !== 'on') return
    let alive = true, raf = 0, last = 0
    let detector: Detector | null = null
    let jsqr: ((d: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts: string }) => { data: string } | null) | null = null
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }
    if (W.BarcodeDetector) { try { detector = new W.BarcodeDetector({ formats: ['qr_code'] }) } catch { detector = null } }
    if (!detector) void import('jsqr').then(m => { jsqr = m.default as unknown as typeof jsqr })
    const tick = async (t: number) => {
      if (!alive) return
      raf = requestAnimationFrame(tick)
      if (paused.current || t - last < 140) return
      last = t
      const v = video.current; if (!v || v.readyState < 2) return
      try {
        let text: string | null = null
        if (detector) { const r = await detector.detect(v); text = r[0]?.rawValue ?? null }
        else if (jsqr) {
          const c = canvas.current ?? (canvas.current = document.createElement('canvas'))
          const s = Math.min(1, 640 / v.videoWidth); c.width = v.videoWidth * s; c.height = v.videoHeight * s
          const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(v, 0, 0, c.width, c.height)
          text = jsqr(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' })?.data ?? null
        }
        if (text && !paused.current) void open(text)
      } catch { /* frame not ready */ }
    }
    raf = requestAnimationFrame(tick)
    return () => { alive = false; cancelAnimationFrame(raf) }
  }, [cam, open])

  const next = () => { setCard(null); setDone(null); setManual(''); paused.current = false }
  const apply = async (fnc: () => Promise<StampResult>, what: 'stamp' | 'reward', label: string, force?: () => Promise<StampResult>) => {
    if (!card) return
    setBusy(true)
    try {
      let r = await fnc()
      if (r.status === 'cooldown') {
        if (force && canManage && await confirm({ title: 'Pieczątka była przed chwilą', text: `Ta karta dostała pieczątkę niedawno — blokada jeszcze ${r.wait_minutes} min. Dodać mimo to?`, ok: 'Dodaj mimo to' })) r = await force()
        else { toast(`Blokada: jeszcze ${r.wait_minutes} min`, 'info'); setBusy(false); return }
      }
      if (r.status === 'ok') {
        setCard(r.card); setDone(what); buzz([40, 60, 40]); notifyWallet(r.card.id)
        setRecent(v => [{ name: r.card.name, code: r.card.code, at: new Date().toISOString(), what: label }, ...v].slice(0, 8))
      }
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }

  const req = card?.program.stamps_required ?? 10
  const max = Math.max(1, card?.program.rules?.max_per_scan ?? 3)
  const ready = card ? card.stamps >= req : false

  return (
    <>
      <PageHead title="Skaner pieczątek" sub="Zeskanuj kod QR z karty klienta (Apple/Google Wallet lub karta online) albo wpisz numer karty. Działa też z ręcznym czytnikiem kodów USB." />
      <div className="sc">
        <div className="sc__cam">
          <video ref={video} muted playsInline className={cam === 'on' ? 'is-on' : ''} />
          {cam === 'on' && <div className="sc__frame"><i /><i /><i /><i /><span className="sc__line" /></div>}
          {cam !== 'on' && (
            <div className="sc__camoff">
              <span className="sc__camico g"><Ic.camera width={26} height={26} /></span>
              <b>{cam === 'denied' ? 'Brak dostępu do aparatu' : cam === 'none' ? 'Aparat niedostępny' : 'Skanuj aparatem'}</b>
              <p>{cam === 'denied' ? 'Zezwól na dostęp do aparatu w ustawieniach przeglądarki albo wpisz numer karty.' : cam === 'none' ? 'To urządzenie nie ma aparatu — wpisz numer karty lub użyj czytnika USB.' : 'Na telefonie i laptopie z kamerą.'}</p>
              {cam !== 'none' && <button className="btn btn--primary btn--sm" onClick={start} disabled={cam === 'starting'}>{cam === 'starting' ? <Spinner size={14} /> : <Ic.camera width={15} height={15} />} Włącz aparat</button>}
            </div>
          )}
          {cam === 'on' && <button className="sc__stop" onClick={stop}>Wyłącz aparat</button>}
          {loading && <div className="sc__busy"><Spinner size={26} /></div>}
        </div>

        <div className="sc__side">
          <form className="sc__manual" onSubmit={e => { e.preventDefault(); void open(manual) }}>
            <label htmlFor="sc-code">Numer karty</label>
            <div className="ap-row" style={{ flexWrap: 'nowrap' }}>
              <input id="sc-code" className="input" placeholder="np. 7KQ2M9XD" value={manual} onChange={e => setManual(e.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus={!window.matchMedia('(max-width: 900px)').matches} />
              <button className="btn btn--primary" disabled={!manual.trim() || loading}>Szukaj</button>
            </div>
          </form>

          <AnimatePresence mode="wait">
            {card ? (
              <motion.div key={card.id} className="sc-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .35, ease: EASE }}>
                <div className="sc-card__head">
                  <div><b>{card.name || 'Klient'}</b><small>{card.program.name} · <span className="ap-mono">{card.code}</span></small></div>
                  {card.status === 'blocked' ? <Badge tone="err">Zablokowana</Badge> : ready ? <Badge tone="warn">Nagroda!</Badge> : <Badge tone="ok">Aktywna</Badge>}
                </div>
                <div className="sc-card__count">
                  <motion.b key={card.stamps} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: .45, ease: EASE }}>{Math.min(card.stamps, req)}</motion.b><span>/ {req}</span>
                </div>
                <div className="sc-card__dots">{Array.from({ length: req }, (_, i) => <motion.i key={i} className={i < card.stamps ? 'is-on g' : ''} initial={false} animate={i < card.stamps ? { scale: [1.5, 1] } : { scale: 1 }} transition={{ duration: .4, delay: i < card.stamps ? .02 * i : 0 }} />)}</div>
                <AnimatePresence>{done && <motion.div className="sc-card__done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Ic.check width={16} height={16} /> {done === 'reward' ? `Nagroda wydana: ${card.program.reward}` : 'Pieczątka dodana'}</motion.div>}</AnimatePresence>
                {ready && !done && <div className="sc-card__reward"><Ic.gift width={18} height={18} /><span>Klient ma komplet — wydaj nagrodę: <b>{card.program.reward}</b></span></div>}
                <div className="sc-card__actions">
                  {ready && <button className="btn btn--brand sc-big" disabled={busy} onClick={() => apply(() => redeem(card.id), 'reward', 'Nagroda')}><Ic.gift width={18} height={18} /> Wydaj nagrodę</button>}
                  <button className={`btn ${ready ? 'btn--ghost' : 'btn--primary'} sc-big`} disabled={busy || card.status !== 'active'} onClick={() => apply(() => stamp(card.id, 1), 'stamp', '+1 pieczątka', () => stamp(card.id, 1, true))}>{busy ? <Spinner size={16} /> : <Ic.plus width={18} height={18} />} Dodaj pieczątkę</button>
                  {max > 1 && <div className="sc-multi">{Array.from({ length: Math.min(max, 5) - 1 }, (_, i) => i + 2).map(n => <button key={n} className="btn btn--ghost btn--sm" disabled={busy || card.status !== 'active'} onClick={() => apply(() => stamp(card.id, n), 'stamp', `+${n} pieczątki`, () => stamp(card.id, n, true))}>+{n}</button>)}</div>}
                </div>
                <div className="sc-card__foot"><small>Ostatnia wizyta: {fmtAgo(card.last_stamp_at)} · nagród: {card.rewards_redeemed}</small><button className="btn btn--ghost btn--sm" onClick={next}><Ic.scan width={15} height={15} /> Następna karta</button></div>
              </motion.div>
            ) : (
              <motion.div key="idle" className="sc-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Ic.qr width={28} height={28} />
                <p>Poproś klienta o pokazanie karty w Apple Wallet, Google Wallet lub na stronie karty. Kod QR skanujesz aparatem albo wpisujesz numer spod kodu.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {recent.length > 0 && (
            <div className="sc-recent">
              <h4>Ostatnio w tej sesji</h4>
              <ul>{recent.map((r, i) => <li key={i}><button onClick={() => void open(r.code)}><b>{r.name || r.code}</b><span>{r.what}</span><small>{fmtAgo(r.at)}</small></button></li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
