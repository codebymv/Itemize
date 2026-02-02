# Frontend Codebase Refactoring Plan

## Executive Summary

This document outlines a comprehensive refactoring strategy for the Itemize.cloud frontend codebase to reduce bundle size, improve maintainability, and extract reusable components.

---

## Audit Findings

### Files Requiring Immediate Attention

| Priority | File | Current Lines | Primary Issues | Target Lines |
|----------|------|---------------|----------------|--------------|
| **CRITICAL** | `pages/canvas.tsx` | 2,285 | 267 functions, massive state, inline logic | ~340 |
| **HIGH** | `pages/invoices/InvoicesPage.tsx` | 1,197 | Listing, filters, modals inline | ~240 |
| **HIGH** | `pages/invoices/InvoiceEditorPage.tsx` | 1,192 | Form validation & calculations inline | ~260 |
| **HIGH** | `pages/invoices/RecurringInvoicesPage.tsx` | 1,178 | Recurring logic embedded | ~250 |
| **HIGH** | `pages/SettingsPage.tsx` | 1,106 | Multiple tabs/forms inline | ~300 |
| **HIGH** | `pages/AdminPage.tsx` | 1,020 | Analytics & user mgmt inline | ~280 |
| **HIGH** | `pages/DashboardPage.tsx` | 1,015 | Charts & stats inline | ~280 |
| **MEDIUM** | `pages/Home.tsx` | 997 | Landing sections inline | ~350 |
| **MEDIUM** | `pages/workspace/ContentsPage.tsx` | 982 | Content grid & filters inline | ~300 |

### Large Component Files (>500 lines)

| Component | Lines | Suggested Extraction |
|-----------|-------|----------------------|
| `CanvasContainer.tsx` | 966 | Extract: `useCanvasTransform`, `useDragAndDrop` hooks |
| `WhiteboardCanvas.tsx` | 922 | Extract: `DrawingEngine`, `ShapeComponents` |
| `RichNoteContent.tsx` | 808 | Extract: `EditorToolbar`, `FormatShortcuts` |
| `sidebar.tsx` | 768 | ✅ Already well-structured |
| `RichTextEditor.tsx` | 592 | Extract: `EditorConfig`, format command utilities |
| `WireframeCanvas.tsx` | 582 | Extract: `NodeFactory`, `EdgeDrawing` |
| `AppSidebar.tsx` | 565 | ✅ Already well-structured |
| `VaultCard.tsx` | 531 | Extract: `VaultContentRenderer` |
| `GlobalSearch.tsx` | 458 | Extract: `SearchResults`, `SearchFilters` |
| `CreateItemModal.tsx` | 439 | Extract: `CreateItemForm` per type |

---

## Common Code Smells Identified

### 1. Monster Components with 1000+ lines
Components handle: data fetching, state management, event handling, UI rendering, validation, and business logic all in one file.

**Example from `canvas.tsx`:**
- 267 functions/exports
- 15+ useState hooks
- WebSocket logic mixed with UI logic
- Position debouncing inline

### 2. Inline Complex Logic
Complex nested conditions and async operations embedded in JSX or component bodies.

```tsx
// ❌ Current pattern - 100+ line handler
const handleCardClick = async (event: React.MouseEvent) => {
  // 50 lines of position calculation
  // 30 lines of conditional logic
  // 20 lines of API calls with error handling
}

// ✅ Better pattern
const { handleCardClick } = useCardClickHandler({ onOpenModal });
```

### 3. Duplicate Code Patterns
Category management, filtering, and modal logic repeated across multiple pages.

### 4. Unused Imports
Large files often have 40-80% unused imports from copy-paste patterns.

---

## Refactoring Strategy

### Phase 1: Critical - Canvas Page Refactoring

**Goal**: Reduce `canvas.tsx` from 2,285 → ~340 lines (85% reduction)

