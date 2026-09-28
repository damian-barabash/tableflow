import { useEffect, useRef, useState } from 'react'
import { cssAnimatedGradient, cssBackground, STAMP_ICONS, type Design, type StampIcon } from './design'
import { drawStrip, loadDesignImages } from './render'
import './card.css'

/** Canvas strip that re-renders on design/progress change (DPR-aware). */
export function StripCanvas({ design, total, filled, transparent = false, className = '' }: { design: Design; total: number; filled: number; transparent?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    const c = ref.current; if (!c) return
    const paint = async () => {
      const imgs = await loadDesignImages(design)
      if (!alive || !c) return
      const w = Math.max(200, c.clientWidth || 375), dpr = Math.min(3, window.devicePixelRatio || 1)
      c.width = Math.round(w * dpr); c.height = Math.round(w * 123 / 375 * dpr)
      drawStrip(c.getContext('2d')!, c.width, c.height, design, total, filled, imgs, transparent)
    }
    void paint()
    const ro = new ResizeObserver(() => void paint()); ro.observe(c)
    return () => { alive = false; ro.disconnect() }
  }, [design, total, filled, transparent])
  return <canvas ref={ref} className={`lc-strip ${className}`} aria-label={`${filled} z ${total} pieczątek`} role="img" />
}

/** QR as inline SVG (qrcode is lazy-loaded). */
export function useQrSvg(text: string | null, dark = '#000000') {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    if (!text) return
    let alive = true
    import('qrcode').then(m => m.default.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark, light: '#0000' } })).then(s => { if (alive) setSvg(s) })
    return () => { alive = false }
  }, [text, dark])
  return svg
}
export function Qr({ text, className = '', dark }: { text: string; className?: string; dark?: string }) {
  const svg = useQrSvg(text, dark)
  return <span className={`lc-qr ${className}`} dangerouslySetInnerHTML={{ __html: svg }} aria-label="Kod QR" role="img" />
}

export function StampGlyph({ icon, size = 20, color = 'currentColor' }: { icon: StampIcon; size?: number; color?: string }) {
  const ic = STAMP_ICONS[icon]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={'w' in ic ? ic.w : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ic.d} />{'dots' in ic && ic.dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={('w' in ic ? ic.w : 1.9) * .55} fill={color} stroke="none" />)}
    </svg>
  )
}

export interface CardData { name: string; reward: string; required: number; company: string; stamps: number; customer?: string; code?: string; qr?: string }

/** Apple Wallet store card look-alike (what the pass will look like on iPhone). */
export function ApplePass({ design, data }: { design: Design; data: CardData }) {
  const shown = Math.min(data.stamps, data.required), ready = Math.floor(data.stamps / data.required)
  return (
    <div className="lc-apple" style={{ background: design.pass_bg, color: design.fg }}>
      <div className="lc-apple__top">
        <div className="lc-apple__logo">{design.logo_url && <img src={design.logo_url} alt="" crossOrigin="anonymous" />}{design.logo_text && <span>{design.logo_text}</span>}</div>
        <div className="lc-field lc-field--r"><small style={{ color: design.label }}>PIECZĄTKI</small><b>{shown}/{data.required}</b></div>
      </div>
      <StripCanvas design={design} total={data.required} filled={shown} />
      <div className="lc-apple__fields">
        <div className="lc-field"><small style={{ color: design.label }}>KLIENT</small><b>{data.customer || 'Anna Kowalska'}</b></div>
        <div className="lc-field lc-field--r"><small style={{ color: design.label }}>NAGRODA</small><b>{data.reward}</b></div>
      </div>
      {ready > 0 && <div className="lc-apple__fields"><div className="lc-field"><small style={{ color: design.label }}>DO ODEBRANIA</small><b>{ready} {ready === 1 ? 'nagroda' : 'nagrody'}</b></div></div>}
      <div className="lc-apple__qr"><div><Qr text={data.qr || 'https://tableflow.pl/s?c=DEMO2345'} /><small>{data.code || 'DEMO2345'}</small></div></div>
    </div>
  )
}

/** Google Wallet loyalty card look-alike. */
export function GooglePass({ design, data }: { design: Design; data: CardData }) {
  const shown = Math.min(data.stamps, data.required), ready = Math.floor(data.stamps / data.required)
  return (
    <div className="lc-google" style={{ background: design.pass_bg, color: design.fg }}>
      <div className="lc-google__head">
        <span className="lc-google__logo" style={{ background: design.pass_bg }}>{design.logo_url ? <img src={design.logo_url} alt="" crossOrigin="anonymous" /> : <b>{data.company.trim()[0]?.toUpperCase()}</b>}</span>
        <span>{data.company}</span>
      </div>
      <h4>{data.name}</h4>
      <div className="lc-google__row">
        <div><small>Pieczątki</small><b>{shown}/{data.required}</b></div>
        <div><small>Nagrody</small><b>{ready}</b></div>
      </div>
      <div className="lc-google__qr"><Qr text={data.qr || 'https://tableflow.pl/s?c=DEMO2345'} /><small>{data.code || 'DEMO2345'}</small></div>
      <StripCanvas design={design} total={data.required} filled={shown} />
    </div>
  )
}

/** Web card (customer page): the brand gradient can move here — wallets can't animate. */
export function WebCard({ design, data, pulse }: { design: Design; data: CardData; pulse?: boolean }) {
  const shown = Math.min(data.stamps, data.required), ready = data.stamps >= data.required
  const animated = design.animated && design.bg_mode === 'gradient'
  return (
    <div className={`lc-web ${animated ? 'is-anim' : ''} ${design.grain ? 'grain' : ''} ${pulse ? 'is-pulse' : ''}`} style={{ background: animated ? cssAnimatedGradient(design) : cssBackground(design), backgroundSize: animated ? '300% 300%' : undefined, color: design.fg }}>
      <div className="lc-web__top">
        <div className="lc-web__logo">{design.logo_url && <img src={design.logo_url} alt="" crossOrigin="anonymous" />}<span>{design.logo_text || data.company}</span></div>
        <div className="lc-web__count"><small style={{ color: design.label }}>Pieczątki</small><b>{shown}<em>/{data.required}</em></b></div>
      </div>
      <StripCanvas design={design} total={data.required} filled={shown} transparent className="lc-web__strip" />
      <div className="lc-web__bottom">
        <div><small style={{ color: design.label }}>{ready ? 'Nagroda czeka!' : 'Nagroda'}</small><b>{data.reward}</b></div>
        {data.customer && <div className="lc-web__who"><small style={{ color: design.label }}>Klient</small><b>{data.customer}</b></div>}
      </div>
    </div>
  )
}
