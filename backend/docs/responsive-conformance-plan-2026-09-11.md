# Responsive conformance pass — plan

**Source:** [responsive-conformance-audit-2026-09-11.md](responsive-conformance-audit-2026-09-11.md).
**Goal:** every width decision in the application goes through a design-system mechanism (container query, `ResponsiveValue`, `ResponsiveHeaderTools`, a layout primitive, or the single 768 px shell handoff). No page-local pixel breakpoints, no viewport-hook layout branching, no duplicated row/layout markup.
**Non-goals:** marketing pages under `pages/home/` and `Index.tsx`; the customer-authored public canvases (`PublicFormPage`, `PublicLandingPage`); visual redesign of any surface — this pass changes *how* layouts respond, not what they look like at the widths they were designed for.

## Principles for every slice

1. **Enforce first, then fix to green.** Each rule lands as a contract assertion in `visual-language.test.ts` with a ratchet baseline (the `RAW_BLUE_BASELINE` idiom). The baseline is set to today's count, and each slice lowers it. The test fails if the count rises *or* if it falls without the baseline being lowered, so the ratchet cannot silently loosen.
2. **Container over viewport.** Where a component was using `min-[Npx]` to approximate "my card is wide enough", it becomes `@container` on the card and `@md:`/`@lg:` (or a named breakpoint) on the children. Tailwind's container-query plugin provides the utilities; named containers stay in `index.css` only where a query must cross component boundaries.
3. **Pointer over width for modality.** Sheet-vs-Popover, drag sensors, stroke width: gate on `(pointer: coarse)` / sensor selection, not `useIsMobile`.
4. **One primitive per repeated anatomy.** A pattern that appears three or more times with divergent breakpoints becomes a component with slots and one collapse order.
5. **No visual change at design widths.** A slice is done when the surface looks the same at 375, 768, 1024 and 1440 with the sidebar expanded, and *better* (not different) at the in-between widths with the sidebar collapsed. Each slice records which widths were checked.
6. **Small commits, one slice each.** Frontend suite green, `build:check` green, docs mirror synced, before every commit.

## Slices

### Slice 0 — Enforcement, tooling, rulebook

| Step | Change |
|---|---|
| 0.1 | Install `@tailwindcss/container-queries`; register in `tailwind.config.ts` `plugins`. Confirms `@container`, `@sm:`…`@2xl:` utilities compile. |
| 0.2 | `visual-language.test.ts`: add `ARBITRARY_BREAKPOINT_BASELINE` ratchet counting `(min|max)-\[\d+px\]` across `src/` (excluding `pages/home/`, `Index.tsx`). Baseline = measured count today. |
| 0.3 | Same file: `VIEWPORT_HOOK_BASELINE` ratchet counting `useIsMobile(` call sites outside `hooks/use-mobile.tsx`, with an explicit allowlist keyed by path + reason (`KanbanBoard` drag modality, `sidebar.tsx` shell, `ResponsiveCardRail` shell handoff, `canvas.tsx` flush frame). Allowlisted files are excluded from the count; anything else counts. |
| 0.4 | Same file: hard assertion — no `window.innerWidth` or `matchMedia(` outside `hooks/use-mobile.tsx`, `BackgroundClouds.tsx` (decorative), and `lib/`. Fix any current offender in this slice if trivial; otherwise allowlist with reason and remove in the owning slice. |
| 0.5 | `PageLayout.tsx` / `usePageHeader.tsx`: delete `desktopTools`, `mobileActions`, `mobileClassName`. `EntityDetailHeader` doc comment updated to say `headerTools.status`. Confirm `MobileControlsBar` still has a legitimate importer or delete it. |
| 0.6 | `design-system/index.md`: rewrite lines 90–98 (Page hierarchy) and the `PageLayout` example at ~450 to `headerTools`; add a "Width decisions" subsection naming the four sanctioned mechanisms and the three banned ones, with the container-query utility syntax. |
| 0.7 | Commit: "Responsive conformance, slice 0: ratchets, container queries, one page contract". |

**Acceptance:** frontend suite green with three new assertions; running the ratchets with baseline 0 lists exactly the audit's offender set (recorded in the commit message).

### Slice 1 — Design-system templates

