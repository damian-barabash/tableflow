/**
 * Loyalty card design model — stored in loyalty_programs.design (jsonb), shared by the panel designer,
 * the customer web card and the wallet asset renderer (Apple strip / Google hero image).
 */
export type StampIcon = keyof typeof STAMP_ICONS
export interface Design {
  bg_mode: 'gradient' | 'solid' | 'image'
  gradient: string[]           // 2–4 stops
  angle: number                // degrees
  bg: string                   // solid colour
  bg_image?: string | null     // photo behind the stamps (strip)
  bg_dim: number               // 0..0.7 darkening over the photo
  pass_bg: string              // wallet pass body colour (Apple backgroundColor / Google hexBackgroundColor)
  grain: boolean
  animated: boolean            // web card only — wallets can't animate
  fg: string                   // text on the pass
  label: string                // field labels on the pass
  logo_url?: string | null
  logo_text: string
  stamp_icon: StampIcon
  stamp_img?: string | null    // custom stamp picture (collected)
  empty_img?: string | null    // custom empty-slot picture
  stamp_style: 'filled' | 'outline' | 'icon'
  stamp_shape: 'circle' | 'rounded'
  stamp_color: string
  stamp_icon_color: string
  empty_color: string
}
export interface Info { description?: string; terms?: string; hours?: string; address?: string; phone?: string; website?: string }

export interface GradientPreset { id: string; name: string; stops: string[]; angle: number; pass: string; fg: string; label: string }
export const GRADIENTS: GradientPreset[] = [
  { id: 'tableflow', name: 'TableFlow', stops: ['#dcc3cb', '#a784a3', '#6f6396', '#464f96', '#2a3480'], angle: 160, pass: '#2a3480', fg: '#ffffff', label: '#dcc3cb' },
  { id: 'aurora', name: 'Aurora', stops: ['#2a3480', '#6f6396', '#d3b5bd'], angle: 120, pass: '#2a3480', fg: '#ffffff', label: '#e4d4dc' },
  { id: 'espresso', name: 'Espresso', stops: ['#2b1d16', '#6b4a3a', '#c89f7a'], angle: 135, pass: '#2b1d16', fg: '#fff7ef', label: '#e2c3a4' },
  { id: 'ocean', name: 'Ocean', stops: ['#0f2f4f', '#1f6f8b', '#7fd1cf'], angle: 135, pass: '#0f2f4f', fg: '#ffffff', label: '#a9e3e1' },
  { id: 'forest', name: 'Las', stops: ['#0f2e22', '#2e6b4f', '#a8d5a2'], angle: 135, pass: '#0f2e22', fg: '#ffffff', label: '#bfe3b9' },
  { id: 'sunset', name: 'Zachód', stops: ['#3b1d4a', '#c2456d', '#f6a15b'], angle: 120, pass: '#3b1d4a', fg: '#ffffff', label: '#fbd0a8' },
  { id: 'rose', name: 'Róż', stops: ['#5a2140', '#c46b8f', '#f3c6d3'], angle: 135, pass: '#5a2140', fg: '#ffffff', label: '#f7d9e2' },
  { id: 'mint', name: 'Mięta', stops: ['#0e3b3a', '#2fb4a0', '#c9f2e3'], angle: 135, pass: '#0e3b3a', fg: '#ffffff', label: '#c9f2e3' },
  { id: 'gold', name: 'Złoto', stops: ['#1f180c', '#8a6a2f', '#e8c67a'], angle: 135, pass: '#1f180c', fg: '#fff8e6', label: '#e8c67a' },
  { id: 'sky', name: 'Niebo', stops: ['#1c3d8f', '#4f8fe6', '#bfe0ff'], angle: 125, pass: '#1c3d8f', fg: '#ffffff', label: '#cfe6ff' },
  { id: 'cherry', name: 'Wiśnia', stops: ['#3d0a12', '#9c1c33', '#f07a7a'], angle: 135, pass: '#3d0a12', fg: '#ffffff', label: '#f8c0c0' },
  { id: 'noir', name: 'Noir', stops: ['#0b0b0c', '#2a2a2e', '#55555c'], angle: 135, pass: '#0b0b0c', fg: '#ffffff', label: '#b9b9c0' },
]

export const DEFAULT_DESIGN: Design = {
  bg_mode: 'gradient', gradient: GRADIENTS[0].stops, angle: 160, bg: '#1a1916', bg_image: null, bg_dim: .35,
  pass_bg: '#2a3480', grain: true, animated: true, fg: '#ffffff', label: '#dcc3cb',
  logo_url: null, logo_text: '', stamp_icon: 'mark', stamp_img: null, empty_img: null,
  stamp_style: 'filled', stamp_shape: 'circle', stamp_color: '#ffffff', stamp_icon_color: '#2a3480', empty_color: '#ffffff',
}

