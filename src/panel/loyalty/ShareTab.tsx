import { useState } from 'react'
import { Ic, Panel, Segmented, useCopy } from '../../app/ui'
import { normalizeDesign, cssBackground } from '../../loyalty/design'
import { Qr, WebCard, useQrSvg } from '../../loyalty/CardVisual'
import { usePanel } from '../PanelApp'
import { joinUrl, type Program } from './types'

export function ShareTab({ program }: { program: Program }) {
  const { company } = usePanel()
  const copy = useCopy()
  const url = joinUrl(program.slug)
  const svg = useQrSvg(url)
  const [size, setSize] = useState<'a5' | 'a4'>('a5')
  const [headline, setHeadline] = useState('Zbieraj pieczątki w telefonie')
  const d = normalizeDesign(program.design)

  const downloadSvg = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([svg.replace('<svg', '<svg width="1024" height="1024" style="background:#fff"')], { type: 'image/svg+xml' })); a.download = `qr-${program.slug}.svg`; a.click()
  }
  const downloadPng = async () => {
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg', '<svg width="1024" height="1024"'))
    await img.decode()
    const c = document.createElement('canvas'); c.width = c.height = 1120
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1120, 1120); ctx.drawImage(img, 48, 48, 1024, 1024)
    c.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `qr-${program.slug}.png`; a.click() })
  }
  const print = () => {
    const w = window.open('', '_blank', 'width=900,height=1100'); if (!w) return
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
    w.document.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Plakat — ${esc(program.name)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<style>@page{size:${size.toUpperCase()};margin:0}*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;color:#1a1916;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.p{width:${size === 'a5' ? '148mm' : '210mm'};height:${size === 'a5' ? '210mm' : '297mm'};display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:${size === 'a5' ? '14mm' : '20mm'};text-align:center;overflow:hidden}
.band{width:100%;border-radius:8mm;padding:${size === 'a5' ? '9mm' : '13mm'};color:${d.fg};background:${cssBackground(d)}}
.band small{display:block;font-size:${size === 'a5' ? 9 : 12}pt;letter-spacing:.12em;text-transform:uppercase;opacity:.85}
.band h1{margin:3mm 0 0;font-weight:500;font-size:${size === 'a5' ? 22 : 32}pt;letter-spacing:-.02em;line-height:1.1}
.band p{margin:3mm 0 0;font-size:${size === 'a5' ? 11 : 15}pt}
.qr{width:${size === 'a5' ? '66mm' : '96mm'};height:${size === 'a5' ? '66mm' : '96mm'}}.qr svg{width:100%;height:100%}
.steps{display:flex;gap:6mm;font-size:${size === 'a5' ? 9.5 : 12.5}pt;color:#52504b}.steps b{display:block;color:#1a1916;font-size:${size === 'a5' ? 12 : 16}pt}
.foot{font-size:${size === 'a5' ? 8 : 10}pt;color:#8a857d}</style></head><body><div class="p">
<div class="band"><small>${esc(company.name)}</small><h1>${esc(headline)}</h1><p>${program.stamps_required} pieczątek = ${esc(program.reward)}</p></div>
<div class="qr">${svg}</div>
<div class="steps"><div><b>1. Zeskanuj</b>aparatem telefonu</div><div><b>2. Dodaj kartę</b>do Apple lub Google Wallet</div><div><b>3. Zbieraj</b>pieczątki przy kasie</div></div>
<div class="foot">${esc(url.replace(/^https?:\/\//, ''))} · karta obsługiwana przez TableFlow AI</div></div>
<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))</script></body></html>`)
    w.document.close()
  }

  return (
    <div className="ap-grid ap-grid--2">
      <div className="ap-stack">
        {program.status !== 'active' && <div className="ap-note ap-note--warn"><Ic.lock width={18} height={18} /><span>Program nie jest opublikowany — klienci zobaczą informację, że karta jest nieaktywna. Opublikuj ją w zakładce „Projekt karty”.</span></div>}
        <Panel title="Link do karty" sub="Wstaw na Instagram, Google Maps, stronę www lub wyślij SMS-em.">
          <div className="ap-secret"><span>{url}</span><button onClick={() => copy(url, 'Skopiowano link')} aria-label="Kopiuj"><Ic.copy width={16} height={16} /></button></div>
          <div className="ap-row" style={{ marginTop: 12 }}><a className="btn btn--ghost btn--sm" href={url} target="_blank" rel="noreferrer"><Ic.external width={14} height={14} /> Otwórz jako klient</a></div>
        </Panel>
        <Panel title="Kod QR" sub="Do druku na ulotkach, paragonach, naklejkach na drzwi.">
          <div className="ly-qr-big">{svg ? <Qr text={url} /> : null}</div>
          <div className="ap-row"><button className="btn btn--ghost btn--sm" onClick={downloadPng}><Ic.download width={14} height={14} /> PNG</button><button className="btn btn--ghost btn--sm" onClick={downloadSvg}><Ic.download width={14} height={14} /> SVG (do druku)</button></div>
        </Panel>
      </div>
      <Panel title="Plakat przy kasie" actions={<Segmented value={size} onChange={setSize} options={[{ v: 'a5', label: 'A5' }, { v: 'a4', label: 'A4' }]} size="sm" />}>
        <div className="ly-poster">
          <div className="ly-poster__band" style={{ background: cssBackground(d), color: d.fg }}><small>{company.name}</small><input value={headline} onChange={e => setHeadline(e.target.value)} aria-label="Nagłówek plakatu" style={{ color: d.fg }} /><p>{program.stamps_required} pieczątek = {program.reward}</p></div>
          <div className="ly-poster__qr"><Qr text={url} /></div>
          <div className="ly-poster__steps"><span><b>1. Zeskanuj</b>aparatem</span><span><b>2. Dodaj kartę</b>do portfela</span><span><b>3. Zbieraj</b>pieczątki</span></div>
        </div>
        <div className="ap-row" style={{ marginTop: 14 }}><button className="btn btn--primary btn--sm" onClick={print}><Ic.print width={15} height={15} /> Drukuj plakat {size.toUpperCase()}</button><span className="ap-muted">Nagłówek możesz edytować na podglądzie.</span></div>
        <div style={{ marginTop: 20 }}><WebCard design={d} data={{ name: program.name, reward: program.reward, required: program.stamps_required, company: company.name, stamps: 1 }} /></div>
      </Panel>
    </div>
  )
}
