# Responsive audit, rendered pass — 13 Sep 2026

> **Resolved 14 Sep 2026.** R1–R5 are fixed by plan slices 0.5–6 (`95abd6d3`, `40a72f97`, `6891c6d8`, `36af07a6`); the measured before/after table and the sweep probe live in [responsive-conformance-plan-2026-09-11.md](responsive-conformance-plan-2026-09-11.md). R6's remaining static vocabulary (nowrap in the sidebar, vh math on public pages) is tracked there as non-blocking.

**Builds on:** [responsive-conformance-audit-2026-09-11.md](responsive-conformance-audit-2026-09-11.md) (mechanism-level, grep) and [responsive-conformance-plan-2026-09-11.md](responsive-conformance-plan-2026-09-11.md). Slice 0 of the plan landed in `e32b2a9f` (ratchets at 50 / 7 / 5, container-query plugin, dead `PageLayout` props removed).

**What this pass adds:** the app was actually run and measured. The 11 Sep audit found *where* width decisions bypass the design system; this one shows *what that costs on screen*, with numbers, and adds a deeper static scan (fixed widths, nowrap, overflow, vh math, dialog widths, hidden-pairs, tables) over every non-marketing surface.

## Method

- Local stack: Postgres 16 in Docker (`itemize_dev`, full 164-marker migration stream), Nest API with `backend/.env` exported, Vite dev server. One trial organisation seeded through GraphQL with deliberately long user-authored values (a 41-character contact surname, a 78-character campaign name, a 65-character product name) so truncation behaviour is exercised.
- 34 authenticated routes swept at **375, 768, 1024 (sidebar expanded), 1440**, plus targeted measurements at 1023/1024 and 1099/1100 with the sidebar in both states. Each sweep is a DOM probe that reports: document horizontal overflow; any element extending past the viewport that is not inside a scroll rail; any single-text `nowrap` element whose `scrollWidth` exceeds its box (i.e. visibly truncated); any interactive element under 40 px in either dimension that has no ≥40 px `::after` hit-area.
- Static scan: every `.tsx` under `src/` excluding `pages/home/`, `Index.tsx`, `Home.tsx`, and tests.

## Headline

**Nothing overflows.** At no width, on no route, did the document scroll horizontally or did an element escape the viewport outside a deliberate rail. The 11 Sep verdict that the *shell* is disciplined holds under rendering.

The defects are all in the second tier: **wrong layout for the width you actually have**, **authored copy clipped by fixed-width controls**, and **touch targets that dodge the 44 px floor by not carrying an interaction class**. Each has a measured instance below.

## Findings, ranked by user-visible cost

### R1. Sidebar-blind breakpoints are now measured, and they invert

The 11 Sep audit predicted that `min-[1100px]:flex` on `GetStartedCard` and `lg:grid-cols-2` on the invoice editor would fire at the wrong content width when the sidebar changes state. Measured:

| Surface | Window | Sidebar | Content box width | Layout rendered |
|---|---|---|---|---|
| `GetStartedCard` header row (`min-[1100px]:flex`) | 1099 | collapsed | **761 px** | stacked (`block`) |
| same | 1100 | expanded | **570 px** | side-by-side (`flex`) |
| `InvoiceEditorPage` form/preview grid (`lg:grid-cols-2`) | 1023 | collapsed | **851 px** | one column |
| same | 1024 | expanded | **644 px** | two columns of **310 px** each |

A 761 px card stacks while a 570 px card goes side-by-side; an 851 px editor stays single-column while a 644 px editor splits into two 310 px columns (form *and* live invoice preview each 310 px wide). Both follow directly from deciding on the viewport. `DashboardPage`'s welcome row (`min-[1000px]`) and the 9 editor split layouts behave the same way; the two above are representative.

Also measured: at **768 px the sidebar is expanded by default and the content column is 512 px** — narrower than a 640 px phone in landscape. `SidebarProvider` is hard-wired `defaultOpen={true}` (`AppShell.tsx:170`) and never reads the `sidebar:state` cookie it writes (`sidebar.tsx:86`), so a tablet user who collapses it gets it back expanded on every load.

**Resolution:** unchanged from the plan (slices 1, 2, 4) — container queries on the card/editor root. Add to slice 0.5: read the cookie into `defaultOpen`, and default to collapsed below `lg`.

### R2. Overview signal tiles truncate their own authored labels at every width up to ~1200

