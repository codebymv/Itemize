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
```typescript
import { semanticColors } from '@/design-system/design-tokens'

// Available statuses: active, paused, completed, pending, draft, published
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

All authenticated pages should use the `PageContainer` and `PageSurface` pattern:

```tsx
import { PageContainer, PageSurface } from '@/components/layout/PageContainer'
import { MobileControlsBar } from '@/components/MobileControlsBar'

function MyPage() {
  return (
    <>
      <MobileControlsBar>{/* mobile-only controls */}</MobileControlsBar>
      <PageContainer>
        <PageSurface>
          {/* page content */}
        </PageSurface>
      </PageContainer>
    </>
  )
}
```

### Empty State Pattern

```tsx
import { EmptyState } from '@/components/EmptyState'

<EmptyState
  icon={<YourIcon className="h-12 w-12" />}
  title="No items yet"
  description="Get started by creating your first item"
  action={{
    label: "Create Item",
    onClick: handleCreate
  }}
/>
```

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

For status indicators (pending, active, archived):

```tsx
<div className={`h-8 w-8 rounded-full flex items-center justify-center ${
  status === 'active' ? 'bg-green-100 dark:bg-green-900/30' : 
  status === 'paused' ? 'bg-orange-100 dark:bg-orange-900/30' : 
  status === 'draft' ? 'bg-gray-100 dark:bg-gray-800' : ''
}`}>
  <StatusIcon className="h-4 w-4" />
</div>
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
2. **Success states** → Use green (`bg-green-600`, `bg-green-100`)
3. **Warning states** → Use orange (`bg-orange-600`, `bg-orange-100`)
4. **Error states** → Use red (`bg-red-600`, `bg-red-100`)
5. **Module indicators** → Use `semanticColors.module.*`

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
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --muted: 210 40% 96.1%;
  --accent: 210 40% 96.1%;
  --destructive: 0 84.2% 60.2%;
  --border: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}

/* Dark theme */
.dark {
  --background: 215 28% 21%;
  --foreground: 210 20% 98%;
  --card: 215 25% 25%;
  --primary: 210 40% 98%;
  --primary-foreground: 215 28% 21%;
  --secondary: 215 25% 34%;
  --muted: 215 25% 34%;
  --accent: 215 20% 25%;
  --destructive: 0 72% 55%;
  --border: 215 20% 37%;
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
4. Ensure all pages use the `PageContainer` + `PageSurface` pattern
5. Add `MobileControlsBar` for responsive controls

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