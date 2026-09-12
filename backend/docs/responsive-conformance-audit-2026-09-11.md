# Responsive conformance audit — 11 Sep 2026

**Question asked:** does every page handle width the way the design system says, or is there per-page ad-hoc handling?
**Method:** read the responsive rules in `frontend/src/design-system/index.md` and the contract tests that enforce them, then grepped every page and shared component for the mechanisms those rules forbid or replace: viewport hooks, arbitrary pixel breakpoints, duplicated desktop/mobile markup, per-page layout recipes, and bypassed primitives.
**Companion:** `production-readiness-audit-2026-09-11.md` (security/ops). This doc is frontend-only.

## What the rulebook says (and what it gives you)

The rule that matters most is `index.md:94`: **"Responsive decisions must follow the available content width, including the sidebar, rather than viewport width alone."** The system provides four sanctioned mechanisms for that:

| Mechanism | Where | Used by |
|---|---|---|
| Named CSS container queries | `index.css` — `dashboard-overview`, `revenue-flow-card(-header)`, `expanded-row-actions`, `desktop-header-tools` | 5 components |
| `ResponsiveHeaderTools` density lane (ResizeObserver on its own width) | `components/layout/` | all 48 routed pages via `headerTools` |
| `ResponsiveValue` (measures and picks the widest fitting format) | `components/ui/responsive-value.tsx` | StatCard, dashboard, 4 sales pages |
| `ResponsiveCardRail` (rail on mobile, grid on desktop, one markup) | `components/layout/` | stat summaries |

Plus one **sanctioned viewport handoff**: the 768 px shell handoff (`headerTools` renders on both sides of it; `useIsMobile` encodes the same number).

Everything below is a place where a page or component reached past those mechanisms.

## Findings, ranked by how much ad-hoc handling they represent

### A. Eight invented viewport breakpoints, ~60 utilities, 7 files

`min-[520px]`, `min-[1000px]`, `min-[1048px]`, `min-[1100px]`, `min-[1280px]:max-[1399px]`, `min-[1300px]`, `min-[1750px]`. None is a Tailwind screen (`sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1400`). Each is a viewport number hand-tuned so that *viewport − sidebar* lands where the author wanted — i.e. exactly the thing the container-query rule exists to replace, encoded as a magic number that silently breaks when the sidebar collapses (64 px) or expands (256 px).

| File | Values | What it gates |
|---|---|---|
| `pages/DashboardPage.tsx` | 1000, 1048 (×14) | heading row direction; five hand-rolled full/compact label pairs ("Rates"/"Conversion Rates", "Comms"/"Communication", " Details") |
| `components/GetStartedCard.tsx` | 1100 (×14) | journey card row/column direction and label alignment — rendered only inside the dashboard, so it is guessing the dashboard column width via the viewport |
| `design-system/widgets/ModuleWidget.tsx` | 1280–1399 band, 1750 (×8) | hides an icon in a viewport band; swaps a label at 1750. **This is inside the design system itself.** |
| `pages/dashboard/components/DashboardOverview.tsx` | 520 (×4) | attention-banner grid direction — sits next to a *real* `@container dashboard-overview` query in the same component |
| `pages/admin/components/CommunicationsSection.tsx` | 1000 (×4) | row/column direction |
| `pages/settings/OrganizationSettings.tsx`, `pages/SettingsPage.tsx` | 1300 (×6) | row/column direction for the same card, duplicated in two files |

**Fix:** install `@tailwindcss/container-queries` (Tailwind 3.4 supports it) so `@container` + `@md:`/`@lg:` utilities exist in JSX, then convert each of these to a container on its own card. The `DashboardPage` label pairs become `ExpandedRowActionLabel`-style full/compact spans driven by the card's container, or `ResponsiveValue`. `ModuleWidget` should be fixed first — it is the pattern others copy.

### B. The sales-list row anatomy is hand-built five times, and the five disagree

`InvoicesPage`, `EstimatesPage`, `PaymentsPage`, `RecurringInvoicesPage`, `ProductsPage` each write ~150 lines of the same expanded-row header (icon · number · status badge · amount · chevron · menu) with a three-tier show/hide scheme — and no two use the same tiers:

| Page | badge inline | amount inline | secondary meta |
|---|---|---|---|
| Invoices | `lg:hidden` | `md:hidden` | `hidden sm:flex` |
| Estimates | `lg:hidden` | `md:hidden` | `sm:block` |
| Payments | `lg:hidden` | `md:hidden` | `hidden sm:flex` + `hidden sm:block` |
| Recurring | `lg:hidden` | `md:hidden` | `hidden sm:flex` + `hidden sm:block` |
| Products | `lg:hidden` | **`sm:hidden`** | `sm:flex` + `sm:block` |

