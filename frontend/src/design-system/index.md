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

Design tokens are the foundational elements of the design system. They are defined in `src/design-system/design-tokens.ts` and should be used instead of hardcoded Tailwind classes.

### Colors

#### Primary Colors
Used for primary actions, CTAs, and interactive elements.

| Token | Value | Usage |
|-------|-------|-------|
| `designTokens.colors.primary` | `bg-blue-600` | Primary buttons, links |
| `designTokens.colors.primaryHover` | `hover:bg-blue-700` | Hover states |
| `designTokens.colors.primaryLight` | `bg-blue-100 dark:bg-blue-900` | Light backgrounds |

#### Semantic Colors
Use `semanticColors` for status and module-specific coloring.

**Status Colors:**

The application-wide semantic grammar is:

- Blue: Itemize-owned active, draft, and live working states.
- Orange: parked or transitional states such as sent, viewed, partial, pending, paused, and inactive.
- Green: successful outcomes such as paid, accepted, completed, succeeded, and won.
- Red: outcomes requiring attention such as overdue, failed, declined, expired, cancelled, and archived.
- Gray: neutral or historical states such as refunded.

```typescript
import { semanticColors } from '@/design-system/design-tokens'

<div className={semanticColors.status.active}>Active</div>
<div className={semanticColors.status.pending}>Pending</div>
```

**Module Colors:**
```typescript
// For icons/badges indicating which module content is from
<Package className={semanticColors.module.invoice} />
<Users className={semanticColors.module.contact} />
```

### Spacing

Predefined spacing values for consistency:

| Token | Value | CSS |
|-------|-------|-----|
| xs | 0.25rem | 4px |
| sm | 0.5rem | 8px |
| md | 0.75rem | 12px |
| lg | 1rem | 16px |
| xl | 1.5rem | 24px |
| 2xl | 2rem | 32px |
| 3xl | 3rem | 48px |

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
import { colorMixins } from '@/design-system/design-tokens'

<Button className={colorMixins.primary()}>
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
```tsx
import { Badge } from '@/components/ui/badge'
import { semanticColors } from '@/design-system/design-tokens'

<Badge className={semanticColors.status.completed}>
  Completed
</Badge>
```

### Icons

All icons come from `lucide-react`. Use semantic colors for module context:

```tsx
import { Users, Wallet, FileSignature, Zap, Calendar, Mail, MessageSquare, Star } from 'lucide-react'
import { semanticColors } from '@/design-system/design-tokens'

// Module icons
<Users className={semanticColors.module.contact} />
<Wallet className={semanticColors.module.invoice} />
<FileSignature className={semanticColors.module.signature} />
<Zap className={semanticColors.module.workflow} />
<Mail className={semanticColors.module.campaign} />
<MessageSquare className={semanticColors.module.social} />
<Calendar className={semanticColors.module.calendar} />
<Star className={semanticColors.module.signature} />
```

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

#### Shell identity contract

The shell header identifies the current section or task. It is not a toolbar.

- `title` must be a stable route-level string such as `CONTACTS`, `FORM EDITOR`, or `CALENDAR SETTINGS`.
- Never use a contact name, organization name, form name, workflow name, or other user-provided value as the shell title. Put that identity in the page surface.
- The complete title must remain visible. Do not add `truncate`, line clamping, clipping, or horizontal scrolling to the shell heading.
- A decorative module icon is optional. When supplied, it remains visible directly before the title at every viewport width and is hidden from assistive technology.
- `leading` is reserved for one `ShellBackButton`. It uses an arrow-only blue-600 treatment, an accessible destination label, a tooltip, and a fixed 44 by 44 pixel target; do not add a visible `Back` label beside the arrow.
- The Back control, optional section icon, and complete responsive section heading must remain on one aligned row with the spacing owned by `ResponsivePageHeading`.
- Editor Back controls must preserve their unsaved-change guard and navigate to their explicit parent route. History-oriented utility pages may use `useSafeShellBack`, but must supply a deterministic fallback route for direct visits and new tabs.
- Tabs, result counts, statuses, destructive commands, and arbitrary multi-button clusters are forbidden in the shell.
- When a page's labeled section navigation column is hidden, `compactNavigation` may replace the static shell identity with one icon-bearing destination selector until the same breakpoint. It must show the complete active label on one row, use the same icons and labels as the navigation column, and disappear when that column appears.
- On eligible high-frequency desktop pages, search, filters, one secondary action, and, when applicable, one primary action may use the named `desktopTools` slots. Pages may not inject an untyped toolbar.
- A shell-level refresh command uses `HeaderRefreshAction` in the appropriate named action slot. Its text label follows the shell container query and yields to the accessible 44 by 44 pixel icon control when space is constrained.
- Route-level administration sections use the same `compactNavigation` contract as Settings: one icon-bearing selector with the complete active label until the labeled navigation column appears.
- Administration content modes such as Users and Email Logs remain page-surface tabs, but their active mode must be URL-addressable so reload, deep links, and browser history preserve it.
- Dataset-wide administration search, filters, and refresh may use typed shell slots. Result counts, selections, bulk commands, queue-specific filters, and other contextual controls stay with their page-level dataset card.
- Global organization, notification, theme, and account controls belong to `AppShell`, not to pages.