**New Structure:**
```
pages/canvas/
├── CanvasPage.tsx                    # Main container (~100 lines)
├── index.ts                         # Re-exports
├── hooks/
│   ├── useCanvasData.ts              # All data fetching logic
│   ├── useCanvasFilters.ts          # Filter state & logic
│   ├── useCanvasContextMenu.ts      # Context menu logic
│   ├── useCanvasWebSocket.ts         # Socket integration
│   ├── useCanvasPositionSync.ts     # Debounced position updates
│   └── useCanvasCategories.ts       # Category management
├── components/
│   ├── CanvasToolbar.tsx             # Top toolbar with filters
│   ├── CanvasContent.tsx             # Main canvas content wrapper
│   ├── CanvasFilters.tsx             # Filter controls
│   ├── CreateItemTrigger.tsx        # Floating action button
│   ├── CanvasPlaceholder.tsx         # Empty state
│   └── modals/
│       └── ShareModal.tsx            # Already exists
└── constants/
    ├── canvasConstants.ts           # Position debounce values, etc.
    └── itemTypes.ts                 # Item type definitions
```

**Extraction Example:**

```tsx
// hooks/useCanvasPositionSync.ts
export function useCanvasPositionSync() {
  const updatePositions = useCallback(
    debounce(async (items: CanvasItem[]) => {
      await api.updateCanvasPositions(items);
    }, POSITION_UPDATE_DEBOUNCE_MS),
    []
  );

  return { updatePositions };
}

// hooks/useCanvasData.ts
export function useCanvasData() {
  const [items, setItems] = useState< CanvasItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [lists, notes, whiteboards] = await Promise.all([
        fetchCanvasLists(),
        getNotes(),
        getWhiteboards(),
      ]);
      setItems({ lists, notes, whiteboards });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  return { items, loading, refetch: fetchAllData };
}
```

### Phase 2: High Priority - Page-Level Refactoring

#### Invoice Pages

**Target Files:**
- `InvoicesPage.tsx`: 1,197 → ~240 lines
- `InvoiceEditorPage.tsx`: 1,192 → ~260 lines
- `RecurringInvoicesPage.tsx`: 1,178 → ~250 lines

**New Structure:**
```
pages/invoices/
├── index.ts                          # Re-exports
├── InvoicesPage.tsx                  # Container (~120 lines)
├── InvoiceEditorPage.tsx             # Editor container (~160 lines)
├── RecurringInvoicesPage.tsx         # Recurring UI (~140 lines)
├── components/
│   ├── InvoiceTable.tsx              # Desktop table listing
│   ├── InvoiceCard.tsx               # Mobile card view
│   ├── InvoiceFilters.tsx            # Filter controls
│   ├── InvoiceStatusBadge.tsx       # Status display
│   ├── InvoiceActions.tsx            # Bulk actions menu
│   ├── InvoiceLineItems.tsx          # Line items editor
│   ├── InvoiceTotals.tsx             # Calculations display
│   └── RecurrenceSchedule.tsx       # Schedule selector
├── hooks/
│   ├── useInvoiceData.ts             # Fetching & filtering
│   ├── useInvoiceForm.ts             # Form state & validation
│   ├── useInvoiceCalculations.ts     # Tax/totals math
│   └── useRecurringInvoices.ts       # Recurrence logic
└── utils/
    ├── invoiceCalculations.ts        # Math utilities
    ├── invoiceValidators.ts          # Zod schemas
    └── invoiceFormatters.ts          # Display formatters
```

#### Dashboard Page

**Target**: `DashboardPage.tsx`: 1,015 → ~280 lines

**New Structure:**
```
pages/DashboardPage.tsx               # Container (~100 lines)
components/Dashboard/
├── StatCards.tsx                      # Stats grid
├── QuickActions.tsx                   # Action buttons
├── AnalyticsCharts.tsx                # Chart components
├── RecentActivity.tsx                # Activity feed
└── PipelineFunnel.tsx                 # Funnel visualization
hooks/
└── useDashboardData.ts                # Data fetching
```

