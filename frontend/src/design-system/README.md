# Itemize Design System

This design system provides a unified set of design tokens, components, and patterns to ensure consistency across all modules in Itemize.

## Quick Start

```tsx
// Import design tokens
import { designTokens, semanticColors, colorMixins } from '@/design-system'

// Import components
import { ActivityTimeline } from '@/components/activity-timeline'
import { CrossModuleSearch } from '@/components/cross-module-search'
import { ModuleWidget, InvoicesWidget, SignaturesWidget } from '@/design-system'
```

## What's Included

### 1. Design Tokens (`design-tokens.ts`)
Centralized design tokens for colors, spacing, and other design properties.

**Usage:**
```tsx
import { designTokens, colorMixins, semanticColors } from '@/design-system/design-tokens'

// Use design tokens for consistent styling
<Button className={colorMixins.primary()}>Primary Action</Button>
<Badge className={semanticColors.status.active}>Active</Badge>
```

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

1. **Always use design tokens** instead of hardcoded colors
2. **Use semantic colors** for status indicators (`semanticColors.status.*`)
3. **Use module colors** for module-specific icons (`semanticColors.module.*`)
4. **Follow the pattern library** for common UI patterns
5. **Use PageContainer + PageSurface** for all authenticated pages

## Roadmap

- [ ] Add more module widgets (Campaigns, Automations, Forms, etc.)
- [ ] Create Storybook for visual component testing
- [ ] Add more search filters (date range, status, etc.)
- [ ] Enhance activity timeline with click-to-view details
- [ ] Create design system playground/demo page