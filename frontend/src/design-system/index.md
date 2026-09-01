# Itemize Design System

## Overview

The Itemize design system provides a unified set of design tokens, components, and patterns to ensure consistency across all modules. This document serves as the single source of truth for all frontend design decisions.

## Table of Contents

- [Design Tokens](#design-tokens)
- [Component Library](#component-library)
- [Pattern Library](#pattern-library)
- [Usage Guidelines](#usage-guidelines)
- [Theme System](#theme-system)

---

## Design Tokens

### The status palette

`src/lib/statusVisuals.ts` is the single definition of status color. Nothing else
may declare these classes: `hooks/useStatStyles`, `lib/badge-utils` and
`design-system/design-tokens` all derive from it, and
`design-system/visual-language.test.ts` fails the build if a second declaration
appears anywhere in `src/`.

Five themes carry the entire status grammar:

| Theme | Meaning | Examples |
|-------|---------|----------|
| `blue` | Itemize-owned draft, active, live working state | draft, active, new, info |
| `orange` | Parked or in flight | pending, sent, viewed, partial, paused, inactive, scheduled |
| `green` | Successful outcome | paid, accepted, completed, published, confirmed |
| `red` | Failed, destructive, or needing attention | overdue, failed, declined, expired, cancelled, archived |
| `gray` | Neutral or historical | refunded, unknown |

A status is declared once, with its label and icon, and every surface reads from
that one object -- so a pill, a stat card and a detail header can never disagree:

```typescript
import { defineStatus } from '@/lib/statusVisuals'

const INVOICE_STATUS_CONFIG = {
  draft: defineStatus('Draft', 'blue', Clock),
  paid: defineStatus('Paid', 'green', CheckCircle),
  overdue: defineStatus('Overdue', 'red', XCircle),
}
```

`defineStatus` returns `{ label, theme, icon, badgeClass, iconClass, iconBackgroundClass }`.
Use `badgeClass` on a `Badge`, `iconClass` on the icon, and `iconBackgroundClass`
on the icon disc. Unmapped values go through `getUnknownStatusVisual`, which
title-cases the raw string rather than rendering blank.

Reach for `lib/badge-utils` only when all you have is a raw status string and no
declared registry. Status color is deliberately **not** a `Badge` variant.

Primary actions use the default `Button` variant; non-Button primitives use
`bg-blue-600 interaction-button--primary text-white`. The app accent --
page icons, active icon tabs, section card titles -- is `--icon-accent`
(`blue-600` light, `blue-400` dark).

### Spacing

Spacing uses Tailwind's default scale directly. There is no spacing token layer;
an earlier one emitted invalid classes (`m-md`) and has been removed.

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| sm | rounded-sm | Form inputs, small elements |
| md | rounded-md | Cards, buttons |
| lg | rounded-lg | Large cards, modals |
| xl | rounded-xl | Hero sections |
| full | rounded-full | Avatars, badges |

---

## Component Library

### Page hierarchy

- Page identity gets space before controls; complete section titles are the last thing allowed to truncate.
- Keep one visually primary action in the shell header when the page has a real create or commit command. Do not promote secondary navigation just to fill the primary slot.
- Frequent search, filters, and sorting may use named `desktopTools`; result counts stay in the page surface.
- Secondary navigation uses outline or ghost styling so it does not compete with creation.
- Keep descriptive action labels in onboarding and empty states; icon-only header actions require an accessible label and tooltip.
- Responsive decisions must follow the available content width, including the sidebar, rather than viewport width alone.
- Audit subtext at 300px of available component width. If authored copy occupies three full text lines, rewrite it to two lines or fewer: lead with the state and next action, remove inventories and implementation detail, and use direct phrasing such as “Workspace ready.” Do not use truncation to hide overlong authored copy; reserve line clamping for unpredictable user-generated values.
- Legal, destructive, security, and payment-consequence copy may exceed two lines only when every remaining detail changes the user's decision. Make it concise first, and never move a required warning exclusively into a tooltip.

Use the named `PageLayout.desktopTools` slots with `HeaderSearch`, `HeaderFilters`,
`HeaderCombinedQuery`, and `HeaderAction`. Do not construct a parallel page toolbar.

### Buttons

#### Primary Button
Used for main actions and CTAs.

```tsx
import { Button } from '@/components/ui/button'

<Button>
  Save Changes
</Button>
```

#### Secondary Button
Used for secondary actions.

```tsx
<Button variant="secondary">
  Cancel
</Button>
```

#### Destructive Button
Used for delete/destroy actions.

```tsx
<Button variant="destructive">
  Delete
</Button>
```

### Control primitives

Controls communicate role before color or iconography. The default `Button` is
reserved for the one primary action in a surface. Use `outline`, `secondary`, or
`ghost` for supporting actions, `destructive` for a destructive confirmation,
and `destructiveGhost` for a destructive menu or low-emphasis action. A mode
switch such as Desktop/Mobile uses `variant="toggle"` with `aria-pressed`; it is
not a pair of competing primary buttons.

Control height is determined by context, not by page-local classes:

| Context | Primitive size | Height |
| --- | --- | --- |
| Forms, dialogs, page actions, app shell | default | 44px |
| Dense toolbars and menu triggers | toolbar | 36px |
| Embedded editors and small mode switches | compact | 32px |

Default `Input` and `SelectTrigger` controls are 44px tall and use 16px text so
mobile browsers do not zoom when a field receives focus. Use
`controlSize="compact"` only inside a genuinely dense editor or toolbar. Do not
override one field's height or font size locally to make a layout fit.

Selects and dropdown menus render on `popover`, with `border` and
`popover-foreground` tokens. They must not borrow sidebar tokens: an overlay is
a floating application surface in both themes. Destructive menu items use
`variant="destructive"`; never reproduce red hover/focus classes on a page.

Search uses `SearchField` for its input, icon, loading state, clear behavior,
accessible label, and Escape-to-clear behavior. In the typed app shell,
`HeaderSearch` progressively renders the full field, a labeled Search button,
then an icon only when the available container width truly requires it. Icon-only
search always retains a tooltip and accessible name.

### Tabs

Use `TabsList` and `TabsTrigger` for content/status switching. For labeled icon navigation, use `IconTabsList` and `IconTabsTrigger`; they mirror the sidebar with a transparent parent, `sidebar-accent` hover/selected rows, no inset shadow, and accent-colored icons on hover and selection. For route navigation outside the sidebar, use `NavigationRow` so active routes, focus rings, hover surfaces, and icon colors follow that same contract. Do not recreate those states in individual pages.

### App chrome icon actions

Use `AppHeaderIconButton` for unlabeled icon actions in the authenticated top bar. It standardizes a 44px hit area, ghost/accent hover, focus ring, and icon sizing. Sidebar toggles in that same bar use the same 44px geometry. Compact row actions and canvas tools are separate roles and may remain smaller.

| Control role | Geometry | Hover / selected behavior |
| --- | --- | --- |
| Authenticated app chrome | 44px square | `accent` hover; use `AppHeaderIconButton` |
| Labeled icon navigation | Content-sized | `sidebar-accent` row with blue-600 icon on hover and selection; use `IconTabsTrigger` |
| Route navigation row | 44px tall | `sidebar-accent` hover/selection with `aria-current`; use `NavigationRow` |
| Primary icon action | 36px or larger | Blue-600 surface, blue-700 hover |
| Compact row action | 32px square | Neutral ghost hover; keep inside its row or card |
| Canvas/editor tool | 32px square | Neutral hover with an explicit active state |

Do not shrink one app-chrome action independently or copy these hover classes into a page. If two controls occupy the same header role, they use the same primitive.

### Hover, focus, and touch

Hover confirms an affordance; it never introduces a required action or changes
layout. Shared interaction classes in `index.css` apply hover feedback only when
the device reports both hover support and a fine pointer.

| Role | Shared treatment | Rule |
| --- | --- | --- |
| Button | `Button` variant | Affect only the button surface; semantic destructive styling stays red |
| Field | `interaction-field` through input/select/textarea primitives | Strengthen the border without changing field layout |
| Navigation | `NavigationRow`, `IconTabsTrigger`, sidebar primitives | Quiet sidebar-accent fill and blue icon; mirror it on keyboard focus |
| Selectable row | `interaction-row` | Neutral muted fill; static rows do not hover |
| Fully clickable card | `<Card interactive>` | Subtle accent border and elevation; static cards do not hover |
| Contextual action | `interaction-reveal` inside `.group` | Visible on touch; reveal on fine-pointer hover, focus-within, or open state |

Do not use hover-only information, app-content scale/lift effects, or
`transition-all`. Motion that communicates dragging, editor manipulation, or a
public marketing interaction is a separate role. Every hoverable application
action must also have an operable focus state, and its hit target must not move.

### Touch throughput

Mobile support means completing the same core story efficiently, not merely
showing the desktop controls at a narrower width.

- Give every task action a 44 by 44 pixel physical hit area at phone widths and
  on coarse pointers. A checkbox, radio, switch, close icon, carousel indicator,
  or visually compact toolbar control may look smaller inside that area.
- Use `touch-action: manipulation` for taps. A horizontal rail or board owns
  horizontal panning and contains its horizontal overscroll; the page retains
  vertical scrolling everywhere else.
- Provide immediate pressed feedback on touch. Hover remains fine-pointer only
  and can never be required to discover an action.
- A drag interaction uses separate mouse and touch sensors. Touch drag starts
  only after a short hold with movement tolerance so an ordinary vertical swipe
  still scrolls. Keyboard reordering remains available.
- Every business-state drag operation also has an explicit action. For example,
  deals expose **Move to** in their action menu; users never need to discover or
  execute drag to complete the workflow.
- Keep frequent mobile commands in the sticky typed shell. Put lower-frequency
  commands in its labeled overflow rather than creating a second sticky action
  bar or relying on an offscreen desktop control.
- Inputs use 16px text, dialogs keep Close and commit actions reachable, and
  menus keep each item at least 44px tall. Do not disable browser zoom.
- Verify core stories at 320, 390, and 430 CSS pixels. Audit target size,
  accessible name, scroll ownership, pressed state, and a non-gesture fallback
  together; passing responsive layout alone is insufficient.

### Progress

Use `Progress` for usage meters, completion bars, and Get Started. Sit the meter on card or page chrome — do not tint the full container behind it.

```tsx
import { Progress } from '@/components/ui/progress'

<Progress value={42} className="h-2.5" />
```

### Cards

#### Standard Card
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Optional description</CardDescription>
  </CardHeader>
  <CardContent>
    Card content goes here
  </CardContent>
</Card>
```

#### Interactive Card (Click Action)
```tsx
<Card interactive onClick={handleClick}>
  {/* card content */}
</Card>
```

#### Framed Section

Use `FramedSection` when one page-level region contains several pieces of like
content. It establishes the standard contrast hierarchy:

1. app shell (`background`)
2. named section frame (`card`)
3. inset child surfaces (`background-alt`)

```tsx
import { PieChart } from 'lucide-react'
import { FramedSection } from '@/components/ui/framed-section'

<FramedSection title="Overview" icon={PieChart}>
  <ResponsiveCardRail label="Invoice status summary" className="mb-0">
    <StatCard title="Draft" value={4} icon={FileText} />
  </ResponsiveCardRail>
</FramedSection>
```

When the frame directly owns content instead of a collection of inset cards,
use its inset body. This is the standard for forms, settings, tables, charts,
and previews on detail and editor pages:

```tsx
<FramedSection title="Campaign setup" icon={Settings2} contentSurface="inset">
  <CampaignFields />
</FramedSection>
```

Existing composed cards use the same primitive through
`<CardContent surface="inset">`. Do not recreate it with `bg-muted`, opacity,
or page-specific theme classes. A section must have exactly one source of
inset contrast: either its direct content surface or its inset child cards,
never both.

Use a semantic title such as **Overview**, **Performance**, or **Recipient
status** and a theme-aligned icon. Page-level frames use an `h2`; nested frames
use `headingLevel={3}`. Keep descriptions out unless they change how the user
interprets or acts on the whole section.

Do not frame a lone control, every list row, an unframed editor canvas, or a
standalone identity/action card. Stop at two container layers: frame plus
inset content. The primitive is hierarchy, not decoration.

### Chart view controls

Charts with multiple comparable series use legend-style toggles as the direct
visibility control. Promote them into the framing card header when the whole
card can also fit its title, size controls, and route action. Keep at least one
series enabled and remove disabled series from the rendered marks, tooltip,
and accessible summary together. Active toggles use the corresponding series
color for their border, tint, and text; inactive toggles visibly recede. Do not
rely on a generic accent background as the only indication of visibility.

Use discrete **Compact**, **Standard**, and **Expanded** chart sizes instead of
an arbitrary zoom slider. Place Canvas-style minus/plus height controls in the
framing card header, never inside the chart surface. The minimum-size minus
control is disabled by default. Chart size is presentation; it must not change
the data period, aggregation, or surrounding detail content. Respond to the
chart surface's container width: collapse series controls into one labeled
`Series` menu when the direct toggles no longer fit.

Persist chart choices per user within an organization. Series visibility may
be shared by instances of the same chart, but save size separately by context
when dashboard and detail surfaces have different space responsibilities.

Only set `interactive` when the whole card performs one action. Static cards do
not gain elevation just because they contain a button. When a clickable card
contains nested actions, those actions remain permanently discoverable on
touch and become visible on fine-pointer hover or keyboard focus through
`interaction-reveal`.

#### Module Card (with accent)
```tsx
<Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
  {/* content from a specific module */}
</Card>
```

### Badges

#### Status Badge

Always render a declared `StatusVisual`; never an inline color class.

```tsx
import { Badge } from '@/components/ui/badge'
import { getInvoiceStatusVisual } from '@/pages/invoices/constants/invoiceConstants'

const visual = getInvoiceStatusVisual(invoice.status)

<Badge className={visual.badgeClass}>{visual.label}</Badge>
```

Where the badge sits beside a shell command lane that also shows status, the
inline badge is hidden from `md` up (see `EntityDetailHeader`'s `statusHandoff`)
so the state is stated once, not twice.

### Availability and lifecycle controls

Status is displayed, configuration is switched, and lifecycle changes are
commanded. Do not use the same toggle treatment for all three concepts.

- A status badge is read-only and always represents the persisted state that is
  currently true for customers. An unsaved form switch must not change it.
- A service-level saved preference, such as showing a chat widget or accepting
  bookings, uses `AvailabilitySettingRow` as the first row of its settings card.
- Catalog eligibility, such as whether a template, segment, or product can be
  selected for new work, uses `AvailabilitySettingRow` as the final full-width
  row after the asset's identity fields. Call the state Available/Unavailable,
  not Active/Inactive.
- Immediate or validated lifecycle transitions such as Publish, Activate an
  automation, or Deactivate use an explicit labeled action. They are never
  switches inside a clickable list row.
- A behavior local to one section may use a switch inside that section. A
  repeated child row may place its switch at the row end beside its other row
  actions.
- Switch labels describe the user-visible effect: “Accept new bookings,” “Show
  chat widget,” or “Available on new invoices.” Avoid the bare label “Active.”
- Help that does not change the decision belongs in the row tooltip; required
  consequence or warning text remains visible.

### Icons

All icons come from `lucide-react`.

Modules are distinguished by icon shape, not by color. There is no per-module
palette: every page icon uses the single app accent, so the sidebar, breadcrumbs
and page header agree.

```tsx
// Page icon, every family
<Users className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

// Section card title -- icon takes the accent via the shared primitive
<SectionCardTitle icon={Settings2}>Template settings</SectionCardTitle>
```

An icon that represents a *status* takes that status's `iconClass` instead.

### Tables

#### Data Table
```tsx
<div className="rounded-lg border bg-card">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Column 1</TableHead>
        <TableHead>Column 2</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {data.map(row => (
        <TableRow key={row.id}>
          <TableCell>{row.field1}</TableCell>
          <TableCell>{row.field2}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>
```

---

## Pattern Library

### Page Layout Pattern

All authenticated pages must use `PageLayout`. It owns the shell title, page-level actions, mobile controls, and page frame. Do not call `setHeaderContent` or import `HeaderContext` from pages.

```tsx
import { PageLayout } from '@/components/layout/PageLayout'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'

function MyPage() {
  return (
    <PageLayout
      title="CONTACTS"
      icon={<Users className="h-5 w-5 text-blue-600 flex-shrink-0" />}
      pageActions={<>{/* wrapping desktop controls inside the page */}</>}
      mobileActions={<>{/* mobile controls inside a page-level card */}</>}
    >
      {initError ? (
        <ErrorState title="Couldn't load" description={initError} />
      ) : (
        children
      )}
    </PageLayout>
  )
}
```

Frames:

- `surface` (default) — padded card from `sm` up. List, settings, and editor pages.
- `split` — full-height flush surface (inbox).
- `flush` — no page card (canvas, workflow builder). Still sets the shell title.
- `nav` — optional side navigation beside the surface (Settings, Admin).

Title is always an italic Raleway `h1` in the app header. Do not add a second in-page `h1`. Public routes (`/status`, `/help`) render the same slot through `PublicPageHeader` under `PublicLayout`.

Module identity is stable across navigation and page chrome. A top-level module uses the same Lucide icon in `AppSidebar` and its representative section heading (for example Megaphone for Campaigns, Layout for Pages & Forms, MessageSquare for Communications, CalendarDays for Scheduling, and Star for Reputation). Child routes may use a more specific icon only when their responsive heading names that child task.

#### Shell identity contract

The shell header identifies the current section or task. It is not a toolbar.

- `title` must be a stable route-level string such as `CONTACTS`, `FORM EDITOR`, or `CALENDAR SETTINGS`.
- Never use a contact name, organization name, form name, workflow name, or other user-provided value as the shell title. Put that identity in the page surface.
- The complete title must remain visible. Do not add `truncate`, line clamping, clipping, or horizontal scrolling to the shell heading.
- A decorative module icon is optional. When supplied, it remains visible directly before the title at every viewport width and is hidden from assistive technology.
- `leading` is reserved for one `ShellBackButton`. It uses an arrow-only blue-600 treatment, an accessible destination label, a tooltip, and a fixed 44 by 44 pixel target; do not add a visible `Back` label beside the arrow.
- The Back control, optional section icon, and complete responsive section heading must remain on one aligned row with the spacing owned by `ResponsivePageHeading`.
- Editor Back controls must preserve their unsaved-change guard and navigate to their explicit parent route. History-oriented utility pages may use `useSafeShellBack`, but must supply a deterministic fallback route for direct visits and new tabs.
- Raw tabs, result counts, destructive commands, and arbitrary multi-button clusters are forbidden in the shell. A persistent editor mode may use the typed `modeNavigation` slot, which preserves labels whenever they fit and compacts before status or commit actions yield space. `modeNavigation` must never repeat sibling destinations already represented in the sidebar or a section-navigation column.
- When a page's labeled section navigation column is hidden, `compactNavigation` may replace the static shell identity with one icon-bearing destination selector until the same breakpoint. It must show the complete active label on one row, use the same icons and labels as the navigation column, and disappear when that column appears.
- Search, filters, one secondary action, and, when applicable, one primary action use the named `headerTools` slots. Pages may not inject an untyped toolbar or declare a second mobile copy of those commands.
- When exactly one secondary action is present and no primary action is declared, `ResponsiveHeaderTools` promotes it into the primary slot and applies the accented primary treatment. A page must not leave its sole actionable destination visually subordinate to filters or passive context. Multi-action secondary groups remain secondary and follow the normal overflow rules.
- A shell-level refresh command uses `HeaderRefreshAction` in the appropriate named action slot. Its text label follows the shell container query and yields to the accessible 44 by 44 pixel icon control when space is constrained.
- Route-level administration sections use the same `compactNavigation` contract as Settings: one icon-bearing selector with the complete active label until the labeled navigation column appears.
- Administration content modes such as Users and Email Logs remain page-surface tabs, but their active mode must be URL-addressable so reload, deep links, and browser history preserve it.
- Dataset-wide administration search, filters, and refresh may use typed shell slots. Result counts, selections, bulk commands, queue-specific filters, and other contextual controls stay with their page-level dataset card.
- Global organization, notification, theme, and account controls belong to `AppShell`, not to pages.

On mobile, global controls occupy the first 56 pixel shell row and page identity occupies a separate 48 pixel minimum row. The identity row uses only 2 pixels of vertical inset so a 44 pixel Back control or compact section selector does not change the normal shell rhythm; it may still grow when a stable title genuinely wraps. On desktop, the shell remains 56 pixels high.

#### Mobile shell grammar

Mobile pages use three clearly separated layers:

1. The sticky 56 pixel global row contains only the sidebar trigger, organization, notifications, and account controls.
2. The sticky 48 pixel minimum section row contains the complete responsive heading and a bounded `ResponsiveHeaderTools` command rail. Long stable titles may wrap. Labels compact before the title, primary commands remain reachable, query controls become popovers, and multi-command secondary groups collapse into the standard More popover.
3. `MobileControlsBar` is reserved for controls that genuinely require persistent body width, such as bulk selection or workbench modes. Do not recreate search, filters, or page commands in a body-level mobile row.

`headerTools` is one command declaration rendered responsively on both sides of the 768 pixel handoff. Application pages may not use legacy `desktopTools`, `mobileActions`, or `mobileClassName`. On compact detail pages, persisted status hands off to `EntityDetailHeader` when the command rail also contains context or actions; this preserves the complete page title without repeating status. Editor command rails keep context first, overflow actions in the middle, and the task-advancing primary command last.

Desktop tools form one non-wrapping command lane in this fixed order: section identity, editor mode navigation when applicable, search, filters/sort, status, secondary action, primary action, global controls. The last applicable page action is therefore closest to notification and account chrome. A secondary-only action remains secondary and uses outline or ghost styling. The lane uses its own available width, not viewport width, to select a density:

- Spacious: full search, individual filters, icon plus secondary label, and `+ Add`.
- Medium: full search, one filter popover, icon plus secondary label, and `+ Add`.
- Compact: search and filter icon buttons, icon-only secondary action, and `+ Add`.
- Tight: one combined query popover, icon-only secondary action, and a 44 by 44 `+` primary action.

The title and global controls always win space. Header tools never wrap, and lower-priority query controls combine before an action or title is clipped. Compact controls require a tooltip and a complete accessible label. Generic object words such as “content” or “invoice” do not appear in the visible primary label; use `+ Add`, then `+` when tight.

#### Action density and deferment

Use the following destination rules instead of adding controls to the shell:

| Content | Destination |
| --- | --- |
| Frequent search, filters, sorting | Named `headerTools`; compact popovers in the mobile section row |
| Result counts | Result summary or empty-state area inside the page surface |
| One primary and one secondary page command | Named `headerTools` slots |
| Additional or complex page commands | `pageActions`, rendered by `PageActionsBar` |
| Mobile commands | The responsive rendering of the same `headerTools` declaration |
| Editor Save, Preview, Send, Publish | Named `headerTools`; keep one primary action and collapse multiple secondary commands into More |
| Record name, status, URL, owner | Page intro or entity summary card |
| Destructive commands | Overflow menu or a dedicated danger card |
| Cross-section navigation | Sidebar or section navigation; one matching `compactNavigation` selector while that navigation is hidden |

Page action cards wrap with 8 pixel gaps and give buttons and comboboxes a minimum 44 pixel target. Mobile actions scroll with content; they must not become a second sticky application header. If a mobile action card needs more than two frequent commands, consolidate secondary commands into an overflow menu or filter sheet.

#### Public surface contract

Public transaction surfaces provided by Itemizeâ€”booking, review collection, estimate response, invoice payment, signing, and shared-content chromeâ€”render through `BrandedPublicPage` (directly or through `SharedContentLayout`). This gives loading, error, completion, and interactive states one responsive brand frame.

Customer-authored canvases are intentional exceptions. Published landing pages render their generated document without Itemize chrome, and public forms preserve the customer-selected theme color and form identity. Their loading and unavailable states still use semantic theme tokens and minimum touch targets.

### List and Detail Pattern

`/invoices` is the reference implementation for list rows; `EntityDetailHeader`
is the reference for what a row opens into. `design-system/visual-language.test.ts`
holds both to their primitives.

#### List rows

- Rows sit in a `divide-y` list inside `space-y-4` -- not a card grid. Contacts
  and Landing Pages are accepted exceptions: contacts read as people, and pages
  need a thumbnail.
- `hover:bg-muted/50`, `transition-colors`, `cursor-pointer` on the row.
- `p-4` base, `px-6` for metadata rows, `gap-x-3 gap-y-1.5`.
- `min-w-0` on every flex container that holds text; `truncate` on the text.
- Status is a declared `StatusVisual`, never an inline class.
- A row that expands in place uses `ExpandedRowActions`, and its actions must
  mirror the row's overflow menu exactly. `ExpandedRowActionLabel` carries a full
  and a compact label plus an `sr-only` copy, so labels shorten without losing
  the accessible name.

#### Stat summaries

Wrap a page-level stat summary in `FramedSection`, then place the `StatCard`s in
`ResponsiveCardRail`: one markup, a snap-scrolling rail with dot indicators on
mobile and a grid on desktop. Cards use `surface="inset"` so the summary reads as
recessed against its named section frame. Set the rail margin to `mb-0` inside a
frame. A lone odd trailing card is centered automatically -- do not hand-tune
it.

When a summary already belongs to an enclosing framed component, only use the
rail and inset cards. Do not create a second frame.

#### Detail and editor pages

Every routed entity page renders `EntityDetailHeader`:

```tsx
<EntityDetailHeader
  icon={<StatusIcon className={cn('h-6 w-6', visual.iconClass)} />}
  iconClassName={visual.iconBackgroundClass}
  title={entity.name}
  mobileStatus={<Badge className={visual.badgeClass}>{visual.label}</Badge>}
  descriptor={entity.subject}
  metadata={<><span>Created {created}</span><span>{count} recipients</span></>}
/>
```

- The icon disc is themed by the entity's own status, so an overdue invoice
  reads red in its header exactly as it does in its list row.
- Status appears **once**: in the shell command lane (`headerTools.status`) on
  desktop, and inline via `mobileStatus` below the hand-off breakpoint. Set
  `statusHandoff="xl"` when the lane stays crowded past `md`.
- The title uses `min-w-0` and wraps; it does not truncate. A detail page is
  where the full name should be readable.
- Left group is `flex-1 min-w-0`; right actions are `shrink-0`.

`WorkflowBuilderPage` is a deliberate exception: it is a full-bleed builder on
`frame="flush"` with viewport-height math and no identity block, closer to the
canvas pages than to a detail page.

### General State Pattern

Every routed page uses the same state precedence. Resolve the highest state in
this table before rendering a lower one; a zero-length fallback must never hide
an unresolved request, access restriction, or failure.

| State | Required treatment |
| --- | --- |
| Initial loading | Keep the typed shell and identity when they are known. Use `PageLoading` for a route-sized unknown, `LoadingState kind="section"` for an isolated source, or a shape-preserving skeleton group with one named busy region. |
| Background refresh | Keep trustworthy content visible. Mark the owning region and refresh action busy; spin the refresh icon and prevent duplicate requests. Never replace the page with initial loading. |
| Empty collection | Render `EmptyState kind="collection"` only after a successful request. Offer one creation action when creation is allowed. |
| Filtered empty | Render `EmptyState kind="results"` and recover by clearing the active query. Do not offer creation as the primary recovery. |
| Partial failure | Preserve trustworthy content and place `FailureNotice` at the affected scope. |
| Blocking failure | Render retryable `ErrorState` at the smallest truthful scope. Organization failure takes precedence over page data failure. |
| Mutation in progress | Keep context visible, change the owning action to the active verb, set `aria-busy`, and disable duplicate submission. Other unrelated controls remain available. |
| Mutation success | Use a toast for a completed explicit action and `SaveStatus` for autosave. Use a persistent success panel only when the workflow has reached a terminal state. |
| Dirty or stale | Use `useDirtyState` with the unsaved-changes guard. Communicate dirty, saving, saved, and failed autosave through `SaveStatus`; do not encode the state through a disabled button alone. |
| Permission, plan, or domain restriction | Keep the page identity and explain why the capability is unavailable. Use the relevant upgrade, sign-in, or navigation action; this is not a retryable source failure. |
| Terminal public state | Completed, expired, declined, unavailable, and invalid-link outcomes use the service's authored public treatment and one valid next step. |

`LoadingState` owns one polite status announcement. A spinner nested inside a
busy button or state region is decorative; it must not create a second live
announcement. Visible loading copy is a short verb phrase such as “Loading
contacts” and never implementation language.

Header actions pass `busy` whenever their mutation flag is active. This produces
the same disabled, `aria-busy`, and compact mobile behavior from one declaration.
`HeaderRefreshAction` supplies this automatically and changes its accessible
label to “Refreshing” while work is in progress.

### Empty State Pattern

An empty state is valid only after a successful request. A failed request must render
the persistent, retryable `ErrorState`; never replace failed source-of-truth data with
an empty array and then show “No items yet.”

```tsx
import { EmptyState } from '@/components/EmptyState'

<EmptyState
  icon={Inbox}
  title="No items yet"
  description="Create an item to begin."
  actionLabel="Create item"
  onAction={handleCreate}
/>
```

Classify the state before choosing its copy or action:

| Kind | Meaning | Action hierarchy |
| --- | --- | --- |
| `collection` | The source loaded successfully and has never contained an item | One blue creation action when the user can create the item |
| `results` | Existing data was removed from view by search or filters | One outline `Clear search` or `Clear filters` recovery action |
| `passive` | Items arrive through another person, system, or future event | Usually no action; explain when items appear only when that is not obvious |
| `inline` | A nested card, widget, dialog, or detail subsection is empty | Compact density; do not duplicate an action already present in the section heading |

Descriptions are optional. Include one short sentence only when it adds a useful
consequence or next step; do not restate the title or button. Titles and actions
use sentence case. A filtered result never claims the whole collection is empty
and never substitutes a creation action for clearing the active query.

Use `kind="inline"` inside dense nested widgets and dialogs. `size="compact"`
remains available for unusual constrained surfaces, but state meaning should be
expressed through `kind` rather than inferred from spacing.

For an empty routed list, keep the same list container the populated state uses:
`Card` with `CardContent className="p-0"`, then `EmptyState className="p-12"`.
The icon, title, concise next-step description, and action are centered inside
that normal-height card. Do not invent a full-viewport empty canvas or retain a
separate top-left section heading only for the empty case.

An incomplete authored preview is not an empty collection. Use
`PreviewPlaceholder` from `components/preview/PreviewPlaceholder` for missing
page sections, form fields, generated install code, document files, and rendered
message snapshots. Availability messages inside customer-facing transaction
flows may retain their authored public-surface treatment.

### Failure State Pattern

A failure state represents data or UI that was expected but could not be made
available. It must never be rendered as an empty collection. Use `ErrorState`
for persistent source-load failures and classify its scope:

| Kind | Meaning | Placement and recovery |
| --- | --- | --- |
| `page` | The route's required source data is unavailable | Keep the typed `PageLayout` shell and page identity visible; replace only its content and provide one primary `Try again` action |
| `section` | A card or collection failed while the surrounding page remains usable | Keep the normal card frame and unaffected siblings; retry only the failed request |
| `inline` | A dialog, preview, expanded row, or nested detail failed | Use compact density inside the existing surface; do not close the user's context |

All persistent failures use a red semantic icon treatment, `role="alert"`, an
assertive live region, sentence-case copy, and a 44px recovery action. The
button remains blue because retry is constructive, not destructive. Expose a
short user-safe explanation; never display stack traces, raw response objects,
or implementation language such as “initialization failed.”

If an organization lookup fails, retry the organization context itself before
retrying page data. If existing data is still trustworthy, keep it visible and
show the shared `FailureNotice` instead of replacing it. Mutation failures
belong in a destructive toast, field validation, or `SaveStatus`; they do not
replace successfully loaded page content. Render crashes use `FatalErrorState`,
which offers one refresh action and one safe route back to the dashboard.

An expected access restriction, plan gate, missing route, expired link, or
completed transaction is a domain state rather than a retryable source failure.
Use its dedicated public or terminal treatment instead of `ErrorState`.

### Action Button Pattern

Primary actions should use the typed action primitive in the shell:

```tsx
<HeaderAction label="Add contact" icon={<Plus />} onClick={handleCreate} />
```

A primary action creates, commits, sends, publishes, or advances the page's main
task. Opening a dialog does not make a command secondary when its intent is still
creation. Navigation, refresh, preview, export, and other utilities remain
secondary even when no primary action exists; never turn them blue merely to fill
the final shell slot.

Primary actions inside a page or mobile command bar use consistent styling and a
44 pixel minimum target:

```tsx
<Button
  className="h-11"
  onClick={handleClick}
>
  <Icon className="h-4 w-4 mr-2" />
  Button Text
</Button>
```

List-page mobile search, filters, and actions use `MobileQueryBar`, which enforces
the same minimum target for descendant inputs and buttons.

### Automated enforcement

`src/design-system/visual-language.test.ts` is the executable counterpart to
this guide. It inventories every protected route from `App.tsx` and fails when a
new routed page has not been enrolled in the `PageLayout` contract. It also
guards the shared status palette, detail identity blocks, stat-card rails,
service previews, availability controls, typed list queries, shell action
hierarchy, mobile touch targets, and app-icon accent.

When a new page introduces a legitimate new visual grammar, document that
grammar here and add an explicit tested exception. Do not weaken a broad rule or
silently omit the route from the inventory.

### Status Icon Pattern

Build domain status maps from the shared status visual primitive:

```tsx
import { defineStatus } from '@/lib/statusVisuals'

const status = defineStatus('Active', 'blue', Play)

<Badge className={status.badgeClass}>{status.label}</Badge>
```

### Loading Pattern

```tsx
import { LoadingState } from '@/components/LoadingState'
import { PageLoading } from '@/components/ui/page-loading'

<PageLoading message="Loading campaign" />
<LoadingState kind="section" message="Loading activity" />
```

Use these only for initial source acquisition. A background refresh preserves
the current content and exposes busy state on its owning region and action.

---

## Usage Guidelines

### Color Usage Rules

1. **Primary actions** → Use the default `Button`; non-Button controls add `interaction-button--primary`
2. **Itemize-owned active/draft states** → Use blue
3. **Successful outcomes** → Use green
4. **Parked/transitional states** → Use orange
5. **Attention/error outcomes** → Use red
6. **Module indicators** → Distinguish by icon shape, not color; page icons all take the app accent
7. **Usage/progress meters** → Use `Progress`; do not tint the full container behind a meter
8. **Get Started** → Use `Progress` on card chrome; do not tint the card

### Spacing Guidelines

- Section titles: `mb-8`
- Card spacing: `gap-4` (grid), `mb-8` (stacking)
- Form fields: `mb-4`
- Button groups: `gap-2`

### Border Guidelines

- Cards: `border border-border`
- Dividers: `border-b`

---

## Theme System

The design system supports light and dark themes via CSS variables defined in `src/index.css`.

### Theme Tokens

```css
/* Light theme (default) */
:root {
  --background: 220 13% 95%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%; /* Tailwind blue-600 */
  --primary-foreground: 0 0% 100%;
  --primary-hover: 224.3 76.3% 48%; /* Tailwind blue-700 */
  --secondary: 210 40% 96.1%;
  --muted: 210 40% 96.1%;
  --accent: 210 40% 96.1%;
  --destructive: 0 84.2% 60.2%;
  --border: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
  --radius: 0.5rem;
}

/* Dark theme — same brand primary */
.dark {
  --background: 217 28% 22.5%;
  --foreground: 210 20% 98%;
  --card: 217 26% 24.5%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 0 0% 100%;
  --primary-hover: 224.3 76.3% 48%;
  --secondary: 217 25% 33.5%;
  --muted: 217 25% 33.5%;
  --accent: 217 22% 25%;
  --destructive: 0 72% 55%;
  --border: 217 20% 37%;
}
```

### Working with Themes

```tsx
import { useTheme } from 'next-themes'

function MyComponent() {
  const { theme } = useTheme()
  
  return (
    <div className={theme === 'dark' ? 'text-white' : 'text-black'}>
      Content
    </div>
  )
}
```

Or use the built-in shadcn/ui component that handles theme automatically:

```tsx
<div className="bg-background text-foreground">
  Automatically adapts to theme
</div>
```

---

## Font Styles

All text uses Raleway (primary) display font:

```tsx
// Heading with display font
<h1 className="landing-heading font-raleway">
  Headline
</h1>

// Body text
<p className="text-sm text-muted-foreground">
  Description text
</p>

// Link
<a className="text-blue-600 hover:underline dark:text-blue-400">
  Link text
</a>
```

---

## Personalized overview signals

Dashboard overviews use one framed source of truth rather than separate fixed
summary and operations card walls.

- Render pinned signals as one compact, bordered matrix inside an inset
  `FramedSection`; the cells are related content, not independent cards.
- Use iconography and the catalog module label to communicate source. Reserve
  green, orange, and red for semantic state or severity, never sidebar identity.
- Keep unresolved required-attention signals visible even when they are not
  pinned. Do not duplicate one when it is already pinned.
- Scope saved pin order to both the organization and user, sanitize persisted
  identifiers, and enforce the shared one-to-eight signal limit.
- Every signal is a complete, keyboard-accessible deep link to its owning
  workflow. Keep drag ordering and unpinning on the rendered signal itself;
  the add dialog only owns discovery through the shared `SearchField`,
  `Select`, `Button`, tooltip, badge, and empty-state primitives.
- Keep discovery rows to the signal title, owning module, and Pin action. Do not
  repeat catalog descriptions when the title and module already establish the
  choice. Search only the information presented in those rows.
- Present signal discovery as one responsive picker: an anchored, height-bounded
  popover on desktop and a bottom sheet below 768 pixels. Search and module
  filtering stay fixed above the independently scrolling result list. Keep the
  picker open for consecutive pins and close it when the eighth slot is filled.
- Show unused capacity as minimal dashed open-slot controls directly beneath
  the pinned matrix. Number each slot against the shared maximum and route it
  to the same add dialog; do not restore a separate pinned-count heading row.
- Give drag handles keyboard sensors and a dedicated touch-safe target. Keep
  management controls separate from the signal's navigation target and never
  allow the last pinned signal to be removed.
- At narrow widths, stack all signals in order. Do not put overview truth in a
  carousel or hide it behind horizontal scrolling.

The initial storage adapter is device-local. Keep its public hook contract
storage-agnostic so it can move to a user-preference API without changing the
overview component.

---

## Modal anatomy

Use `ModalContent`, `ModalHeader`, `ModalBody`, and `ModalFooter` for task and
detail dialogs. This anatomy is a behavioral contract, not optional styling.

- The shell is bounded to the viewport and never owns task scrolling.
- The header and footer remain visible; only `ModalBody` scrolls.
- Every modal has a concise sentence-case title and a description in the
  accessibility tree. Use `descriptionVisuallyHidden` when visible supporting
  copy would merely repeat context already present in the interface.
- The header reserves the automatic close-button lane. Put header actions in
  the `actions` slot instead of absolutely positioning controls near Close.
- Use one primary footer action. Put Cancel or a secondary action before it.
  A footer may be omitted only for preview, search, or immediate-selection
  experiences where choosing content completes the interaction.
- Use the blue theme variant for the header's semantic icon. Status and
  destructive colors belong to content or explicit confirmation actions.
- Use `ModalSection` only when the body contains multiple named conceptual
  groups. Do not add cards around individual fields.
- Use `DeleteDialog` for destructive confirmation and `AlertDialog` for a
  decision that must block the underlying workflow.

The base `DialogContent` remains viewport-bounded as a safety fallback for
legacy and specialized studio dialogs. New task dialogs must use the modal
anatomy rather than relying on whole-shell scrolling.

---

## Data fetching

Treat fetching as part of the application design system. A stable interface
must also have stable request ownership, freshness, and failure behavior.

### Mutation lifecycle

- A business mutation has one visible owner and one pending state. Disable its
  initiating control immediately, expose `aria-busy`, and do not allow a second
  handler to run while the first is unresolved.
- Sends, charges, refunds, publishing, generation, and other externally visible
  actions carry a server-enforced idempotency key. Keep that key stable when an
  unchanged payload is retried after an ambiguous failure. Rotate it only when
  the payload changes, the server confirms an outcome, or the user explicitly
  cancels the attempt. `useStableMutationKey` owns this browser lifecycle.
- A confirmed mutation and its follow-up refresh are separate failure domains.
  If delivery succeeds but a conversation refresh fails, report the delivery as
  accepted and the refresh as delayed; never relabel the business action as
  failed.
- Patch the authoritative returned entity into its owning cache. Invalidate only
  derived route snapshots and list/count queries that cannot be patched safely.
- Error copy must state whether the action was rejected, left unchanged, or
  could not be confirmed. When an unchanged retry is idempotent, say that retry
  is safe.

See [the mutation lifecycle audit](./mutation-audit.md) for current high-impact
coverage and the remaining migration queue.

- Give every route one critical read model when its fields share the same
  organization, filters, freshness window, and error boundary. GraphQL already
  provides the endpoint; compose one named route operation instead of issuing a
  request per card. Dashboard uses `DashboardSnapshot` as this pattern.
- Keep independently mutated, paginated, live, or deliberately lazy content in
  separate queries. Aggregation is a lifecycle boundary, not a goal of putting
  every possible field into one payload.
- Hydrate viewer and onboarding state when the authentication boundary changes,
  not on every pathname. Organization-scoped bootstrap state changes only when
  the selected organization changes.
- Scope query keys by organization and every server-side filter. Fresh data may
  be reused on remount; never force `refetchOnMount: 'always'` globally.
- Pass React Query's `AbortSignal` through the transport. Search, filter, period,
  and organization changes must cancel obsolete reads so late responses cannot
  replace current truth.
- Retry only transient reads. Do not retry permanent 4xx responses. Treat 429
  as manual-retry-only until the transport preserves and schedules against the
  server's `Retry-After` value. Mutations do not retry by default because sends,
  charges, and other business actions are not assumed idempotent; opt in only
  with a server-enforced idempotency key.
- Pause polling while the document is hidden and avoid overlapping a polling
  loop with an active realtime subscription. Realtime events should update or
  narrowly invalidate the owning cache rather than refresh the whole route.
- After a mutation, patch trustworthy returned data into its cache and
  invalidate only derived snapshots. Avoid page-wide refetch sequences.
- Compatibility fallbacks must remember a negotiated capability. Do not repeat
  a ladder of intentionally failing schema requests on every list refresh.
- A route, editor bootstrap, preview, or compatibility fallback may not walk
  every server page. Fetch one bounded support page, lazy-load additional
  choices behind an explicit user action, and resolve a selected deep-linked
  record directly when it falls outside that page.
- Aggregate resolvers must honor the requested GraphQL selection. A legacy
  compatibility field may remain in the schema, but its repository read must
  not run when the current operation omits that field.

Cold-route request budgets are measured by ownership: shell bootstrap, the
route's critical operation, and explicitly documented secondary reads. A new
card does not receive a new request merely because it is visually separate.
Compatibility mode changes operation shape, not cardinality: each support
resource still receives at most one bounded read. An off-page selected record
may add one direct lookup; it must never trigger an implicit page-walking loop.

See [the measured fetching audit](./fetching-audit.md) for the current request
budgets, observed route counts, and prioritized migration queue.

---

## Migration Guide

When updating existing components to use the design system:

1. Declare each status once with `defineStatus`; delete inline color classes
2. Render index pages through `PageLayout` (header, mobile bar, and frame)
3. Render routed entity pages through `EntityDetailHeader`
4. Put page-level stat summaries in `FramedSection` + `ResponsiveCardRail`; use only the rail when an enclosing frame already exists
5. Use `EmptyState` / `ErrorState` inside the layout body
6. Use `DeleteDialog` for destructive confirmation rather than a bespoke dialog
7. Give configurable embedded services a routed editor with Settings / Appearance / Install modes and the shared `LiveServicePreview`
8. Structure task dialogs with the shared modal anatomy; keep scrolling in `ModalBody`
9. Consolidate same-lifecycle route reads, use organization-scoped query keys, and pass cancellation through the transport

Example migration:

**Before:**
```tsx
<Badge className="border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300">
  Active
</Badge>
```

**After:**
```tsx
import { getCatalogStatusVisual } from '@/pages/campaigns/constants/campaignVisuals'

const visual = getCatalogStatusVisual(template.is_active)

<Badge className={visual.badgeClass}>{visual.label}</Badge>
```