#### Settings Page

**Target**: `SettingsPage.tsx`: 1,106 → ~300 lines

**New Structure:**
```
pages/SettingsPage.tsx                 # Container (~150 lines)
pages/settings/
├── AccountSettings.tsx              # Account tab
├── Preferences.tsx                   # Preferences tab
├── PaymentSettings.tsx               # Payment setup
├── components/
│   ├── BusinessForm.tsx             # Business editing
│   ├── LogoUpload.tsx                # Logo upload UI
│   └── PaymentMethodSetup.tsx        # Payment method selection
```

### Phase 3: Medium Priority - Component Extraction

#### Canvas Components

**CanvasContainer.tsx** (966 → ~300 lines):

Extract:
```
components/Canvas/
├── useCanvasTransform.ts             # Zoom/pan logic
├── useCanvasDragDrop.ts             # DnD callbacks
└── constants.ts                     # Default transforms, bounds
```

#### Rich Text Components

**RichNoteContent.tsx** (808 → ~250 lines):

Extract:
```
components/NoteCard/
├── RichNoteContent.tsx              # Main editor (~120 lines)
├── EditorToolbar.tsx                # Formatting toolbar (~80 lines)
├── FormatShortcuts.tsx             # Keyboard shortcuts (~60 lines)
└── utils/
    └── formatCommands.ts            # Format function utilities
```

#### Global Search

**GlobalSearch.tsx** (458 → ~200 lines):

Extract:
```
components/GlobalSearch.tsx           # Main modal (~80 lines)
components/GlobalSearch/
├── SearchResults.tsx                # Results list (~80 lines)
├── SearchFilters.tsx                # Filter controls (~40 lines)
├── SearchInput.tsx                  # Search field (~30 lines)
hooks/
└── useSearchIndex.ts                # Indexing & fuzzy search
```

### Phase 4: Bundle Optimization

#### Code Splitting

**Current Status**: Only 11/35 components are lazy-loaded

**Action**: Add `React.lazy()` for all dynamic imports

```tsx
// ❌ Current
import DashboardPage from './pages/DashboardPage';

// ✅ Better
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));

// With loading fallback
<Suspense fallback={<PageLoading />}>
  <DashboardPage />
</Suspense>
```

**Priority List for Lazy Loading**:
1. Admin pages (not accessed by most users)
2. Workflow builder (complex)
3. Whiteboard/Wireframe editors (canvas tools)
4. Campaign/Marketing pages
5. Invoice/Payment pages (business users only)

#### Dependency Tree Shaking

Audit and remove unused packages:

```ts
// Common unused imports found:
- Full chart libraries (use chart.js-light)
- Moment.js (use date-fns, already used)
- Lodash (use only needed functions)
```

#### Conditional Loading

```tsx
// Load chart libraries only when displaying charts
const ChartComponent = React.lazy(() =>
  Promise.all([
    import('recharts'),
    import('./AnalyticsCharts')
  ]).then(([_, module]) => module)
);

// Load editor only when user clicks to edit
const Editor = React.lazy(() => import('@/components/editor/RichTextEditor'));
```

---

## Implementation Steps

### Step 1: Set Up Tooling

```bash
# Install analysis tools
npm install -D eslint-plugin-unused-imports eslint-plugin-unicorn

# Add to eslint.config.js
{
  plugins: ['unicorn', 'unused-imports'],
  rules: {
    'unicorn/filename-case': ['error', { case: 'camelCase' }],
    'unused-imports/no-unused-imports': 'error'
  }
}
```

### Step 2: Create Refactoring Branch

```bash
git checkout -b refactor/frontend-cleanup
git checkout -b refactor/canvas-extraction
git checkout -b refactor/invoice-pages
git checkout -b refactor/dashboard-cleanup
```

### Step 3: Execute Phase by Phase

For each file:

