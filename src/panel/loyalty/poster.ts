/**
 * Counter poster (A4 / A5 / A6) as one self-contained HTML document — used for the live preview (iframe srcdoc)
 * and for printing / "Save as PDF", so what the owner sees is exactly what gets printed.
 */
import { cssBackground, type Design } from '../../loyalty/design'

export type PosterSize = 'a4' | 'a5' | 'a6'
export const POSTER_MM: Record<PosterSize, [number, number]> = { a4: [210, 297], a5: [148, 210], a6: [105, 148] }

export interface PosterData {
  size: PosterSize
  design: Design
  company: string
  program: string
  reward: string
  required: number
  headline: string
  sub: string
  url: string
  qrSvg: string
  stripDataUrl: string
  print?: boolean
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const APPLE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.6-3.9zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.8-1.4z"/></svg>'
// Google Wallet mark: stacked cards in Google colours
const GWALLET = '<svg viewBox="0 0 48 48"><path fill="#4285F4" d="M8 14a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v4H8z"/><path fill="#34A853" d="M8 18h32v6H8z"/><path fill="#FBBC04" d="M8 24h32v6H8z"/><path fill="#EA4335" d="M8 30h32v4a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z"/><path fill="#fff" opacity=".95" d="M28 26c3-3 7-3 12 0v8a6 6 0 0 1-6 6h-8c-2-4-1.5-10 2-14z"/></svg>'
const MARK = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 44 L40 14M54 16 L42 28 L54 40M22 50 L32 40"/><circle cx="10" cy="30" r="4.6" fill="currentColor" stroke="none"/></svg>'
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.2'/></svg>")`

export function posterHtml(p: PosterData): string {
  const [W, H] = POSTER_MM[p.size]
  const k = W / 148                          // design is laid out on A5, scaled for A4/A6
  const u = (n: number) => `${(n * k).toFixed(2)}mm`
  const d = p.design
  const bg = cssBackground(d).replace(/"/g, "'")
  const shown = Math.min(3, p.required)
  const logo = d.logo_url ? `<img class="logo" src="${esc(d.logo_url)}" alt="" crossorigin="anonymous">` : ''
  const cardLogo = d.logo_url ? `<img src="${esc(d.logo_url)}" alt="" crossorigin="anonymous">` : ''
  const host = p.url.replace(/^https?:\/\//, '')

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Plakat — ${esc(p.program)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
@page { size: ${W}mm ${H}mm; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { background: ${p.print ? '#fff' : 'transparent'} }
body { font-family: Inter, system-ui, -apple-system, sans-serif; color: #1a1916; -webkit-print-color-adjust: exact; print-color-adjust: exact; -webkit-font-smoothing: antialiased }
.p { position: relative; width: ${W}mm; height: ${H}mm; overflow: hidden; background: #fbfaf8; }
.hero { position: absolute; left: 0; right: 0; top: 0; height: ${u(100)}; background: ${bg}; color: ${d.fg}; border-radius: 0 0 ${u(12)} ${u(12)}; overflow: hidden; }
.hero::before { content: ""; position: absolute; width: ${u(120)}; height: ${u(120)}; left: ${u(-40)}; top: ${u(-60)}; border-radius: 50%; background: radial-gradient(closest-side, rgba(255,255,255,.28), rgba(255,255,255,0)); }
.hero::after { content: ""; position: absolute; inset: 0; background-image: ${GRAIN}; background-size: ${u(40)} ${u(40)}; mix-blend-mode: soft-light; opacity: ${d.grain ? 1 : 0}; }
.hero > * { position: relative; z-index: 2 }
.top { display: flex; align-items: center; justify-content: space-between; padding: ${u(10)} ${u(11)} 0; }
.brand { display: flex; align-items: center; gap: ${u(3)}; font-weight: 600; font-size: ${u(4.4)}; letter-spacing: -.01em; }
.brand .logo { height: ${u(9)}; max-width: ${u(28)}; object-fit: contain; border-radius: ${u(2)}; }
.chip { font-size: ${u(2.6)}; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; padding: ${u(1.6)} ${u(3)}; border-radius: ${u(2.4)}; background: rgba(255,255,255,.16); border: ${u(.25)} solid rgba(255,255,255,.28); backdrop-filter: blur(4px); }
.copy { padding: ${u(9)} ${u(11)} 0; }
h1 { font-weight: 500; font-size: ${u(p.headline.length > 30 ? 9 : 10.5)}; line-height: 1.06; letter-spacing: -.03em; max-width: ${u(118)}; }
.sub { margin-top: ${u(3)}; font-size: ${u(3.8)}; line-height: 1.35; opacity: .92; max-width: ${u(110)}; }
.sub b { font-weight: 600 }
.card { position: absolute; left: 50%; top: ${u(67)}; width: ${u(90)}; transform: translateX(-50%) rotate(-3.5deg); border-radius: ${u(5)}; overflow: hidden; background: ${d.pass_bg}; color: ${d.fg}; box-shadow: 0 ${u(10)} ${u(22)} ${u(-8)} rgba(20,20,40,.55), 0 0 0 ${u(.2)} rgba(255,255,255,.12); z-index: 5; }
.card .ch { display: flex; align-items: center; justify-content: space-between; padding: ${u(3.2)} ${u(4)} ${u(2.6)}; }
.card .cl { display: flex; align-items: center; gap: ${u(2)}; font-weight: 600; font-size: ${u(3.6)}; }
.card .cl img { height: ${u(6)}; max-width: ${u(16)}; object-fit: contain; border-radius: ${u(1.2)}; }
.card .cc { text-align: right; }
.card small { display: block; font-size: ${u(1.9)}; font-weight: 600; letter-spacing: .1em; color: ${d.label}; }
.card .cc b { font-size: ${u(4.2)}; font-weight: 500; font-variant-numeric: tabular-nums; }
.card .strip { display: block; width: 100%; }
.card .cf { display: flex; justify-content: space-between; padding: ${u(2.6)} ${u(4)} ${u(3.4)}; }
.card .cf b { font-size: ${u(3.4)}; font-weight: 500; }
.bottom { position: absolute; left: 0; right: 0; top: ${u(132.5)}; bottom: ${u(15)}; display: grid; grid-template-columns: ${u(50)} 1fr; gap: ${u(7)}; padding: 0 ${u(11)}; align-items: center; }
.qr { position: relative; background: #fff; border-radius: ${u(5)}; padding: ${u(3.6)}; box-shadow: 0 ${u(4)} ${u(12)} ${u(-4)} rgba(26,25,22,.25), 0 0 0 ${u(.25)} #e9e8e5; }
.qr .code svg { display: block; width: 100%; height: auto; }
.qr span { display: block; text-align: center; margin-top: ${u(2)}; font-size: ${u(2.6)}; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #52504b; }
.steps { display: flex; flex-direction: column; gap: ${u(2.6)}; }
.step { display: flex; gap: ${u(3)}; align-items: flex-start; }
.step i { flex: 0 0 auto; width: ${u(6.4)}; height: ${u(6.4)}; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-weight: 600; font-size: ${u(3)}; color: #fff; background: ${bg}; }
.step b { display: block; font-size: ${u(3.6)}; font-weight: 600; letter-spacing: -.01em; }
.step span { display: block; font-size: ${u(2.7)}; color: #6b665e; margin-top: ${u(.4)}; line-height: 1.3; }
.badges { display: flex; flex-direction: column; gap: ${u(1.8)}; margin-top: ${u(1.2)}; }
.badge { display: flex; align-items: center; gap: ${u(2.4)}; height: ${u(10)}; padding: 0 ${u(3.2)}; border-radius: ${u(2.4)}; background: #000; color: #fff; width: ${u(47)}; }
.badge svg { width: ${u(6)}; height: ${u(6)}; flex: 0 0 auto; }
.badge div { line-height: 1.05; }
.badge small { display: block; font-size: ${u(2.1)}; opacity: .85; }
.badge b { display: block; font-size: ${u(3.4)}; font-weight: 600; letter-spacing: -.01em; }
.foot { position: absolute; left: ${u(11)}; right: ${u(11)}; bottom: ${u(6)}; display: flex; justify-content: space-between; align-items: center; font-size: ${u(2.5)}; color: #8a857d; border-top: ${u(.25)} solid #e9e8e5; padding-top: ${u(3)}; }
.foot b { color: #1a1916; font-weight: 600; }
.foot .tf { display: flex; align-items: center; gap: ${u(1.4)}; }
.foot .tf svg { width: ${u(3.4)}; height: ${u(3.4)}; color: #1a1916; }
.arrow { position: absolute; right: ${u(-8)}; top: ${u(-9)}; width: ${u(10)}; height: ${u(10)}; color: #1a1916; }
</style></head><body><div class="p">
  <section class="hero">
    <div class="top"><div class="brand">${logo}<span>${esc(p.company)}</span></div><span class="chip">Karta stałego klienta</span></div>
    <div class="copy"><h1>${esc(p.headline)}</h1><p class="sub">${esc(p.sub).replace(/\{n\}/g, `<b>${p.required}</b>`).replace(/\{reward\}/g, `<b>${esc(p.reward)}</b>`)}</p></div>
  </section>
  <div class="card">
    <div class="ch"><div class="cl">${cardLogo}<span>${esc(d.logo_text || p.company)}</span></div><div class="cc"><small>PIECZĄTKI</small><b>${shown}/${p.required}</b></div></div>
    <img class="strip" src="${p.stripDataUrl}" alt="">
    <div class="cf"><div><small>NAGRODA</small><b>${esc(p.reward)}</b></div><div style="text-align:right"><small>KARTA</small><b>${esc(p.program)}</b></div></div>
  </div>
  <section class="bottom">
    <div class="qr"><div class="code">${p.qrSvg}</div><span>Zeskanuj aparatem</span>
      <svg class="arrow" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M36 6C26 8 14 14 10 30"/><path d="M4 24l6 7 7-5"/></svg>
    </div>
    <div class="steps">
      <div class="step"><i>1</i><div><b>Zeskanuj kod</b><span>aparatem telefonu — bez aplikacji</span></div></div>
      <div class="step"><i>2</i><div><b>Podaj imię i telefon</b><span>karta od razu trafi do portfela</span></div></div>
      <div class="step"><i>3</i><div><b>Zbieraj pieczątki</b><span>${p.required} pieczątek = ${esc(p.reward)}</span></div></div>
      <div class="badges">
        <div class="badge">${APPLE}<div><small>Dodaj do</small><b>Apple Wallet</b></div></div>
        <div class="badge">${GWALLET}<div><small>Dodaj do</small><b>Google Wallet</b></div></div>
      </div>
    </div>
  </section>
  <footer class="foot"><span>${esc(host)}</span><span class="tf">${MARK}<span>Karta obsługiwana przez <b>TableFlow AI</b></span></span></footer>
</div>${p.print ? '<script>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))]).then(()=>setTimeout(()=>print(),250))</script>' : ''}</body></html>`
}