On mobile, global controls occupy the first shell row and page identity occupies a separate row. The identity row may grow when a stable title wraps. On desktop, the shell remains 56 pixels high.

Desktop tools form one non-wrapping command lane in this fixed order: section identity, search, filters/sort, secondary action, primary action, global controls. The last applicable page action is therefore closest to notification and account chrome. A secondary-only action remains secondary and uses outline or ghost styling. The lane uses its own available width, not viewport width, to select a density:

- Spacious: full search, individual filters, icon plus secondary label, and `+ Add`.
- Medium: full search, one filter popover, icon plus secondary label, and `+ Add`.
- Compact: search and filter icon buttons, icon-only secondary action, and `+ Add`.
- Tight: one combined query popover, icon-only secondary action, and a 44 by 44 `+` primary action.

The title and global controls always win space. Header tools never wrap, and lower-priority query controls combine before an action or title is clipped. Compact controls require a tooltip and a complete accessible label. Generic object words such as “content” or “invoice” do not appear in the visible primary label; use `+ Add`, then `+` when tight.

#### Action density and deferment

Use the following destination rules instead of adding controls to the shell:

| Content | Destination |
| --- | --- |
| Frequent search, filters, sorting | Named `desktopTools` on desktop; mobile card on mobile |
| Result counts | Result summary or empty-state area inside the page surface |
| One primary and one secondary page command | Named `desktopTools` when they fit the header grammar |
| Additional or complex page commands | `pageActions`, rendered by `PageActionsBar` |
| Mobile commands | `mobileActions`, rendered as a non-sticky page card |
| Editor Save, Preview, Send, Publish | A page command card; use one primary action and overflow secondary commands when possible |
| Record name, status, URL, owner | Page intro or entity summary card |
| Destructive commands | Overflow menu or a dedicated danger card |
| Cross-section navigation | Sidebar or section navigation; one matching `compactNavigation` selector while that navigation is hidden |

Page action cards wrap with 8 pixel gaps and give buttons and comboboxes a minimum 44 pixel target. Mobile actions scroll with content; they must not become a second sticky application header. If a mobile action card needs more than two frequent commands, consolidate secondary commands into an overflow menu or filter sheet.

### Empty State Pattern

An empty state is valid only after a successful request. A failed request must render
the persistent, retryable `ErrorState`; never replace failed source-of-truth data with
an empty array and then show “No items yet.”

```tsx
import { EmptyState } from '@/components/EmptyState'

<EmptyState
  icon={Inbox}
  title="No items yet"
  description="Get started by creating your first item"
  actionLabel="Create Item"
  onAction={handleCreate}
/>
```

Use `size="compact"` inside cards, widgets, and dialogs.

### Action Button Pattern

Primary actions should use consistent styling:

```tsx
<Button
  size="sm"
  className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
  onClick={handleClick}
>
  <Icon className="h-4 w-4 mr-2" />
  Button Text
</Button>
```

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
6. **Module indicators** → Use `semanticColors.module.*`
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

1. Replace hardcoded color classes with `designTokens` or `colorMixins`
2. Replace hardcoded spacing with `designTokens.spacing`
3. Use `semanticColors` for status indicators
4. Ensure all pages use `PageLayout` (header, mobile bar, and frame)
5. Use `EmptyState` / `ErrorState` inside the layout body

Example migration:

**Before:**
```tsx
<Button className="bg-blue-600 hover:bg-blue-700 text-white font-light">
  Save
</Button>
```

**After:**
```tsx
import { colorMixins } from '@/design-system/design-tokens'

<Button className={colorMixins.primary('font-light')}>
  Save
</Button>
```
