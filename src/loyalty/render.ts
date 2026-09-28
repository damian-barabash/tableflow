/**
 * Canvas renderer for the stamp "strip": the same drawing is used for the live preview,
 * the customer web card and the PNGs uploaded for Apple Wallet (strip 375×123 pt) and Google Wallet (hero).
 */
import { STAMP_ICONS, type Design, type StampIcon } from './design'

export interface Imgs { bg?: HTMLImageElement | null; logo?: HTMLImageElement | null; stamp?: HTMLImageElement | null; empty?: HTMLImageElement | null }

const cache = new Map<string, Promise<HTMLImageElement | null>>()
export function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  if (!cache.has(url)) {
    cache.set(url, new Promise(resolve => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.onload = () => resolve(img)
      img.onerror = () => { cache.delete(url); resolve(null) }
      img.src = url
    }))
  }
  return cache.get(url)!
}
export async function loadDesignImages(d: Design): Promise<Imgs> {
  const [bg, logo, stamp, empty] = await Promise.all([loadImage(d.bg_mode === 'image' ? d.bg_image : null), loadImage(d.logo_url), loadImage(d.stamp_img), loadImage(d.empty_img)])
  return { bg, logo, stamp, empty }
}

// ---------- primitives ----------
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const iw = img.naturalWidth * s, ih = img.naturalHeight * s
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
}
function contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, align: 'left' | 'center' = 'center') {
  const s = Math.min(w / (img.naturalWidth || w), h / (img.naturalHeight || h))
  const iw = (img.naturalWidth || w) * s, ih = (img.naturalHeight || h) * s
  ctx.drawImage(img, align === 'left' ? x : x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
}
/** CSS-like linear-gradient(angle) across the box. */
function linear(ctx: CanvasRenderingContext2D, W: number, H: number, angle: number, stops: string[]) {
  const a = (angle * Math.PI) / 180
  const dx = Math.sin(a), dy = -Math.cos(a)
  const len = Math.abs(W * dx) + Math.abs(H * dy)
  const cx = W / 2, cy = H / 2
  const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2)
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c))
  return g
}
let grainTile: HTMLCanvasElement | null = null
function grain(ctx: CanvasRenderingContext2D, W: number, H: number, scale: number) {
  if (!grainTile) {
    grainTile = document.createElement('canvas'); grainTile.width = grainTile.height = 160
    const g = grainTile.getContext('2d')!, id = g.createImageData(160, 160)
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < id.data.length; i += 4) { const v = rnd() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 60 }
    g.putImageData(id, 0, 0)
  }
  ctx.save()
  ctx.globalCompositeOperation = 'soft-light'
  ctx.globalAlpha = .55
  const pat = ctx.createPattern(grainTile, 'repeat')!
  pat.setTransform(new DOMMatrix().scale(Math.max(1, scale / 2)))
  ctx.fillStyle = pat
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}
function shapePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, shape: Design['stamp_shape']) {
  ctx.beginPath()
  if (shape === 'rounded') ctx.roundRect(cx - r, cy - r, 2 * r, 2 * r, r * .38)
  else ctx.arc(cx, cy, r, 0, Math.PI * 2)
}
export function drawIcon(ctx: CanvasRenderingContext2D, key: StampIcon, cx: number, cy: number, size: number, color: string, alpha = 1) {
  const ic = STAMP_ICONS[key] ?? STAMP_ICONS.star
  const s = size / 24
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.translate(cx - size / 2, cy - size / 2)
  ctx.scale(s, s)
  ctx.strokeStyle = color; ctx.fillStyle = color
  ctx.lineWidth = 'w' in ic ? ic.w : 1.9
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(ic.d))
  if ('dots' in ic) for (const [x, y] of ic.dots) { ctx.beginPath(); ctx.arc(x, y, ('w' in ic ? ic.w : 1.9) * .55, 0, Math.PI * 2); ctx.fill() }
  ctx.restore()
}

function drawStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, d: Design, on: boolean, imgs: Imgs) {
  const shape = d.stamp_shape
  if (on) {
    if (imgs.stamp) {
      ctx.save(); shapePath(ctx, cx, cy, r, shape); ctx.clip(); cover(ctx, imgs.stamp, cx - r, cy - r, 2 * r, 2 * r); ctx.restore()
      return
    }
    if (d.stamp_style === 'icon') { drawIcon(ctx, d.stamp_icon, cx, cy, r * 1.75, d.stamp_color); return }
    ctx.save()
    if (d.stamp_style === 'filled') {
      ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = r * .35; ctx.shadowOffsetY = r * .08
      shapePath(ctx, cx, cy, r, shape); ctx.fillStyle = d.stamp_color; ctx.fill()
      ctx.restore()
      drawIcon(ctx, d.stamp_icon, cx, cy, r * 1.15, d.stamp_icon_color)
    } else {
      shapePath(ctx, cx, cy, r * .94, shape); ctx.lineWidth = r * .12; ctx.strokeStyle = d.stamp_color; ctx.stroke()
      ctx.restore()
      drawIcon(ctx, d.stamp_icon, cx, cy, r * 1.1, d.stamp_color)
    }
    return
  }
  if (imgs.empty) {
    ctx.save(); shapePath(ctx, cx, cy, r, shape); ctx.clip(); ctx.globalAlpha = .92; cover(ctx, imgs.empty, cx - r, cy - r, 2 * r, 2 * r); ctx.restore()
    return
  }
  if (d.stamp_style === 'icon') { drawIcon(ctx, d.stamp_icon, cx, cy, r * 1.75, d.empty_color, .28); return }
  ctx.save()
  shapePath(ctx, cx, cy, r * .95, shape)
  ctx.globalAlpha = .1; ctx.fillStyle = d.empty_color; ctx.fill()
  ctx.globalAlpha = .55; ctx.lineWidth = Math.max(1, r * .07); ctx.setLineDash([r * .2, r * .16]); ctx.strokeStyle = d.empty_color; ctx.stroke()
  ctx.restore()
  drawIcon(ctx, d.stamp_icon, cx, cy, r * 1.05, d.empty_color, .3)
}

