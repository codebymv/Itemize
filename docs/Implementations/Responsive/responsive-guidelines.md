# Responsive Design Guidelines

## Breakpoint Standards

The app uses Tailwind's default breakpoints with specific conventions:

| Breakpoint | Width | Primary Use |
|------------|-------|-------------|
| `sm:` | 640px | Text fitting in constrained spaces |
| `md:` | 768px | **Mobile/desktop content decisions** |
| `lg:` | 1024px | Extended layouts (DocsPage sidebar) |
| `xl:` | 1280px | Wide screen optimizations |

## Key Conventions

### 1. Mobile/Desktop Content Visibility (`md:` - 768px)

Use `md:` breakpoint for deciding **what content to show or hide**:

```tsx
// Desktop-only controls (hidden on mobile)
<div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
  {/* Search, filters, action buttons */}
</div>

// Mobile-only content
<span className="md:hidden">{mobileContent}</span>

// Content shown on desktop and larger
<span className="hidden md:inline">{fullText}</span>
```

### 2. Text Fitting in Constrained Spaces (`sm:` - 640px)

Use `sm:` breakpoint for **progressive text reveal** in compact UI elements like tabs:

```tsx
// Tab navigation: icons-only on very small, text on 640px+
<TabsTrigger className="flex items-center gap-1.5 text-xs sm:text-sm">
  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
  <span className="hidden sm:inline">{item.title}</span>
</TabsTrigger>
```

This pattern is valid for:
- Horizontal tab navigation
- Compact button text (icon + short label)
- Text size scaling (`text-xs sm:text-sm`)
- Icon size scaling (`h-3.5 sm:h-4`)

### 3. MobileControlsBar Component

All pages with desktop header controls MUST have a matching `MobileControlsBar`:

```tsx
// Desktop: hidden md:flex controls in header
<div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
  <SearchInput />
  <Button>Create New</Button>
</div>

// Mobile: MobileControlsBar below header
<MobileControlsBar className="flex-col items-stretch gap-2">
  <SearchInput />
  <Button>Create New</Button>
</MobileControlsBar>
```

### 4. Responsive Grids

Standard responsive grid patterns:

| Layout | Classes |
|--------|---------|
| Cards (3-col max) | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` |
| Cards (4-col max) | `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` |
| Stat cards | `grid-cols-1 md:grid-cols-4` |
| 2-column layout | `grid-cols-1 lg:grid-cols-2` |
| Contents grid | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` |

### 5. Table Column Priority (Progressive Hiding)

For responsive tables, hide columns progressively:

```tsx
<th className="text-left">Title</th>              {/* Always show */}
<th className="hidden sm:table-cell">Status</th>  {/* 640px+ */}
<th className="hidden md:table-cell">Category</th>{/* 768px+ */}
<th className="hidden lg:table-cell">Details</th> {/* 1024px+ */}
```

### 6. View Mode Switching

For complex data, consider switching between table and card views:

```tsx
const isMobile = useIsMobile(); // < 768px

{isMobile ? (
  <CardList items={items} />
) : (
  <DataTable items={items} />
)}
```

## Exceptions

### DocsPage Sidebar

DocsPage uses `lg:` (1024px) for sidebar visibility because:
- The 320px sidebar needs more screen space for readable documentation
- Code blocks require adequate horizontal space
- This is documented as an intentional exception

## useIsMobile Hook

Located at `@/hooks/use-mobile.tsx`:

```tsx
const isMobile = useIsMobile(); // Returns true when viewport < 768px
```

Use for:
- JavaScript-based view switching (table → cards)
- Conditional component rendering
- Dynamic calculations based on screen size

**Prefer CSS-based responsive (`hidden md:flex`) when possible** for better performance and avoiding hydration issues.