The other seven `ExpandedRow` list pages (Forms, Signatures, Bookings, Landing Pages, Campaigns, Automations, Segments) use a single `sm:flex` and nothing else. `ExpandedRow` only provides the *actions* container (`expanded-row-actions` container query); the header anatomy has no primitive, so every page invents one.

**Fix:** add an `ExpandedRowHeader` (or `EntityRow`) primitive with `identity / status / value / meta / menu` slots and one container-query-driven collapse order (meta → status → value, matching what `EntityDetailHeader` already does with `mobileStatus`). Migrate the five sales pages; the other seven become one-line adopters.

### C. Editor split layouts: eight editors, six recipes, three handoff breakpoints, two sticky offsets

| Editor | Layout | Handoff | Preview aside |
|---|---|---|---|
| InvoiceEditorPage | `grid-cols-1 lg:grid-cols-2` | lg | — |
| EstimateEditorPage | `grid-cols-1 lg:grid-cols-2` | lg | — |
| PageEditorPage | `grid-cols-1 lg:grid-cols-3` | lg | — |
| SegmentEditorPage | `lg:grid-cols-3` | lg | `lg:sticky lg:top-6` |
| SignatureEditorPage | `xl:grid-cols-3` | xl | — |
| SMSTemplateEditorPage | `xl:grid-cols-3` | xl | `xl:sticky xl:top-6` |
| ChatWidgetPage | `xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]` | xl | `xl:sticky xl:top-6` |
| ReputationWidgetEditorPage | same as ChatWidget | xl | `xl:sticky xl:top-20` |
| CalendarSettingsPage | `2xl:grid-cols-[minmax(0,1fr)_minmax(27rem,0.72fr)]` | 2xl | `2xl:sticky 2xl:top-20` |

