# Itemize Design System

This design system provides a unified set of design tokens, components, and patterns to ensure consistency across all modules in Itemize.

## Quick Start

```tsx
// Declare a status once; every surface reads from it
import { defineStatus } from '@/lib/statusVisuals'

// Shared page chrome
import { PageLayout } from '@/components/layout/PageLayout'
import { EntityDetailHeader } from '@/components/layout/EntityDetailHeader'
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail'

// Cross-module components
import { ActivityTimeline } from '@/components/activity-timeline'
import { CrossModuleSearch } from '@/components/cross-module-search'
import { ModuleWidget, InvoicesWidget, SignaturesWidget } from '@/design-system'
```

## What's Included

### 1. The status palette (`@/lib/statusVisuals`)

`src/lib/statusVisuals.ts` is the single definition of status color. Five themes
carry the whole grammar (blue, orange, green, red, gray), and every other module
derives from it -- including `design-tokens.ts` here, which is only a lookup by
raw status string for the client-profile surfaces.

**Usage:**
```tsx
import { defineStatus } from '@/lib/statusVisuals'

const STATUS = { paid: defineStatus('Paid', 'green', CheckCircle) }

<Badge className={STATUS.paid.badgeClass}>{STATUS.paid.label}</Badge>
```

`design-system/visual-language.test.ts` fails the build if a second palette
declaration appears anywhere in `src/`.

### 2. Activity Timeline (`components/activity-timeline/`)
Shows unified activity history across all modules (invoices, contacts, signatures, campaigns, etc.).

**Usage:**
```tsx
import { ActivityTimeline } from '@/components/activity-timeline'

<ActivityTimeline
  activities={activities}
  loading={isLoading}
  empty={{ title: 'No activity yet', description: '...' }}
  onSelectActivity={(activity) => navigate(activity.target?.url)}
/>
```

### 3. Cross-Module Search (`components/cross-module-search/`)
Searches across contacts, invoices, documents, notes, and more from a single input.

**Usage:**
```tsx
import { CrossModuleSearch } from '@/components/cross-module-search'

<CrossModuleSearch
  placeholder="Search everything..."
  onSelectResult={(result) => navigate(result.url)}
  organizationId={organizationId}
/>
```

### 4. Module Widgets (`design-system/widgets/`)
Pre-configured widgets for displaying module-specific information.

**Available Widgets:**
- `InvoicesWidget` - Invoice stats & pending items
- `SignaturesWidget` - Signature requests & awaiting documents
- `WorkspaceWidget` - Canvas/notes/lists activity
- `ContactsWidget` - Contact growth & activity
- `DealsWidget` - Pipeline/deals progress

**Usage:**
```tsx
import { InvoicesWidget, SignaturesWidget, WorkspaceWidget } from '@/design-system/widgets'

<InvoicesWidget
  primaryStat={5}
  primaryStatLabel="Pending"
  primaryStatColor="text-orange-600"
  secondaryStats={[
    { label: 'Overdue', value: 2, color: 'text-red-600' },
    { label: 'Paid', value: 12, color: 'text-green-600' },
  ]}
  recentItems={[
    { id: '1', title: 'INV-001', subtitle: '$500', status: { label: 'Pending', color: 'text-orange-600' } },
  ]}
  action={{ label: 'View Invoices', onClick: () => navigate('/invoices') }}
/>
```

### 5. Type Definitions
TypeScript types for activities and search results.
- `Activity` - Activity timeline items
- `SearchResult` - Cross-module search results

### 6. Utilities
- `transformApiActivityToDesignSystem()` - Converts API format to design system format
- `createMockActivity()` - Creates mock activity data for testing
- `createMockTimelineData()` - Creates mock timeline data

## Documentation

See `index.md` for complete documentation on:
- Design tokens
- Component library
- Pattern library
- Usage guidelines
- Theme system
- Migration guide

## Theme Support

All components support light and dark themes through CSS variables defined in `src/index.css`. Use shadcn/ui components for automatic theme support, or check `useTheme` hook for custom behavior.

## Best Practices

1. **Declare statuses with `defineStatus`** instead of hardcoded color classes
2. **Distinguish modules by icon shape, not color** -- page icons all take the app accent
3. **Follow the pattern library** for common UI patterns
4. **Use PageLayout** for all authenticated pages (and public Status/Docs via `PublicPageHeader`)
5. **Use EntityDetailHeader** for every routed entity detail or editor page

Status semantics are fixed across modules: blue is active/draft Itemize work, orange is
parked or transitional, green is a successful outcome, red requires attention, and gray
is neutral or historical. Domain status maps should be built with `defineStatus` from
`@/lib/statusVisuals` rather than hardcoded class strings.

## Roadmap

- [ ] Add more module widgets (Campaigns, Automations, Forms, etc.)
- [ ] Create Storybook for visual component testing
- [ ] Add more search filters (date range, status, etc.)
- [ ] Enhance activity timeline with click-to-view details
- [ ] Create design system playground/demo page
