import type { SVGProps } from 'react'

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const I = {
  phone: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>,
  calendar: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  bell: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 21h4" /></svg>,
  chart: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  analytics: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M3 17l5-6 4 4 5-8 4 5" /><path d="M3 21h18" /></svg>,
  card: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20M6 15h4" /></svg>,
  scan: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M3 12h18" /></svg>,
  check: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7" /></svg>,
  arrow: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  arrowUp: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M12 19V5M6 11l6-6 6 6" /></svg>,
  chevron: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M6 9l6 6 6-6" /></svg>,
  chevronL: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M15 6l-6 6 6 6" /></svg>,
  chevronR: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M9 6l6 6-6 6" /></svg>,
  globe: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>,
  menu: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  close: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  sparkle: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /></svg>,
  bolt: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>,
  doc: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg>,
  search: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>,
  users: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 7M21.5 20a6 6 0 0 0-4-5.6" /></svg>,
  settings: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  home: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>,
  mic: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  mail: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 8l9 6 9-6" /></svg>,
  wallet: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M3 7a2 2 0 0 1 2-2h13v4" /><rect x="3" y="7" width="18" height="12" rx="2" /><circle cx="16.5" cy="13" r="1.2" fill="currentColor" stroke="none" /></svg>,
  clock: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  pin: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M12 21s7-6.5 7-11.5a7 7 0 1 0-14 0C5 14.5 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  msg: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M4 5h16v11H9l-5 4z" /></svg>,
  star: (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>,
  apple: (p: SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" {...p}><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.6-3.9zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.8-1.4z" /></svg>,
  android: (p: SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" {...p}><path d="M17.5 9.5H6.5a.5.5 0 0 0-.5.5v7a1 1 0 0 0 1 1h1v3a1 1 0 0 0 2 0v-3h4v3a1 1 0 0 0 2 0v-3h1a1 1 0 0 0 1-1v-7a.5.5 0 0 0-.5-.5zM3.5 9.5a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-5a1 1 0 0 0-1-1zm17 0a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-5a1 1 0 0 0-1-1zM15.9 4.7l1-1.5a.3.3 0 0 0-.5-.3l-1 1.6A5.7 5.7 0 0 0 12 3.9c-1.2 0-2.4.2-3.4.6L7.6 2.9a.3.3 0 0 0-.5.3l1 1.5A5.4 5.4 0 0 0 6 8.5h12a5.4 5.4 0 0 0-2.1-3.8zM9.5 7a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4zm5 0a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4z" /></svg>,
}
export type IconName = keyof typeof I
