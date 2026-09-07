# Theme colour

*Plan, 2026-09-07. Follows the colour audit of the same day. Owner: workspace/design-system.*

Blue is not the app's colour; it is the colour the app starts with. A user picks a **theme colour** (blue, purple, pink) in preferences and every "product accent" in the app follows it — primary actions, chrome icons in light and dark, links, focus and selection rings, active navigation, the favicon, and the colour a new card starts with. Two things never follow it: **brand** surfaces other people see (marketing, auth, emails, PDFs, embeds, public share pages) and **status** colours (red destructive, green good, amber draft/parked).

## Three colour classes, three owners

| Class | Owner | Surfaces | Changes with theme? |
| --- | --- | --- | --- |
| Brand | product | landing/marketing, auth pages, transactional + campaign emails, PDFs, invoice/estimate previews, chat widget, landing-page documents, public `/shared/*` and `/estimate`, `/invoice` pages | never |
| Theme | user preference | primary buttons, page-chrome icons, links, focus/selection rings, active nav, checkbox/switch, favicon, default card accent, the "live working state" pill | yes |
| Status | `lib/statusVisuals.ts` | destructive (red), success/paid (green), draft/parked (amber/orange), muted (gray) | never; the theme palette is restricted so it can never collide |

A card's own colour is a fourth thing — the **card accent** (`lib/cardAccent.ts`) — chosen per card. Theme only sets what a card *starts* with.

## Correction to the audit

The audit said the `--primary` token was blue-500 while the classes rendered blue-600. That was wrong: `--primary` is `221.2 83.2% 53.3%` = **blue-600**, `--primary-hover` is blue-700, and `--icon-accent` is already blue-600 light / blue-400 dark. The token layer and the class idioms agree; the only stray is `UI_COLORS.brandBlue = #3B82F6` (blue-500), which is the *default card accent*, not the brand. The problem is adoption — 530 raw `blue-600` classes bypass tokens that already exist — not the tokens.

## Token layer

All theme tokens are HSL triplets on `:root`, overridden per `data-theme-color` and per mode. `next-themes` keeps owning light/dark through `class="dark"`; theme colour is a sibling attribute on `<html>`.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--primary` | 600 | 600 | fills: primary buttons, active toggles, selected tabs |
| `--primary-foreground` | white | white | text on `--primary` |
| `--primary-hover` | 700 | 700 | hover on fills |
| `--icon-accent` (exists) | 600 | 400 | ink: chrome icons, links, emphasis text — the current `text-blue-600 dark:text-blue-400` pairing |
| `--ring` | 600 | 600 | focus rings, selection rings (wireframe nodes) |
| `--theme-tint` (new) | 100 | 900/30 | soft backgrounds: `bg-blue-50/100` sites, icon discs |
| `--card-accent-default` (new) | 500 | 500 | what a new card starts with; `isDefaultAccent` compares to this |

Tailwind exposes them as `bg-primary`, `text-primary`, `text-icon-accent` (new colour key `iconAccent`), `ring-ring`, `bg-theme-tint`. The existing `.icon-accent` utility (already used by `SectionCardTitle` and tabs) stays as the class form.

### Palette

| Theme | 400 (dark ink) | 500 (card default) | 600 (fill / light ink) | 700 (hover) | 100 (tint) |
| --- | --- | --- | --- | --- | --- |
| blue (default) | `#60A5FA` 213.1 93.9% 67.8% | `#3B82F6` 217.2 91.2% 59.8% | `#2563EB` 221.2 83.2% 53.3% | `#1D4ED8` 224.3 76.3% 48% | `#DBEAFE` |
| purple | `#C084FC` 270 95.2% 75.3% | `#A855F7` 270.7 91% 65.1% | `#9333EA` 271.5 81.3% 55.9% | `#7E22CE` 272.9 71.7% 47.1% | `#F3E8FF` |
| pink | `#F472B6` 328.6 85.5% 70.2% | `#EC4899` 330.4 81.2% 60.4% | `#DB2777` 333.3 71.4% 50.6% | `#BE185D` 335.1 77.6% 42% | `#FCE7F3` |

Tailwind's own scale, so contrast on white/dark grounds matches what blue has today. Green, red, amber, orange, yellow are excluded from the theme palette by construction (`ThemeColor = 'blue' | 'purple' | 'pink'`).

## Preference

- **Storage:** `users.theme_color VARCHAR(16) NOT NULL DEFAULT 'blue'` (migration 080). Exposed as `CurrentUser.themeColor`; set through `updateViewerPreferences(input { mutationId, themeColor })` (AccountScoped, CSRF). Validated against the palette.
- **Fast paint:** `lib/themeColor.ts` mirrors the value to localStorage (`itemize:theme-color`) and an inline script in `index.html` stamps `data-theme-color` before React mounts, the way `next-themes` stamps mode — no flash of blue on a purple account. Server value wins on load and overwrites the mirror.
- **UI:** Settings › Appearance, beside Light/Dark: three swatches (blue, purple, pink) with the selected one filled. Saving is optimistic; failure reverts and toasts.
- **Favicon:** `ThemeFavicon` renders an inline SVG data URL with `fill` from the palette (600 light / 400 dark), replacing the two PNGs.
- **Default card accent:** `CreateItemModal` defaults to `--card-accent-default`; `isDefaultAccent` compares to the *current* theme's 500. A card with an explicit `color_value` keeps it when the theme changes — the DB value is the record of intent, the same rule as the frame flows.

## Slices