`DashboardOverview.tsx:142` renders `<p class="truncate">{signal.title}</p>` beside a `shrink-0` timeframe span in a `justify-between` row. The label loses:

| Window | Label box | "Upcoming bookings" needs | Rendered |
|---|---|---|---|
| 375 | 75 px | 131 px | "Upcoming b…" |
| 1024 (expanded) | 83 px | 131 px | "Upcoming bo…" |
| 1440 | full | — | intact |

Also clipped at 375–1024: "New contacts", "Overdue tasks", "Overdue invoices", "Awaiting signatures". These are authored strings, and `index.md:95` says authored copy is never truncated. The tile widths (271 px at 375, ~250 px at 1024) come from the tile grid adding columns as the overview widens instead of giving the label room first.

**Resolution:** the timeframe moves under the title (or into the value line) below a tile-container width; the title wraps to two lines rather than truncating. Fold into slice 2.

### R3. Fixed-width filter selects clip their own option labels — at every width

Hand-tuned rem widths on `SelectTrigger`s are sized to the *default* option, not the longest, so choosing another option truncates it:

| Control | Trigger width | Clipped label | Needs |
|---|---|---|---|
| `CanvasToolbar.tsx:67`, `ContentsPage.tsx:1279` type filter | `w-[8rem]` / `w-[6.5rem]` | "All Types" | 67 px in 64 |
| `SharedPage.tsx` sort | `w-[7.5rem]` | "Most Recent" | 93 px in 80 |
| `InvoiceViewSelect.tsx` view | (lane-sized) | "Recurring schedules" | 152 px in 143 |

Not width-dependent; present at 1440. Six other triggers in the same files use the same pattern with other rem values.

**Resolution:** `SelectTrigger` gets `min-w-0 w-auto` plus a `min-w-[--longest]` set from the longest option, or the triggers use `ResponsiveValue` for their label. One shared `FilterSelect` wrapper; the design system already forbids the rem-tuning this replaces. New slice 2b.

### R4. Touch targets that bypass the floor

The 44 px coarse-pointer floor (`index.css:171`) only applies to elements carrying `interaction-button--*`, `interaction-control[role=tab]`, or `touch-target-mobile`. Rendered at 375 (and, for the sidebar, at 768–1024 where a tablet still shows it):

| Element | Size | Why the floor missed it |
|---|---|---|
| `TrialBanner.tsx:168,195` "Dismiss trial reminder" — on **every** page | 24 × 24 | raw `<button>`; no interaction class |
| `GetStartedCard.tsx:129` "Dismiss Get Started" | 16 × 16 | raw `<button>` |
| `InvoiceEditorPage.tsx:763` "Document type" select | 273 × 28 | `h-auto py-0` on a native control |
| `InvoiceEditorPage.tsx:831` "Add a business profile" | 142 × 20 | inline `<button>` styled as a link |
| Sidebar sub-items (Invoices, Estimates, Payments, …) at 768–1024 | 172–190 × 28 | `SidebarMenuSubButton` uses `interaction-navigation`, which is not in the floor selector list |
| Sidebar footer (Settings / Help / Status) at 768–1024 | 223 × 36 | same |
| Dashboard "Reorder" / "Unpin" signal handles, Pipelines zoom controls, row "More actions" | 32 × 32 | `size="icon"` overridden to `h-8 w-8`; desktop-density is allowed, but these also render at coarse-pointer widths |

**Resolution:** add `.interaction-navigation` to the floor selector (one line); give the two dismiss buttons and the business-profile link `touch-target-mobile`; drop `py-0` from the document-type select below `md`. The 32 px icon overrides keep desktop density because the floor's `min-height` wins on coarse pointers — verify with pointer emulation, not width, per the plan's width-check protocol. Slice 0.5 addendum.

### R5. List-row titles are capped, not content-driven

With the sidebar collapsed at 1024 (content 960 px) the same long titles clip at the same pixel widths as with it expanded (content 768 px): campaigns 462/628, email templates 438/483, pages 422/508, products 368/427, segments 438/518. The extra 192 px went nowhere. This is user-generated text, so truncation is permitted — but a title column that ignores available width is another symptom of the row anatomy being hand-built per page (finding B, 11 Sep). It disappears with the `ExpandedRowHeader` primitive (slice 3), whose title slot is `min-w-0 flex-1`.

### R6. Deep static scan — the remaining hand-tuned width vocabulary

Counts over the application surface (non-marketing, non-test):