1. **Create new directory structure**
2. **Extract hooks first** (test logic stays in place)
3. **Extract utility functions**
4. **Extract subcomponents**
5. **Update imports in main file**
6. **Run tests to verify**
7. **Commit changes**

### Step 4: Enable Strict Linting

```ts
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:unicorn/recommended"
  ],
  "rules": {
    "complexity": ["error", 15],
    "max-depth": ["error", 4],
    "max-lines-per-function": ["error", 50],
    "max-params": ["error", 4]
  }
}
```

### Step 5: Bundle Size Monitoring

```bash
# Install analysis tools
npm install -D @next/bundle-analyzer

# Build with analysis
npm run build:analyze

# Check size before and after
```

---

## Expected Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Largest file | 2,285 lines | 340 lines | **85% smaller** |
| Avg component size | 450 lines | 180 lines | **60% reduction** |
| Bundle size (gzipped) | ~650 KB | ~430 KB | **34% reduction** |
| Initial load time | ~2.1s | ~1.4s | **33% faster** |
| Code reusability | Low | High | DRY principle |
 | Maintainability | Difficult | Easy | Clear separation |
 | Test coverage | Hard | Easy | Smaller units |

---

## Testing Strategy

### Unit Tests

For each extracted hook/component:

```ts
// Example test for useCanvasPositionSync
describe('useCanvasPositionSync', () => {
  it('debounces position updates', async () => {
    const { result } = renderHook(() => useCanvasPositionSync());
    const pos = { x: 100, y: 200 };

    await act(async () => {
      await result.current.updatePositions([pos]);
    });

    expect(api.updateCanvasPositions).toHaveBeenCalledWith([pos]);
  });
});
```

### Integration Tests

```ts
// Test that canvas page still works after refactoring
describe('CanvasPage', () => {
  it('renders all elements correctly', () => {
    render(<CanvasPage />);
    expect(screen.getByText('Lists')).toBeInTheDocument();
  });
});
```

### Regression Testing

1. Visual regression (Percy/Chromatic)
2. E2E tests (Playwright)
3. Bundle size checks in CI

---

## Maintenance Guidelines

### When to Extract a Component

Extract when:
- Component > 300 lines
- Uses 10+ hooks
- Has nested components > 3 levels
- Duplicate logic > 20 lines
- Contains business logic + UI

### Naming Conventions

```
components/
├── FeatureName/           # PascalCase for feature dirs
│   ├── FeatureName.tsx    # Main component
│   ├── FeaturePart.tsx    # Sub-components
│   └── hooks/
│       └── useFeature.ts  # Related hooks

hooks/
├── useFeatureName.ts      # Feature-specific hooks
└── useUtilityName.ts      # Shared utilities

utils/
├── featureUtils.ts        # Feature utilities
└── commonUtils.ts         # Shared utilities
```

### Component Size Limits

| Type | Max Lines | Recommendation |
|------|-----------|----------------|
| Page component | 150 | Move to sub-components |
| Container component | 200 | Extract business logic |
| Presentational component | 100 | Good |
| Hook | 80 | Extract smaller hooks |
| Utility function | 30 | Good |

---

## Success Criteria

✅ All files under 500 lines
✅ All hooks under 100 lines
✅ Bundle size reduced by 30%
✅ Initial load time reduced by 25%
✅ 100% test coverage for extracted hooks
✅ Zero regressions in functionality
✅ ESLint warnings < 10
✅ Build time stable (no significant increase)

---

## Next Steps

1. **Review and approve this plan** with the team
2. **Set up tooling** (ESLint plugins, bundle analyzer)
3. **Start with Phase 1** (Canvas extraction - highest ROI)
4. **Monitor metrics** after each phase
5. **Document learnings** for future refactors

---

**Estimated Timeline**: 4-6 weeks (1 phase per week with testing)

**Impact on Users**: Minimal (no UI changes), but faster loads and better performance

**Impact on Developers**: Much easier to maintain and extend the codebase