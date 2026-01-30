# Wins Log

This file tracks high-impact UX/product wins and open opportunities.
Keep entries concise and update as we learn more.

---

## Current Wins (Completed)

Verified in code: `AppSidebar.tsx`, `ContactsPage.tsx`, `AutomationsPage.tsx`, `LandingPagesPage.tsx`, `EstimatesPage.tsx`, `InvoiceEditorPage.tsx`, `EstimateEditorPage.tsx`, `PageEditorPage.tsx`.

- Sidebar ordering aligned to core workflows and moved Segments under Campaigns.
- Contacts visual language aligned to invoices (stat cards, badges, list layout).
- List→detail consistency improvements across Automations, Pages, Estimates.
- Mobile header truncation and single-row headers standardized in key editors.

---

## High-Priority Opportunities

### Frontend - Component Consolidation (Critical)

**Duplicate Modals (status: mostly resolved in codebase):**
- Generic components exist: `DeleteConfirmationModal`, `ShareModal`, `CategorySelector`, `CreateItemModal`
- No `Delete*Modal.tsx`, `Share*Modal.tsx`, or `*CategorySelector.tsx` duplicates found
- Remaining work: route legacy create flows through `CreateItemModal` where possible

**Duplicate Hooks (status: resolved):**
- Extracted `useCardCategoryManagement`, `useCardColorManagement`, `useCardTitleEditing`
- `use*CardLogic.ts` hooks now route through shared helpers

### Backend - Error Handling (Critical)

**`asyncHandler` coverage (status: complete):**
- Applied across route files, including `admin.routes.js` and `billing.routes.js`
- Remaining work: standardize response utilities and remove ad-hoc `res.status(...).json(...)` patterns

**N+1 Query Problems (status: original items resolved in code):**
- `contacts.routes.js` tag triggers use `Promise.allSettled` (no nested N+1)
- `contacts.routes.js` related content fetch uses `Promise.all`
- `invoices.routes.js` items insertion uses bulk insert values
- `campaigns.routes.js` recipients insertion uses bulk insert; sending is queued
- `vaults.routes.js` vault list item counts now use a single join/group query (resolved)

### Context Performance (Critical)

**useMemo on context values (status: resolved):**
- `AuthContext`, `SubscriptionContext`, `HeaderContext` memoize value objects

**Split contexts (status: resolved):**
- `AuthContext` → `AuthStateContext` + `AuthActionsContext`
- `SubscriptionContext` → `SubscriptionStateContext` + `SubscriptionFeaturesContext`

---

## Medium-Priority Opportunities

### Frontend - Shared Utilities

**Extract shared hooks (status: resolved):**
- `useOrganization` now centralized and used across pages
- `usePageHeader` created for header content pattern
- `useStatStyles` extracted for stat card styling

**Extract shared components (status: partially resolved):**
- `<ErrorState>` and `<EmptyState>` exist; usage still inconsistent across pages
- `<StatCard>` exists and is used in `CampaignsPage`, `SegmentsPage`, `DashboardPage`, `AdminPage`

**Hardcoded strings to extract (~100+ instances):**
- "Cancel", "Delete", "Create" button labels
- "This action cannot be undone" warning text
- Color values: `#3B82F6`, `#808080`, `#ffffff` (partial progress via `constants/ui.ts`)
- Toast messages duplicated across files

### Backend - Code Consistency

**Response format inconsistency (status: partially resolved):**
- Many routes now use `sendSuccess`, `sendError`, `sendPaginated` from `utils/response.js`
- Remaining: remove ad-hoc `res.status(...).json(...)` patterns in a few route files

**Database connection handling (status: resolved):**
- `withDbClient` now used in route files; no manual `pool.connect()` calls found

**Hardcoded endpoints in InvoicesPage (status: resolved):**
- Invoice/recurring/payment-link calls now routed through `invoicesApi.ts`

### TypeScript Improvements

**Inline interfaces to centralize (status: resolved):**
- `CampaignsPage.tsx` now imports `Campaign` from `@/types/campaigns`
- `SegmentsPage.tsx` now imports `Segment` from `@/types/segments`

### Form Validation Standardization

**Inconsistent validation patterns:**
- `CreateContactModal` - Basic validation, no email/phone format check
- `CreateCampaignModal` - Step-by-step validation (more comprehensive)
- `CreateSegmentModal` - Validates filters thoroughly
- `CreateDealModal` - Only validates title required
- Should use shared validators (zod + react-hook-form recommended)

---

## Low-Priority Opportunities

### Accessibility

**Missing aria-labels on icon-only buttons:**
- `*CategorySelector.tsx` - Check/X buttons lack aria-labels
- Multiple modals - Cancel/Add buttons missing labels
- List/Vault header icon buttons now labeled

**Missing roles:**
- Badge components used as buttons lack `role="button"`

### Missing Memoization

**Components that could use React.memo:**
- All category selector components
- Delete/Share modal components (pure presentational)

**Missing useCallback:**
- `handleConfirm` in Delete*Modal files recreated on each render
- Share modal handlers recreated on each render

### Performance Anti-Patterns

**Duplicate toast descriptions (copy-paste errors):**
- `DeleteListModal.tsx` (lines 48-49)
- `DeleteNoteModal.tsx` (lines 48-49, 56-57)
- `ShareListModal.tsx` (lines 45-46, 48-49)
- (And 10+ more files)

**Font family inline styles (status: partially resolved):**
- Global `font-raleway` class exists; admin/automation headers and list/vault headers updated
- Remaining inline styles still need cleanup

**Console.log statements (hundreds across many files):**
- `ProtectedRoute.tsx` logs removed
- `canvas.tsx` still has many console logs
- Should replace with logger utility (`lib/logger.ts`) and gate by environment

