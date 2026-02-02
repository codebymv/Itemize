# Frontend Codebase Refactoring Quick Reference

## Summary

Frontend audit completed and refactoring plan created at `docs/frontend-refactoring-plan.md`.

## Key Findings

| Issue | Impact | Files Affected |
|-------|--------|----------------|
| Files >1000 lines | Hard to maintain, slow builds | 9 files |
| Components >500 lines | Low reusability | 10 components |
| Inline complex logic | Difficult to test | 35+ files |
| No lazy loading | Largest file: 2,285 lines. Avg: 450 lines | Only 31% of pages |

## Top 5 Files to Refactor

1. **`canvas.tsx`** (2,285 lines) → Extract 5 hooks, 4 components → **85% reduction**
2. **`InvoicesPage.tsx`** (1,197 lines) → Extract subcomponents → **80% reduction**
3. **`InvoiceEditorPage.tsx`** (1,192 lines) → Extract form logic → **78% reduction**
4. **`DashboardPage.tsx`** (1,015 lines) → Extract charts/stats → **72% reduction**
5. **`SettingsPage.tsx`** (1,106 lines) → Extract tabs → **73% reduction**

## Expected Results

- Bundle size: **-34%** (650KB → 430KB gzipped)
- Initial load: **-33%** (2.1s → 1.4s)
- Avg component size: **-60%** (450 → 180 lines)
- Code reusability: Low → High

## Implementation Phases

| Phase | Focus | Duration | Priority |
|-------|-------|----------|----------|
| 1 | Canvas.tsx extraction | 1 week | **CRITICAL** |
| 2 | Page-level refactor | 1 week | HIGH |
| 3 | Component extraction | 1 week | MEDIUM |
| 4 | Bundle optimization | 1 week | MEDIUM |

## Quick Wins (Do First)

1. Add lazy loading to all route components (currently only 31%)
2. Enable `eslint-plugin-unused-imports` to find unused code
3. Extract `useCanvasPositionSync` from canvas.tsx already exists
4. Remove duplicate category management logic

See full plan at `frontend-refactoring-plan.md`