/** Distributes n stamps over 1–3 rows; rows are centred (the last one may be shorter). */
export function stampLayout(n: number, W: number, H: number) {
  const rows = n <= 6 ? 1 : n <= 14 ? 2 : 3
  const perRow = Math.ceil(n / rows)
  const padX = W * .055, padY = H * (rows === 1 ? .2 : .1)
  const cell = Math.min((W - 2 * padX) / perRow, (H - 2 * padY) / rows)
  const r = cell * (rows === 1 ? .36 : .39)
  const out: { x: number; y: number }[] = []
  let left = n
  for (let row = 0; row < rows; row++) {
    const k = Math.min(perRow, left); left -= k
    const y = H / 2 + (row - (rows - 1) / 2) * cell
    for (let i = 0; i < k; i++) out.push({ x: W / 2 + (i - (k - 1) / 2) * cell, y })
  }
  return { r, pts: out }
}

export function drawStrip(ctx: CanvasRenderingContext2D, W: number, H: number, d: Design, total: number, filled: number, imgs: Imgs, transparent = false) {
  ctx.clearRect(0, 0, W, H)
  if (transparent) { /* web card: the (animated) CSS background shows through */ } else if (d.bg_mode === 'image' && imgs.bg) {
    cover(ctx, imgs.bg, 0, 0, W, H)
    ctx.fillStyle = `rgba(0,0,0,${d.bg_dim})`; ctx.fillRect(0, 0, W, H)
  } else if (d.bg_mode === 'solid') {
    ctx.fillStyle = d.bg; ctx.fillRect(0, 0, W, H)
  } else {
    ctx.fillStyle = linear(ctx, W, H, d.angle, d.gradient); ctx.fillRect(0, 0, W, H)
  }
  if (d.grain && !transparent) grain(ctx, W, H, W / 375)
  const { r, pts } = stampLayout(total, W, H)
  pts.forEach((p, i) => drawStamp(ctx, p.x, p.y, r, d, i < filled, imgs))
}

// ---------- wallet asset set ----------
function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('render_failed')), 'image/png'))

function icon(size: number, d: Design, imgs: Imgs, name: string) {
  const c = canvas(size, size), ctx = c.getContext('2d')!
  ctx.fillStyle = d.pass_bg; ctx.fillRect(0, 0, size, size)
  if (imgs.logo) contain(ctx, imgs.logo, size * .14, size * .14, size * .72, size * .72)
  else {
    ctx.fillStyle = d.fg; ctx.font = `600 ${size * .5}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText((name.trim()[0] ?? 'T').toUpperCase(), size / 2, size * .54)
  }
  return c
}
/** Apple lays logoText right after the logo image's full width — so the canvas must be cropped
 *  to the drawn logo (a square logo in a 160×50 canvas would push the text into the middle and truncate it). */
function logo(w: number, h: number, imgs: Imgs) {
  const img = imgs.logo!
  const nw = img.naturalWidth || h, nh = img.naturalHeight || h
  const s = Math.min(w / nw, h / nh)
  const c = canvas(Math.max(1, Math.round(nw * s)), h), ctx = c.getContext('2d')!
  contain(ctx, img, 0, 0, c.width, h, 'left')
  return c
}

export interface Asset { name: string; blob: Blob }
/** All PNGs a published program needs (Apple 1x/2x/3x + Google hero/logo). */
export async function buildAssets(d: Design, total: number, companyName: string, onStep?: (done: number, all: number) => void): Promise<Asset[]> {
  const imgs = await loadDesignImages(d)
  const jobs: (() => Promise<Asset>)[] = []
  for (let k = 0; k <= total; k++) {
    for (const [suffix, w, h] of [['@2x', 750, 246], ['@3x', 1125, 369]] as const) {
      jobs.push(async () => { const c = canvas(w, h); drawStrip(c.getContext('2d')!, w, h, d, total, k, imgs); return { name: `strip-${k}${suffix}.png`, blob: await toBlob(c) } })
    }
  }
  for (const [suffix, s] of [['', 29], ['@2x', 58], ['@3x', 87]] as const) jobs.push(async () => ({ name: `icon${suffix}.png`, blob: await toBlob(icon(s, d, imgs, companyName)) }))
  if (imgs.logo) for (const [suffix, m] of [['', 1], ['@2x', 2], ['@3x', 3]] as const) jobs.push(async () => ({ name: `logo${suffix}.png`, blob: await toBlob(logo(160 * m, 50 * m, imgs)) }))
  jobs.push(async () => ({ name: 'logo-square.png', blob: await toBlob(icon(660, d, imgs, companyName)) }))
  const out: Asset[] = []
  for (let i = 0; i < jobs.length; i++) { out.push(await jobs[i]()); onStep?.(i + 1, jobs.length) }
  return out
}

/** Downscales an uploaded picture (keeps transparency) before it goes to storage. */
export async function prepareUpload(file: File, max = 900): Promise<Blob> {
  if (file.type === 'image/svg+xml') return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const c = canvas(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await toBlob(c)
  } finally { URL.revokeObjectURL(url) }
}