**Hardcoded production URL (status: resolved):**
- `lib/api.ts` now reads `VITE_PRODUCTION_DOMAIN` + `VITE_PRODUCTION_API_URL` from env
- Removed hardcoded domain checks in favor of env-driven config

**localStorage usage (status: mostly resolved):**
- Centralized `storage` utility created and adopted in key auth/AI paths
- Remaining usages should migrate to `storage` utility

**window.location usage (18 instances across 11 files):**
- Direct `window.location.href` assignments still scattered
- Should use React Router's `useNavigate` for SPA navigation
- Only use `window.location` for external redirects or full page reloads

**Hardcoded production URL (status: resolved):**
- `lib/api.ts` now uses `VITE_PRODUCTION_API_URL` + `VITE_PRODUCTION_DOMAIN`
- No hardcoded `itemize.cloud` check in runtime logic

### Documentation

**Missing API documentation:**
- No docs for: invoices, campaigns, organizations, contacts, pipelines, workflows, forms, pages
- Route files lack JSDoc
- No OpenAPI/Swagger spec

### Page Layout Consistency

**Missing stat cards (status: resolved for key pages):**
- CampaignsPage now shows 4 stat cards
- SegmentsPage now shows 4 stat cards

**AutomationsPage:**
- Still has 5 stat cards (should be 4 to match pattern)

**Error Boundaries (status: not started):**
- No React Error Boundary components in pages

### Code Quality & Debugging

**TODO comments indicating incomplete features:**
- `canvas.tsx` (line 2079) - Wireframe sharing not implemented
- `backend/index.js` (line 407) - Frontend migration incomplete
- `ReputationRequestsPage.tsx` (line 140) - Resend functionality pending backend endpoint
- `WhiteboardCanvas.tsx` (line 13, 907) - Mobile canvas support and AI functionality incomplete
- `stripeSubscriptionService.js` (line 652) - Email notification not implemented
- `estimates.routes.js` (line 499) - Email sending not implemented
- `stripe.service.js` (line 366) - Upgrade email not implemented
- `reputation.routes.js` (line 526) - Email/SMS sending not implemented

**API Service Patterns:**
- 22 API service files exist and follow consistent patterns (good!)
- All use centralized `api` instance from `lib/api.ts` (good!)
- Response unwrapping now centralized in `api` interceptor
- Response typing still needs consistency pass in some services

### Code Quality & Cleanup

**TODO comments (incomplete features):**
- `canvas.tsx` (line 2079) - Wireframe sharing not implemented
- `backend/index.js` (line 407) - Frontend migration to `/api/billing` incomplete
- `ReputationRequestsPage.tsx` (line 140) - Resend functionality pending backend
- `WhiteboardCanvas.tsx` (line 13) - Mobile coordinate normalization TODO
- `backend/stripeSubscriptionService.js` (line 652) - Email notification TODO
- `backend/estimates.routes.js` (line 499) - Email sending TODO
- `backend/stripe.service.js` (line 366) - Upgrade email TODO
- `backend/reputation.routes.js` (line 526) - Email/SMS sending TODO
- Should track these in project management or create GitHub issues

**API Service Patterns:**
- 22 API service files exist and follow consistent patterns (good!)
- All use centralized `api` instance from `lib/api.ts`
- Consistent error handling via axios interceptors
- Retry logic with exponential backoff already implemented
- Token refresh queue mechanism in place
- Could benefit from shared TypeScript response types across services

---

## Design System Reference

### Source of Truth
- List rows: `InvoicesPage` list layout and expanded actions
- Mobile controls: `MobileControlsBar` stacked layout
- Stat cards: 4-column grid, consistent badge/icon colors

### Status Color Mapping
- Green: Active/Success/Paid
- Blue: Total/Info/Draft
- Orange: Pending/Inactive/Needs Attention
- Red: Overdue/Archived/Error/Delete
- Gray: Neutral/Disabled

### Component Standards
- Icon circles: `w-10 h-10 rounded-full`
- Icons: `h-5 w-5`
- Badge text: `text-xs`
- Value text: `text-2xl font-bold`
- Card padding: `p-4`
- List row: `p-4`, `hover:bg-muted/50`, `divide-y`
- Truncation: `min-w-0` on containers, `truncate` on text

---

## Quick Wins (Fast to Implement)

1. Add `useMemo` to context values (Done - already applied)
2. Fix duplicate `description` in toast calls (In progress - `toastMessages` adopted in key pages)
3. Add missing aria-labels to icon buttons (In progress - List/Vault headers updated)
4. Replace inline font styles with CSS class (In progress - admin/automation headers cleaned)
5. Remove hardcoded endpoints from InvoicesPage (Done - uses `invoicesApi`)
6. Add `asyncHandler` wrapper to backend routes (Done)
7. Remove console.logs from `ProtectedRoute.tsx` (Done - no logs remain)
8. Extract production URL to environment variable (Done - `VITE_PRODUCTION_DOMAIN`/`VITE_PRODUCTION_API_URL`)
9. Replace `window.location.href` with `useNavigate` in React components (Pending - 18 instances across 11 files)
10. Create centralized localStorage utility with error handling (Done - created `storage` utility)

---

## Notes

- Keep mobile controls consistent with `MobileControlsBar` stacked layout
- Draft badge color inconsistent (sky vs yellow) across modules
- Backend has good foundations (error handler, response utilities, validators) but needs consistent application
- ~2000+ lines of duplicate code in modal components alone
- Logger utility exists (`lib/logger.ts`) but console.logs still used extensively (420 instances)
- API services well-structured (22 files) but could benefit from shared error handling patterns
- ProtectedRoute has debug console.logs that should be removed before production
- Multiple incomplete features marked with TODO comments across codebase