| Pattern | Count | Files | Read |
|---|---|---|---|
| `w-[NNNpx]` / `min-w-[NNNpx]` ≥100 px | 67 | 12+ | Mostly `sm:max-w-[…]` on dialogs (fine — base `DialogContent` is `w-[calc(100vw-2rem)] max-w-lg`, verified 343 px at 375). Real fixed widths live in `LandingNav`, `UiBlockNode`, `FieldPlacementCanvas` (canvas tools, legitimate), and the two Send modals. |
| `whitespace-nowrap` | 51 | 12 | `AppSidebar` (7) and `CommunicationsSection` (4) lead; each is a candidate to become a `ResponsiveValue` or a wrapping label. |
| `truncate` | 152 | many | Permitted on user values; R2 shows it applied to authored copy in the dashboard. |
| `hidden sm:`/`md:hidden` show-hide pairs | 118 | 40+ | `EmailStudioDialog` (9), `SharedPage` (7, on `<table>` columns), `LineItemsTable` (5), `ArchivePage` (5). `SharedPage`/`ArchivePage` are a *third* list pattern (raw `<table>` with `hidden md:table-cell` columns) beside `ExpandedRow` and Contacts' `<Table>`. Add both to slice 3's migration. |
| `grid-cols-2` with no breakpoint | 28 | 20 | Form modals (`EditContactModal` 4, `CreateContactModal` 3, `CreateDealModal` 2): two-column field grids at 343 px inside a phone dialog — each field ~160 px. Verify at 375 in slice 2b; likely `grid-cols-1 sm:grid-cols-2`. |
| `100vh`/`100dvh` calc | 19 | 12 | Public pages (booking, review, estimate, payment) and `InboxPage` do their own viewport-height math; `AppShell`/`dialog`/`modal` define the sanctioned values. Slice 4.1's `--app-shell-height` variable should replace the in-app ones (`InboxPage`, `canvas.tsx`, `WorkflowBuilderPage`, `DocsPage`). |
| `<Table` / `<table` | 14 | 12 | Contacts, Shared, Archive lists (migrate); admin, campaign detail, invoice previews (tabular data, keep). |
| `absolute` | 133 | many | Not a defect class on its own; noted for the canvas family. |

### R7. Things that checked out under rendering

- No horizontal overflow at any width on any of the 34 routes, with or without data, with the sidebar in either state.
- Dialogs at 375: 343 px wide, correctly using the base `w-[calc(100vw-2rem)]`; the per-dialog `sm:max-w-[500px]` etc. are breakpoint-gated.
- Register/login forms at 375: inputs 44 px, checkbox has the `after:h-11` hit area, no clipping.
- `ResponsiveCardRail` at 375: cards 92 % wide in a snap rail, no leak.
- Kanban at 375: horizontal rail, no document overflow.
- `Button` variants: every `h-8 w-8` override still sits in an `interaction-button--*` class, so the floor applies on coarse pointers.
- `dashboard-overview` named container fires at 736 px of *content* width — the one place where the sanctioned mechanism was already used, and it behaved correctly in both sidebar states.

## Plan deltas

Add to [the plan](responsive-conformance-plan-2026-09-11.md):

- **0.5 (addendum, cheap, do now):** `.interaction-navigation` into the coarse-pointer floor; `touch-target-mobile` on the two dismiss buttons and the business-profile link; `SidebarProvider` reads its cookie and defaults collapsed below `lg`.
- **2 (extend):** R2 — timeframe below title under a tile container width; title wraps, never truncates.
- **2b (new):** R3 — `FilterSelect` wrapper sized to the longest option; migrate the 9 rem-tuned triggers. Also the `grid-cols-2` form grids in the three contact/deal modals at 375.
- **3 (extend):** `SharedPage`, `ArchivePage` `<table>` lists join the `ExpandedRowHeader` migration; contacts as already planned.
- **4 (extend):** R1 editor evidence is the acceptance test — at 1024/expanded the form column must not drop below its minimum usable width; at 1023/collapsed an 851 px editor must split.
- **Width-check protocol:** the sweep probe used here (`tmp/audit/` notes) should be kept as a script under `frontend/scripts/` so each slice records the same four numbers per route.

## Environment left running

Postgres container `itemize-integration-postgres-1` (db `itemize_dev`, local audit user, org 1, seeded; credentials omitted), API on :3100, Vite on :5173. Stop with `docker stop itemize-integration-postgres-1` and killing the two `npm run dev:*` processes; the seeded DB is disposable.
