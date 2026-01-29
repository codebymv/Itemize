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
- Generic components exist: `DeleteConfirmationModal`, `ShareModal`, `CategorySelector`
- No `Delete*Modal.tsx`, `Share*Modal.tsx`, or `*CategorySelector.tsx` duplicates found
- No `New*Modal.tsx` files found; `CreateItemModal` not present yet (confirm desired standard)

**Duplicate Hooks:**
- Category editing logic duplicated in 5 `use*CardLogic.ts` files → Extract `useCategoryManagement`
- Color saving logic duplicated in 5 files → Extract `useColorManagement`
- Title editing logic duplicated → Extract `useTitleEditing`

### Backend - Error Handling (Critical)

**`asyncHandler` coverage (status: already applied in these files):**
- `invoices.routes.js`, `organizations.routes.js`, `campaigns.routes.js`, `vaults.routes.js` all import and use `asyncHandler`
- Remaining work is standardizing response utilities and removing ad-hoc `res.status(...).json(...)` patterns

**N+1 Query Problems (status: original items resolved in code):**
- `contacts.routes.js` tag triggers use `Promise.allSettled` (no nested N+1)
- `contacts.routes.js` related content fetch uses `Promise.all`
- `invoices.routes.js` items insertion uses bulk insert values
- `campaigns.routes.js` recipients insertion uses bulk insert; sending is queued
- `vaults.routes.js` vault list item counts now use a single join/group query (resolved)

### Context Performance (Critical)

**useMemo on context values (status: already in code):**
- `AuthContext`, `SubscriptionContext`, `HeaderContext` already memoize value objects

**Should split contexts:**
- `AuthContext` → `AuthStateContext` + `AuthActionsContext`
- `SubscriptionContext` → `SubscriptionStateContext` + `SubscriptionFeaturesContext`

---

## Medium-Priority Opportunities

### Frontend - Shared Utilities

**Extract shared hooks:**
- `useOrganization` - Org initialization duplicated in 5+ pages
- `usePageHeader` - Header content pattern duplicated across pages
- `useStatStyles` - Stat helper functions duplicated (ContactsPage, AutomationsPage)

**Extract shared components:**
- `<ErrorState>` - Error state rendering duplicated
- `<EmptyState>` - Empty state pattern varies (PipelinesPage wrapped in Card)
- `<StatCard>` - Stat card pattern should be reusable

**Hardcoded strings to extract (~100+ instances):**
- "Cancel", "Delete", "Create" button labels
- "This action cannot be undone" warning text
- Color values: `#3B82F6`, `#808080`, `#ffffff`
- Toast messages duplicated across files

### Backend - Code Consistency

**Response format inconsistency:**
- Some routes: `res.json({ error: ... })`
- Others: `res.status(500).json({ error: ... })`
- Should use: `sendSuccess`, `sendError`, `sendPaginated` from `utils/response.js`

**Database connection handling:**
- Many routes manually call `pool.connect()` and `client.release()`
- Should use: `withDbClient` from `utils/db.js`

**Hardcoded endpoints in InvoicesPage:**
- Line 293: `/api/invoices/recurring/from-invoice/${id}`
- Line 348: `/api/invoices/${id}/record-payment`
- Line 390: `/api/invoices/${id}/create-payment-link`
- Should move to `invoicesApi.ts`

### TypeScript Improvements

**Inline interfaces to centralize:**
- `CampaignsPage.tsx` (line 31) - Inline `Campaign` interface
- `SegmentsPage.tsx` (line 24) - Inline `Segment` interface
- Should import from API services or `@/types`

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

**Font family inline styles:**
- `style={{ fontFamily: '"Raleway", sans-serif' }}` repeated 464 times across 98 files
- Should use CSS class

**Console.log statements (802 instances across 72 files):**
- `ProtectedRoute.tsx` (lines 12, 20, 28, 33) - Debug logs should be removed
- `canvas.tsx` (56 instances) - Should use logger utility
- Many pages/components have console.logs for debugging
- Should replace with proper logger (`lib/logger.ts` exists but underutilized)
- Consider environment-based logging (dev only)

**Hardcoded production URL:**
- `lib/api.ts` (line 10) - Production URL hardcoded: `https://itemize-backend-production-92ad.up.railway.app`
- Should be in environment variable or config file
- Domain check logic (line 109) could be abstracted

**localStorage usage (34 instances across 10 files):**
- Multiple storage keys: `itemize_auth_token`, `itemize_user`, `itemize_expiry`
- Should create centralized storage utility with consistent error handling
- Missing try-catch blocks in some localStorage operations

**window.location usage (89 instances across 36 files):**
- Direct `window.location.href` assignments scattered across codebase
- Should use React Router's `useNavigate` hook for SPA navigation
- Only use `window.location` for external redirects or full page reloads

**Hardcoded production URL:**
- `lib/api.ts` (line 10) - `PRODUCTION_URL` hardcoded as string
- Should move to environment variable `VITE_PRODUCTION_API_URL`
- Currently checks `window.location.hostname === 'itemize.cloud'` for detection

### Documentation

**Missing API documentation:**
- No docs for: invoices, campaigns, organizations, contacts, pipelines, workflows, forms, pages
- Route files lack JSDoc
- No OpenAPI/Swagger spec

### Page Layout Consistency

**Missing stat cards:**
- CampaignsPage - Should show draft/scheduled/sending/sent counts
- SegmentsPage - Should show total/active/dynamic vs static counts

**AutomationsPage:**
- Has 5 stat cards (should be 4 to match pattern)

**Error Boundaries:**
- All pages missing React Error Boundary components

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
- Could benefit from shared error handling wrapper
- Response typing could be more consistent (some use `response.data`, others destructure)

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
2. Fix duplicate `description` in toast calls (15+ files, 1 min each)
3. Add missing aria-labels to icon buttons (pattern: `aria-label="Close"`)
4. Replace inline font styles with CSS class
5. Remove hardcoded endpoints from InvoicesPage (move to invoicesApi)
6. Add `asyncHandler` wrapper to backend routes
7. Remove console.logs from `ProtectedRoute.tsx` (4 instances, 2 min)
8. Extract production URL to environment variable (5 min)
9. Replace `window.location.href` with `useNavigate` in React components (89 instances, batch fix)
10. Create centralized localStorage utility with error handling (30 min)

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