/** Industry → sensible starting design. */
export function designFor(industry: string | null | undefined, companyName = ''): Design {
  const s = (industry ?? '').toLowerCase()
  const pick = (id: string, icon: StampIcon) => { const g = GRADIENTS.find(x => x.id === id)!; return { ...DEFAULT_DESIGN, gradient: g.stops, angle: g.angle, pass_bg: g.pass, fg: g.fg, label: g.label, stamp_icon: icon, stamp_icon_color: g.pass, logo_text: companyName } }
  if (/kaw|caf|coffee/.test(s)) return pick('espresso', 'coffee')
  if (/barber|fryz|hair/.test(s)) return pick('noir', 'scissors')
  if (/beauty|kosmet|paznok|nail|spa/.test(s)) return pick('rose', 'drop')
  if (/rest|pizz|bistro|food|burger/.test(s)) return pick('sunset', 'pizza')
  if (/warsz|auto|car|myjn/.test(s)) return pick('sky', 'car')
  if (/fit|siłow|gym|sport/.test(s)) return pick('mint', 'dumbbell')
  if (/pub|bar|piw/.test(s)) return pick('gold', 'drink')
  return { ...DEFAULT_DESIGN, logo_text: companyName }
}

export function normalizeDesign(d: Partial<Design> | null | undefined): Design {
  return { ...DEFAULT_DESIGN, ...(d ?? {}) } as Design
}

/** CSS background for web previews (same geometry as the canvas strip). */
export function cssBackground(d: Design): string {
  if (d.bg_mode === 'solid') return d.bg
  if (d.bg_mode === 'image' && d.bg_image) return `linear-gradient(rgba(0,0,0,${d.bg_dim}), rgba(0,0,0,${d.bg_dim})), url("${d.bg_image}") center/cover`
  return `linear-gradient(${d.angle}deg, ${d.gradient.join(', ')})`
}
/** Animated variant: the same stops repeated so background-position can drift (web card only). */
export function cssAnimatedGradient(d: Design): string {
  const s = d.gradient
  return `linear-gradient(${d.angle}deg, ${[...s, ...[...s].reverse().slice(1)].join(', ')})`
}

/**
 * Stamp icons: 24×24 line icons as SVG path strings — rendered by <svg> in the UI and by Path2D on canvas,
 * so the preview and the wallet images are identical.
 */
export const STAMP_ICONS = {
  mark: { name: 'TableFlow', d: 'M3.75 16.5L15 5.25M20.25 6L15.75 10.5L20.25 15M8.25 18.75L12 15', dots: [[3.75, 11.25]], w: 3.2 },
  coffee: { name: 'Kawa', d: 'M5 10h11v4.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14.5zM16 11.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 4.5v2.5M12 4.5v2.5' },
  scissors: { name: 'Nożyczki', d: 'M9 7.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0M9 16.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0M8.6 8.9L20 17.5M8.6 15.1L20 6.5' },
  star: { name: 'Gwiazda', d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z' },
  heart: { name: 'Serce', d: 'M12 19.5s-7-4.3-7-9.7A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7 2.4c0 5.4-7 9.7-7 9.7z' },
  check: { name: 'Ptaszek', d: 'M5.5 12.5l4.2 4.2 8.8-9.2' },
  crown: { name: 'Korona', d: 'M4.5 17l-1-9 4.8 3.8L12 5l3.7 6.8L20.5 8l-1 9zM4.5 20h15' },
  drop: { name: 'Kropla', d: 'M12 3.5s6 6.4 6 10.9a6 6 0 0 1-12 0c0-4.5 6-10.9 6-10.9z' },
  sparkle: { name: 'Blask', d: 'M12 3.5l2 6.3 6.5 2.2-6.5 2.2-2 6.3-2-6.3L3.5 12l6.5-2.2z' },
  paw: { name: 'Łapa', d: 'M12 12.5c-3 0-5 3.2-5 5.2 0 1.6 1.4 2 2.5 1.6l2.5-1 2.5 1c1.1.4 2.5 0 2.5-1.6 0-2-2-5.2-5-5.2zM8 8.7a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0M11.3 5.9a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0M16.3 5.9a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0M19.6 8.7a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0' },
  pizza: { name: 'Pizza', d: 'M12 3.5L3.8 18.5c5.4 2.6 11 2.6 16.4 0zM9 13.5h.01M13.5 11h.01M12 16h.01' },
  burger: { name: 'Burger', d: 'M4.5 11a7.5 5.5 0 0 1 15 0zM4 14.5h16M5 17.5h14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z' },
  drink: { name: 'Napój', d: 'M6 5h10v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM16 8.5h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M9 9v7M12.5 9v7' },
  dumbbell: { name: 'Hantle', d: 'M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11' },
  car: { name: 'Auto', d: 'M4 16.5v-4l2.2-5h11.6l2.2 5v4zM4 16.5v2M20 16.5v2M7.5 13.5h.01M16.5 13.5h.01' },
  gift: { name: 'Prezent', d: 'M3.5 8.5h17v3.5h-17zM5 12v8h14v-8M12 8.5V20M12 8.5c-2-4-6-3.5-5 0M12 8.5c2-4 6-3.5 5 0' },
  leaf: { name: 'Liść', d: 'M5 19c0-8 5-13.5 14-14 0 9-5.5 14-14 14zM5 19l7-7' },
  moon: { name: 'Księżyc', d: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z' },
} as const satisfies Record<string, { name: string; d: string; dots?: number[][]; w?: number }>

export const STAMP_KEYS = Object.keys(STAMP_ICONS) as StampIcon[]
