# TableFlow AI — landing

Lądowanie produktu **TableFlow AI** (recepcja AI: odbiera telefony, zapisuje klientów do kalendarza, aplikacja zespołu, statystyki, lojalność w Apple/Google Wallet). Pre-launch: zamiast logowania — lista oczekujących.

## Stack

- React 19 + Vite 7 + TypeScript, `motion` (animacje), `react-router-dom` (HashRouter, `base: './'`).
- Backend: Supabase **TableFlow Backend** (`ahtjgghocwegyepxoeru`, eu-west-1) — bez supabase-js, dwa RPC przez `fetch` (`src/lib/supabase.ts`).
- Deploy: GitHub Pages przez `.github/workflows/deploy.yml` (push na `main` → build → Pages). W repo: Settings → Pages → Source = **GitHub Actions**, Custom domain **tableflow.pl** (`public/CNAME`).

## Skrypty

```bash
npm run dev        # dev server
npm run build      # tsc + vite build → dist/
npm run qc         # puppeteer QC (1440/390, pl/en/de/ru, polityka) → qc-out/
node scripts/og.mjs      # regeneruje public/og.png + apple-touch-icon.png
node scripts/visual.mjs  # kadry preloadera, asystenta języka, sticky slidera
```

## Struktura

- `src/i18n/` — słowniki `pl` (główny, w bundle), `en/ru/fr/es` (lazy chunks), provider z animowaną zmianą języka.
- `src/components/LangAssistant.tsx` — „kwadrat AI”: 3 s po intro wykrywa język systemu, przełącza stronę (pl → nic; en/ru/fr/es → auto; inne → pyta po angielsku).
- `src/components/Preloader.tsx` — intro na pełnoekranowym animowanym gradiencie (`.mesh`): glif rysuje się → wordmark „TableFlow AI”.
- `src/components/Industries.tsx` — sticky horizontal scroll (desktop), natywny snap (mobile).
- `src/lib/useParallax.ts` — parallax głębi przez `data-px`.
- `src/brand/Logo.tsx` — `Mark` (goły glif, `currentColor`), `Wordmark` (AI z gradientowym podkreśleniem), `Logo`, `Orb`; pliki `public/logo.svg`, `logo-mark.svg`, `logo-mark-white.svg`, `favicon.svg`.
- Gradienty: zawsze animowane i ziarniste — `.g` (małe powierzchnie) / `.mesh` (duże). `global.css` musi być importowany pierwszy w `main.tsx`.
- `src/mocks/` — makiety produktu (rozmowa AI, dashboard kalendarza).
- **`/edit-mod`** — wizualny edytor treści (login moderatora: `jakub` / `dmytrii` → `@tableflow.pl`; hasła poza repo). Teksty słowników wykrywane w DOM → contenteditable, nadpisania w `site_content` (draft/published na język). Silnik: `src/editor/engine.ts`, UI: `src/pages/EditMod.tsx`.
- Strony: `/` (landing), `/polityka-prywatnosci`, `/polityka-cookies`, `/regulamin`, **`/karta`** (strona za kodem QR z makiet: karta z pieczątkami → ostatnia pieczątka → zapis na newsletter e-mail/telefon).
- QR: `node scripts/qr.mjs` → `public/qr-karta.svg` (prawdziwy kod → `https://tableflow.pl/#/karta?src=qr`).

## Supabase (migracja `landing_waitlist_admin_foundation`)

- `waitlist_subscribers` — zapisy z formularza (email citext unique, locale, business_type, company, consent, utm, status). RLS: tylko admini (`is_admin()`).
- `admin_profiles` + `is_admin()` — fundament pod przyszłą admin-panel.
- `site_events` — anonimowe zdarzenia (lang_*, cookie_*, waitlist_view).
- RPC dla anon: `join_waitlist(...)` → `'created' | 'exists'` (wyjątki `invalid_email`, `consent_required`), `join_waitlist_contact(p_email|p_phone, …)` (telefon normalizowany do samych cyfr; wyjątki `invalid_phone`, `contact_required`), `log_site_event(...)`.
