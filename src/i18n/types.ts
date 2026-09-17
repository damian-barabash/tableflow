export type Locale = 'pl' | 'en' | 'ru' | 'fr' | 'es'
export const LOCALES: Locale[] = ['pl', 'en', 'ru', 'fr', 'es']
export const LOCALE_NAMES: Record<Locale, string> = { pl: 'Polski', en: 'English', ru: 'Русский', fr: 'Français', es: 'Español' }

export interface CallLine { who: 'client' | 'ai'; text: string }
export interface Scenario {
  id: string
  name: string       // business name
  industry: string   // industry label
  agent: string      // AI agent label
  lines: CallLine[]
  steps: string[]    // actions the AI performs
  outcome: string
}
export interface PlatformMock {
  number: string; numberLabel: string; forwarding: string; active: string; voice: string; voiceVal: string; hours: string; hoursVal: string
  staffTitle: string; slot1: string; slot2: string; slot3: string
  pushTitle: string; pushBody: string
  revenue: string; revenueVal: string; delta: string; occupancy: string; occupancyVal: string
  analyticsTitle: string; topics: string[]
  cardName: string; cardPts: string; cardTier: string
  scanTitle: string; scanHint: string; scanOk: string
}
export interface PolicySection { h: string; p: string[]; list?: string[] }
export interface Policy { title: string; updated: string; intro: string; sections: PolicySection[] }

export interface Dict {
  meta: { title: string; description: string }
  nav: { features: string; industries: string; app: string; loyalty: string; faq: string; cta: string; lang: string; menu: string }
  hero: {
    h1: string // rich: <g>…</g> = brand gradient
    sub: string; ctaPrimary: string; ctaSecondary: string; note: string; worksFor: string
    industries: string[]
  }
  demo: {
    tabs: string[]; typing: string; inputPlaceholder: string; replies: string
    dashboard: {
      url: string; sidebar: string[]; section1: string; section2: string; title: string; today: string
      days: string[]; staff: string[]; bookings: string[]; newBooking: string; source: string; stats: [string, string][]
    }
  }
  voices: { title: string; items: { text: string; who: string; role: string }[]; integrationsTitle: string; integrations: string[]; channelsTitle: string; channels: string[] }
  stats: { h2: string; sub: string; items: { value: string; label: string; desc: string }[]; note: string }
  platform: { h2: string; sub: string; cards: { title: string; desc: string }[]; cta: string; mock: PlatformMock }
  industries: { h2: string; h2b: string; sub: string; scenarios: Scenario[]; working: string; live: string }
  loyalty: {
    h2: string; sub: string; bullets: string[]; cta: string
    card: { business: string; member: string; points: string; tier: string; nextReward: string; stamps: string }
    scan: { title: string; hint: string; result: string; addPoints: string }
    walletApple: string; walletGoogle: string
  }
  integrations: {
    soon: string; eyebrow: string
    h2: string // rich
    sub: string // rich
    features: { title: string; desc: string }[]
    note: string
    tileCaption: string; synced: string
    hubTitle: string; hubToday: string; newLabel: string; aiSource: string; footer: string
    events: { src: 'booksy' | 'versum' | 'ai'; time: string; title: string }[]
  }
  history: { h2: string; sub: string; bullets: string[]; demo: { client: string; ai: string; why: string; reasoning: string; reasoningText: string; sources: string; sourceItems: string[]; action: string; actionText: string; audited: string } }
  app: { h2: string; sub: string; features: { title: string; desc: string }[]; push: { app: string; title: string; body: string; time: string }; screen: { today: string; next: string; items: string[] }; stores: string }
  faq: { h2: string; items: { q: string; a: string }[]; more: string; contact: string }
  waitlist: {
    h2: string; sub: string; email: string; business: string; businessOptions: string[]; company: string
    consent: string; privacy: string; submit: string; sending: string; success: string; exists: string; invalid: string; error: string; note: string
  }
  footer: { tagline: string; product: string; legal: string; contact: string; links: { features: string; industries: string; app: string; loyalty: string; faq: string; waitlist: string }; privacy: string; cookies: string; terms: string; rights: string; status: string; language: string; madeIn: string; company: string }
  cookies: { text: string; accept: string; reject: string; more: string }
  assist: {
    thinking: string; detected: string; switching: string; switched: string; undo: string
    question: string; keepPl: string; useEn: string; hint: string
  }
  policies: { privacy: Policy; cookies: Policy; terms: Policy }
  common: { back: string; updated: string }
  card: { won: string; title: string; business: string; stamps: string; stampsLeft: string; scanned: string; reward: string; newsletterTitle: string; newsletterSub: string; email: string; phone: string; emailPh: string; phonePh: string; consent: string; submit: string; success: string; exists: string; invalidEmail: string; invalidPhone: string; error: string; powered: string; back: string }
}