### A — Foundation (≈1 day). Nothing visibly changes; the app becomes themeable.
1. Token blocks per `data-theme-color` × mode in `index.css`; `iconAccent` and `themeTint` colour keys in `tailwind.config`.
2. `lib/themeColor.ts`: palette, `applyThemeColor`, localStorage mirror; boot script in `index.html`.
3. Codemod the two idioms: `text-blue-600 dark:text-blue-400` → `text-icon-accent` (235 sites); `bg-blue-600 interaction-button--primary text-white` → `bg-primary text-primary-foreground interaction-button--primary` (66 sites). Settings' own Light/Dark buttons included.
4. **Ratchet contract** in `design-system/visual-language.test.ts`: count raw `(bg|text|border|ring|from|to|via|hover:…|dark:…)-blue-\d{2,3}` outside the brand allowlist; assert the count is ≤ the checked-in baseline and update the baseline only downward. Same shape as the existing pill contract.
5. `UI_COLORS.brandBlue` → `DEFAULT_CARD_ACCENT` re-export from `lib/cardAccent.ts`; the 108 `#3B82F6` literals become that import (schemas, cards, calendars, forms).

*Accept:* `document.documentElement.dataset.themeColor = 'purple'` in the console turns every button, chrome icon, ring, and the note toolbar purple in both modes, with no source change; ratchet baseline recorded; all suites green.

### B — Preference (≈½ day).
1. Migration 080 + `CurrentUser.themeColor` + `updateViewerPreferences`; integration test (set, read back, reject `green`).
2. Settings swatches; localStorage mirror; server-wins reconciliation on login.
3. Favicon SVG per theme × mode.
4. `STATUS_THEME_CLASSES.blue` → `STATUS_THEME_CLASSES.theme` (rendered from `--primary`/`--theme-tint`); consumers: `EntitySuggestionList`, admin `OperationsSection`. Green/orange/red/gray remain the only true statuses.
5. Default card accent follows the theme.

*Accept:* pick pink in Settings → header icons, Add button, canvas Add menu, note toolbar, suggestion list discs, favicon, and a newly created card are pink; reload keeps it; a second browser sees it after login; existing blue cards stay blue; an invoice PDF preview and the public share page stay brand blue.

### C — Chip the ad hoc set (≈1–2 days, file-sized commits).
- ~150 `text-blue-600` without a dark pair → `text-icon-accent` (or `text-primary` where it is a fill's text).
- ~79 `bg-blue-600` off the button idiom → `bg-primary` (charts: `hsl(var(--primary))`).
- Wireframe node selection rings and handles (~30) → `ring-ring` / `bg-primary`; whiteboard pen/eraser toggles and stroke slider, wireframe grid toggle, vault unlock button → card accent (they live inside cards) — the same rule the note toolbar follows.
- Tints `bg-blue-50/100`, `border-blue-200/300` → `bg-theme-tint` / `border-primary/30`; hovers → `hover:text-icon-accent`.
- `CategorySelector` "+ Add new category" → `text-icon-accent`.
- Each file's commit lowers the ratchet baseline.

### D — Declare the brand (≈½ day).
- `BRAND_BLUE = '#2563EB'` (and `BRAND_BLUE_SOFT = '#3B82F6'`) in `lib/brand.ts`; the 43 `#2563EB` literals in exported documents import it: `whiteboardCanvasData` default stroke, invoice/estimate previews, chat-widget preview, reputation widget, `landingPageDocument`, `SharedNoteCard`/`SharedWhiteboardCard`. Backend renderers (`branded-transactional-email.ts`, campaign send, forms, calendars, landing pages, admin email) share one constant in `backend/src/common/brand.ts`.
- Allowlist file `design-system/brand-surfaces.ts` listing the paths the ratchet exempts: `pages/Home.tsx`, `pages/home/**`, `pages/Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `VerifyEmail.tsx`, `pages/legal/**`, `pages/Shared*Page.tsx`, `pages/PublicEstimatePage.tsx`, `pages/PublicInvoicePaymentPage.tsx`, `pages/invoices/components/*Preview*.tsx`, `*EmailPreview*.tsx`, `components/marketing/**`, `components/LandingNav.tsx`, `components/Navbar.tsx`, `components/CookieConsent.tsx`, `components/subscription/PricingCards.tsx`, `lib/landingPageDocument.ts`.

## Contracts touched

- **Visual language:** the page-icon rule (`text-blue-600 dark:text-blue-400` on every PageLayout icon) becomes `text-icon-accent`; the entitlement-gate assertion follows. New ratchet test. Pill contract unchanged.
- **Replay / authorization:** `updateViewerPreferences` carries `mutationId`, is AccountScoped + CSRF.
- **Consumer:** the frontend document for `updateViewerPreferences` and `currentUser { themeColor }`.
- **Schema:** migration 080 + marker `user_theme_color_v1`.

## Risks and how they are handled

- *A theme colour close to a status colour.* Impossible by type: three hues, none in the status family. Adding a hue is a code change reviewed against `statusVisuals`.
- *Flash of blue before the preference loads.* The inline boot script stamps the attribute from localStorage before first paint; the server value reconciles after login.
- *Contrast in dark mode.* Ink uses the 400 step (as blue does today); fills stay 600 with white text. Each palette row is Tailwind's own scale, so ratios match blue's.
- *Codemod collateral.* The two idiom replacements are exact-string; the ratchet's baseline check fails the build if a replacement misses or a new raw blue lands.
- *Brand surfaces drifting.* They are allowlisted by path and read `BRAND_BLUE`, never a token; the ratchet only exempts what the allowlist names.

## Open decisions

1. Purple and pink only, or also a neutral (slate) theme for people who want no colour at all? *Recommend: not now; a neutral theme needs its own contrast pass.*
2. Should the default card accent be the theme's 500 (today's behaviour) or its 600 (same as buttons)? *Recommend: 500 — cards read lighter than chrome, which is how blue behaves today.*
3. Organization-level default theme (admin picks, members inherit until they choose)? *Recommend: later; users first.*
