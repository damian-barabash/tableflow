import { useEffect, useMemo, useRef, useState } from 'react'
import { Field, Ic, Panel, Segmented, useCopy, useToast } from '../../app/ui'
import { normalizeDesign } from '../../loyalty/design'
import { Qr, useQrSvg } from '../../loyalty/CardVisual'
import { drawStrip, loadDesignImages } from '../../loyalty/render'
import { usePanel } from '../PanelApp'
import { POSTER_MM, posterHtml, type PosterSize } from './poster'
import { joinUrl, type Program } from './types'

const MM = 96 / 25.4   // CSS px per mm

export function ShareTab({ program }: { program: Program }) {
  const { company } = usePanel()
  const copy = useCopy(), toast = useToast()
  const url = joinUrl(program.slug)
  const svg = useQrSvg(url)
  const d = useMemo(() => normalizeDesign(program.design), [program.design])
  const [size, setSize] = useState<PosterSize>('a5')
  const [headline, setHeadline] = useState('Zbieraj pieczątki w telefonie')
  const [sub, setSub] = useState('Zbierz {n} pieczątek i odbierz {reward}. Karta w Apple Wallet lub Google Wallet — bez aplikacji.')
  const [strip, setStrip] = useState('')

  // the same stamp strip the wallets show (3 collected), rendered once per design
  useEffect(() => {
    let alive = true
    void loadDesignImages(d).then(imgs => {
      const c = document.createElement('canvas'); c.width = 1125; c.height = 369
      drawStrip(c.getContext('2d')!, 1125, 369, d, program.stamps_required, Math.min(3, program.stamps_required), imgs)
      if (alive) setStrip(c.toDataURL('image/png'))
    })
    return () => { alive = false }
  }, [d, program.stamps_required])

  const data = { size, design: d, company: company.name, program: program.name, reward: program.reward, required: program.stamps_required, headline, sub, url, qrSvg: svg, stripDataUrl: strip }
  const html = useMemo(() => (svg && strip ? posterHtml(data) : ''), [svg, strip, size, headline, sub, d, company.name, program.name, program.reward, program.stamps_required, url]) // eslint-disable-line react-hooks/exhaustive-deps

  // preview: the real print document in an iframe, scaled to the column width
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(.5)
  const [W, H] = POSTER_MM[size]
  useEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / (W * MM))))
    ro.observe(el); return () => ro.disconnect()
  }, [W])

  const print = () => {
    if (!html) return
    const w = window.open('', '_blank')
    if (!w) { toast('Przeglądarka zablokowała nowe okno — zezwól na wyskakujące okna', 'err'); return }
    w.document.open(); w.document.write(posterHtml({ ...data, print: true })); w.document.close()
  }
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

  return (
    <div className="ly-share">
      <Panel title="Plakat przy kasie" sub="Podgląd = wydruk. Drukuj od razu albo zapisz jako PDF w oknie drukowania."
        actions={<Segmented value={size} onChange={setSize} options={[{ v: 'a4', label: 'A4' }, { v: 'a5', label: 'A5' }, { v: 'a6', label: 'A6' }]} size="sm" />}>
        {program.status !== 'active' && <div className="ap-note ap-note--warn" style={{ marginBottom: 14 }}><Ic.lock width={18} height={18} /><span>Program nie jest opublikowany — po zeskanowaniu klient zobaczy, że karta jest nieaktywna. Opublikuj ją w zakładce „Projekt karty”.</span></div>}
        <div className="ly-poster-wrap" ref={box} style={{ height: H * MM * scale }}>
          {html ? <iframe title="Podgląd plakatu" className="ly-poster-frame" srcDoc={html} style={{ width: W * MM, height: H * MM, transform: `scale(${scale})` }} /> : <div className="ap-loading">Przygotowuję plakat…</div>}
        </div>
      </Panel>
      <div className="ap-stack">
        <Panel title="Treść plakatu">
          <div className="ap-form">
            <Field label="Nagłówek"><input className="input" maxLength={60} value={headline} onChange={e => setHeadline(e.target.value)} /></Field>
            <Field label="Podtytuł" hint="{n} = liczba pieczątek, {reward} = nagroda"><textarea className="input" maxLength={160} value={sub} onChange={e => setSub(e.target.value)} /></Field>
            <div className="ly-templates">
              {['Zbieraj pieczątki w telefonie', 'Co 10. kawa gratis', 'Twoja karta stałego klienta', 'Wracaj i zyskuj'].map(t => <button key={t} onClick={() => setHeadline(t)}>{t}</button>)}
            </div>
            <button className="btn btn--primary" onClick={print} disabled={!html}><Ic.print width={16} height={16} /> Drukuj / zapisz PDF ({size.toUpperCase()})</button>
          </div>
        </Panel>
        <Panel title="Link do karty" sub="Instagram, Google Maps, strona www, SMS.">
          <div className="ap-secret"><span>{url}</span><button onClick={() => copy(url, 'Skopiowano link')} aria-label="Kopiuj"><Ic.copy width={16} height={16} /></button></div>
          <div className="ap-row" style={{ marginTop: 12 }}><a className="btn btn--ghost btn--sm" href={url} target="_blank" rel="noreferrer"><Ic.external width={14} height={14} /> Otwórz jako klient</a></div>
        </Panel>
        <Panel title="Sam kod QR" sub="Na naklejki, paragony, ulotki.">
          <div className="ly-qr-row"><div className="ly-qr-mini"><Qr text={url} /></div>
            <div className="ap-row"><button className="btn btn--ghost btn--sm" onClick={downloadPng}><Ic.download width={14} height={14} /> PNG</button><button className="btn btn--ghost btn--sm" onClick={downloadSvg}><Ic.download width={14} height={14} /> SVG</button></div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