`top-6` vs `top-20` means the preview panel sits either under or clear of the sticky shell depending on which editor you open. The `minmax(22rem, 0.8fr)` recipe is the best of these (it reasons about the preview's needed width, not the viewport) and appears in exactly two files.

**Fix:** one `EditorSplitLayout` (`form` + `preview` slots, `previewMinWidth` prop, sticky offset owned by the layout and derived from the shell height). Nine adopters.

### D. Contacts is the only list built as a `<Table>`, switched to cards on the viewport hook

`ContactsPage.tsx:448` renders `ContactsTable` or `ContactCardList` on `useIsMobile()`. Every other list in the app uses `ExpandedRow`/`NavigationRow`, which degrade by content width. Contacts therefore (a) has two implementations of the same list to keep in sync, (b) shows a table crushed to ~740 px at a 1000 px viewport with the sidebar open, and (c) shows cards on a 767 px tablet where the table would fit.

**Fix:** rebuild Contacts on the row primitive from B. `ContactsTable`/`ContactCardList` retire.

### E. `useIsMobile()` used for content decisions in 7 places

The hook is legitimate for the shell handoff and for *input modality* (touch drag vs mouse drag in KanbanBoard, stroke width in WhiteboardCanvas). It is a rule violation when it picks a *layout*:

- `ContactsPage` — table vs cards (D)
- `DashboardOverview.tsx:434` — signal picker as bottom `Sheet` vs `Popover`
- `SharedPage.tsx:96` — workspace landing target and icon
- `canvas.tsx` — `min-h-screen` vs `h-[calc(100vh-4rem)]` (canvas is a documented flush exception, but the viewport-height math still ignores the shell height variable)
- `SharedWhiteboardCard`, `WireframeCard`, `WhiteboardCard` — canvas pixel dimensions
- `CanvasContainer.tsx:144` — hardcodes sidebar width `256 / 64` to compute usable width, i.e. it reconstructs content width from viewport + magic numbers instead of measuring

**Fix:** for the overlay case, a `ResponsiveOverlay` that picks Sheet/Popover on `(pointer: coarse)` rather than width. For the card/canvas cases, measure the host with `ResizeObserver` (the pattern `ResponsiveValue` already uses). `CanvasContainer` should read the sidebar width from the sidebar context, not restate it.

### F. Small unresponsive grids

`OperationsSection.tsx:647` (`grid-cols-4 text-xs`, admin), `CommunicationStatsCard.tsx:37,70` and `DashboardPage.tsx:461` (`grid-cols-3` stat triples), `SettingsPage.tsx:452`, `PublicEstimatePage.tsx:238`. The stat triples are probably fine at 320 px; the admin four-up is not. Low priority; fold into A's dashboard pass.

### G. The rulebook contradicts itself

- `index.md:90` — "Frequent search, filters, and sorting may use named `desktopTools`."
- `index.md:97-98` — "Use the named `PageLayout.desktopTools` slots…"
- `index.md:450` — the canonical `PageLayout` example passes `pageActions` and `mobileActions`.
- `index.md:504` — "Application pages may not use legacy `desktopTools`, `mobileActions`, or `mobileClassName`."

The code follows 504 (zero pages use the legacy slots; `visual-language.test.ts:357` enforces it), but `PageLayout.tsx:24-28` still accepts all three props, so the next author who reads the example at line 450 will get a working page that fails the contract test with no hint why.

**Fix:** delete the three props from `PageLayout`, rewrite lines 90–98 and the example at 450 to `headerTools`.

### H. Nothing enforces the content-width rule

`visual-language.test.ts` bans the legacy slots and requires `headerTools` where `HeaderSearch` appears. It does not ban `min-[`/`max-[` breakpoints, `useIsMobile` in `pages/`, `window.innerWidth`, or `<Table` in list pages — which is why A, D and E accumulated after the rule was written.

**Fix (cheap, do first):** three assertions in `visual-language.test.ts`:
1. no `(min|max)-\[\d+px\]` outside `design-system/` (and then fix ModuleWidget so the allowlist is empty);
2. no `useIsMobile(` in `pages/` except an explicit allowlist with a reason comment (`KanbanBoard` drag modality, `canvas.tsx` flush frame);
3. no `window.innerWidth` outside `hooks/use-mobile.tsx`.

Run them red first to confirm they catch the current offenders, then fix down to green.

## What checked out

- **Shell:** 48/48 routed pages use `PageLayout` + `headerTools`; zero `pageActions`, zero `MobileControlsBar`, zero legacy slots, zero `setHeaderContent`/`HeaderContext` imports from pages, zero second sticky headers (the `sticky` hits are all preview asides — finding C — or the marketing `Index.tsx`).
- **Touch targets:** every `Button` variant carries an `interaction-button--*` class that gets a 44 px floor under `(pointer: coarse), (max-width: 767px)` in `index.css:171`; the 25 `h-8 w-8` icon buttons in pages are desktop-density overrides that the floor still wins on mobile. No raw `<button>` escapes it. Checkbox/radio/switch expand hit area via `after:h-11`.
- **Public surfaces:** all on `BrandedPublicPage`/`SharedContentLayout`; the three pages outside any layout (`PublicFormPage`, `PublicLandingPage`, `LegalDocumentPage`) are the documented customer-canvas exceptions or wrapped by `PublicLayout` at the route.
- **Stat summaries:** `ResponsiveCardRail` + `ResponsiveValue` adopted where stats appear; no hand-tuned odd-card centering found.
- **No inline `style={{ width }}` pixel layouts in pages** outside the canvas/whiteboard components already listed in E.

## The pass, in order

| Slice | Scope | Touches |
|---|---|---|
| 0. Enforce | H: three contract assertions + install `@tailwindcss/container-queries`; fix G in the doc and delete the dead `PageLayout` props | 4 files |
| 1. Design-system first | A: `ModuleWidget` off `min-[…]`; `GetStartedCard` onto a container | 2 files |
| 2. Dashboard | A: `DashboardPage`, `DashboardOverview` banner; F stat triples; E overlay via pointer query | 3 files |
| 3. Row primitive | B: `ExpandedRowHeader`; migrate the 5 sales lists; D: Contacts onto it, retire `ContactsTable`/`ContactCardList` | ~9 files |
| 4. Editor layout | C: `EditorSplitLayout`; migrate 9 editors | ~10 files |
| 5. Settings/admin | A: `SettingsPage`/`OrganizationSettings` shared card; `CommunicationsSection`; `OperationsSection` grid | 4 files |
| 6. Canvas family | E: measure hosts instead of viewport; `CanvasContainer` reads sidebar width from context | 5 files |

Slices 0–2 are a day and remove the design-system-internal violations that everything else copies. Slices 3–4 are the bulk of the ad-hoc code (roughly 1,000 lines of duplicated row/layout markup collapsing into two primitives) and are where the visual QA time goes — each migrated page should be checked at 320, 767/768, 1023/1024 with the sidebar both expanded and collapsed.
