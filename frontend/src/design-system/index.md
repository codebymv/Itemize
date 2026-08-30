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

Primary actions are `bg-blue-600 hover:bg-blue-700 text-white`. The app accent --
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

<Button className="bg-blue-600 text-white hover:bg-blue-700">
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
<Card className="cursor-pointer hover:shadow-md transition-all" onClick={handleClick}>
  {/* card content */}
</Card>
```

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

Wrap `StatCard`s in `ResponsiveCardRail`: one markup, a snap-scrolling rail with
dot indicators on mobile and a grid on desktop. Cards use `surface="inset"` so a
summary reads as recessed against the page surface. A lone odd trailing card is
centered automatically -- do not hand-tune it.

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
  className="h-11 bg-blue-600 text-white hover:bg-blue-700"
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
import { PageLoading } from '@/components/ui/page-loading'

<PageLoading />
```

---

## Usage Guidelines

### Color Usage Rules

1. **Primary actions** → Always use `bg-blue-600 hover:bg-blue-700`
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

## Migration Guide

When updating existing components to use the design system:

1. Declare each status once with `defineStatus`; delete inline color classes
2. Render index pages through `PageLayout` (header, mobile bar, and frame)
3. Render routed entity pages through `EntityDetailHeader`
4. Put stat summaries in `ResponsiveCardRail` so they become a swipe rail on mobile
5. Use `EmptyState` / `ErrorState` inside the layout body
6. Use `DeleteDialog` for destructive confirmation rather than a bespoke dialog
7. Give configurable embedded services a routed editor with Settings / Appearance / Install modes and the shared `LiveServicePreview`

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