| Step | Change |
|---|---|
| 1.1 | `design-system/widgets/ModuleWidget.tsx`: the widget root becomes `@container`; `min-[1280px]:max-[1399px]:hidden` icon band and `min-[1750px]` label swap become container-relative (`@md:`/`@xl:` or a measured `ResponsiveValue` for the label). |
| 1.2 | `components/GetStartedCard.tsx`: card root `@container`; all 14 `min-[1100px]` utilities → `@lg:`-class equivalents (card is ~1,100 − 256 − padding ≈ 800 px wide when the old breakpoint fired, so `@3xl` ≈ 48rem is the matching container width; tune to match today's visual). |
| 1.3 | Lower `ARBITRARY_BREAKPOINT_BASELINE` by the removed count. |

**Acceptance:** dashboard at 1024/1100/1280/1440, sidebar expanded and collapsed — module widgets and Get Started card switch layout at the same *content* width in both sidebar states (previously they switched at the same *viewport* width, i.e. different content widths).

### Slice 2 — Dashboard

| Step | Change |
|---|---|
| 2.1 | `pages/DashboardPage.tsx`: heading row (`min-[1000px]`) → `@container` on the page intro. The five `min-[1048px]` full/compact label pairs → a `CompactLabel` primitive (`full`, `compact`, `sr-only` full — the same shape as `ExpandedRowActionLabel`) driven by the card's container. Extract `CompactLabel` from `ExpandedRowActionLabel` so both share it. |
| 2.2 | `pages/dashboard/components/DashboardOverview.tsx`: attention banner `min-[520px]` → the existing `dashboard-overview` container (or `@sm:` on the banner). Signal picker `isMobile ? Sheet : Popover` → `ResponsiveOverlay` primitive that selects on `(pointer: coarse)` via a `usePointerCoarse()` hook; Sheet on touch, Popover on fine pointer. |
| 2.3 | `CommunicationStatsCard.tsx`, `DashboardPage.tsx:461` stat triples: leave `grid-cols-3` (verified ≥ 320 px) or convert to `ResponsiveCardRail` if any label wraps at 320. |
| 2.4 | Lower both ratchet baselines. |

**Acceptance:** dashboard at 375 (touch), 768, 1024±sidebar, 1440. Signal picker opens as a sheet on a touch emulation and as a popover with a mouse regardless of width.

### Slice 3 — List row primitive + Contacts

| Step | Change |
|---|---|
| 3.1 | New `components/ui/expanded-row-header.tsx`: `ExpandedRowHeader` with slots `leading` (icon disc), `title`, `subtitle`, `status` (badge), `value` (amount/right-aligned figure), `meta` (secondary lines), `trailing` (chevron + menu). Root is a named container `expanded-row-header`; `index.css` gains the collapse order: meta hides first, then status moves inline under the title (mirroring `EntityDetailHeader.mobileStatus`), then value moves inline. Three thresholds, defined once. |
| 3.2 | Migrate `InvoicesPage`, `EstimatesPage`, `PaymentsPage`, `RecurringInvoicesPage`, `ProductsPage` row headers onto it. Delete the per-page `hidden lg:block` / `lg:hidden` / `md:hidden` / `sm:hidden` tiers. |
| 3.3 | `ContactsPage`: replace `isMobile ? ContactCardList : ContactsTable` with `ExpandedRow` + `ExpandedRowHeader` rows (selection checkbox in `leading`, contact status in `status`, email/phone in `meta`). Retire `ContactsTable.tsx` and `ContactCardList.tsx`. Bulk-select state and the existing row actions are preserved. |
| 3.4 | Contract assertion: no `<Table` in `pages/**/*Page.tsx` list pages (allowlist: admin `OperationsSection`, `ImportContactsModal` preview, invoice previews — tabular data, not lists). |
| 3.5 | Lower `VIEWPORT_HOOK_BASELINE`. |

**Acceptance:** all six lists at 375, 640, 768, 1024±sidebar, 1440. Row collapse happens at the same content width on every page. Contacts bulk-select, delete, and open-detail work at each width. `useDatabaseCategories`/Contacts tests updated.

### Slice 4 — Editor split layout

| Step | Change |
|---|---|
| 4.1 | New `components/layout/EditorSplitLayout.tsx`: `form` + `preview` slots; `previewMinWidth` (rem, default 22) and `previewShare` (default 0.8fr) props; root `@container`; two-column at `@[calc(previewMin + 32rem)]`-style threshold expressed as one named container in `index.css` (`editor-split`, min-width `56rem`); preview aside `sticky` with `top` derived from the shell CSS variable (`--app-shell-height` — add it to `AppShell` if absent) rather than `top-6`/`top-20`. |
| 4.2 | Migrate `InvoiceEditorPage`, `EstimateEditorPage`, `PageEditorPage`, `SegmentEditorPage`, `SignatureEditorPage`, `SMSTemplateEditorPage`, `ChatWidgetPage`, `ReputationWidgetEditorPage`, `CalendarSettingsPage`. `CalendarSettingsPage` keeps its wider `previewMinWidth` (27rem). |
| 4.3 | Contract assertion: editor pages import `EditorSplitLayout`; no `(lg|xl|2xl):sticky` in `pages/`. |

**Acceptance:** each editor at 768, 1024±sidebar, 1280, 1440. Preview aside never tucks under the shell header. Form column never drops below its minimum usable width before the layout stacks.

### Slice 5 — Settings and admin

| Step | Change |
|---|---|
| 5.1 | `SettingsPage.tsx:358` and `OrganizationSettings.tsx:662` share one row (`min-[1300px]`): extract `SettingsRowActions` (or equivalent) with `@container`; one file. |
| 5.2 | `admin/components/CommunicationsSection.tsx` `min-[1000px]` → `@container`. `OperationsSection.tsx:647` `grid-cols-4 text-xs` → `grid-cols-2 @sm:grid-cols-4`. |
| 5.3 | `SettingsPage.tsx:452` `grid-cols-3` verified at 320 or converted. |
| 5.4 | `ARBITRARY_BREAKPOINT_BASELINE` reaches 0; the ratchet becomes a hard ban (`toBe(0)`). |

### Slice 6 — Canvas and card family

| Step | Change |
|---|---|
| 6.1 | `components/Canvas/CanvasContainer.tsx:144`: read sidebar width from the sidebar context (`useSidebar().state` → width token) instead of restating `256 / 64`; measure the container with `ResizeObserver` for usable width. |
| 6.2 | `SharedWhiteboardCard`, `WhiteboardCard`, `WireframeCard`: canvas pixel dimensions from a `useElementSize(hostRef)` hook (extract the `ResizeObserver` pattern from `ResponsiveValue` into `hooks/useElementSize.ts`), not `isMobile`. `WhiteboardCanvas` keeps `isMobile` only for stroke width, renamed to a `coarsePointer` prop fed by `usePointerCoarse()`. |
| 6.3 | `SharedPage.tsx:96` landing target/icon: derive from the same content-width signal the workspace landing uses, or drop the branch if `getWorkspaceLanding` can decide from route alone. |
| 6.4 | `canvas.tsx`: keep the flush-frame allowlist entry; replace `h-[calc(100vh-4rem)]` with the shell height variable from 4.1. |
| 6.5 | `VIEWPORT_HOOK_BASELINE` reaches the allowlist-only state; ratchet becomes `toBe(0)` outside the allowlist. |

### Slice 7 — Close

| Step | Change |
|---|---|
| 7.1 | `responsive-conformance-audit-2026-09-11.md` gains a "Resolved" header with the final ratchet values and the per-slice width checks. |
| 7.2 | `design-system/index.md` "Width decisions" section links the new primitives (`CompactLabel`, `ResponsiveOverlay`, `ExpandedRowHeader`, `EditorSplitLayout`, `useElementSize`, `usePointerCoarse`). |
| 7.3 | Docs mirror synced; `release:check` green. |

## Order and dependencies

0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Slices 1, 2, 5 are independent of 3, 4, 6 and could be reordered, but 0 must land first (it defines the utilities and the ratchets everything else lowers), and 2.1's `CompactLabel` is reused by 3.1.

## Width-check protocol (per slice)

Browser tool at 375, 640, 767, 768, 1023, 1024, 1280, 1440 with the sidebar expanded; repeat 1024 and 1280 collapsed. Record the widths checked and any deliberate visual deviation in the commit message. Touch-modality behaviours are checked with pointer emulation, not width.
