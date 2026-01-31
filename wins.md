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
- `window.location.href` replaced with `useNavigate` in `AuthContext.tsx` for post-auth redirects.
- console.logs replaced with `logger` utility in AI suggestion hooks, card logic hooks, canvas.tsx, RichNoteContent.tsx.
- Accessibility improvements: Added aria-labels to CategorySelector and 10+ modal components.
- Form validation standardization: `CreateContactModal` and `CreateDealModal` now use zod + react-hook-form.
- Estimate email sending implemented: `estimates.routes.js` now sends estimate emails with PDF attachments.

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

### Form Validation Standardization (status: resolved):**
- ✅ `CreateContactModal` - Standardized with zod + react-hook-form
- ✅ `CreateDealModal` - Standardized with zod + react-hook-form
- ✅ Schemas added to `lib/formSchemas.ts` and `lib/schemas.ts` for type-safe validation
- ✅ Email format validation added for contacts
- ✅ Custom validation logic implemented with superRefine

---

## Low-Priority Opportunities

### Accessibility (High Priority - COMPLETED)

**Missing aria-labels on icon-only buttons (status: completed):**
- ✅ `CategorySelector.tsx` - Check/X buttons have aria-labels
- ✅ Multiple modals - All Cancel/Add/Create buttons now have aria-labels:
  - `ImportContactsModal.tsx` - Cancel, Back, Import X contacts, Done buttons
  - `EditContactModal.tsx` - Cancel, Save Changes buttons
  - `CreateContactModal.tsx` - Cancel, Create Contact buttons
  - `ComposeEmailModal.tsx` - Cancel, Send Email buttons
  - `BulkTagModal.tsx` - Cancel, Add/Remove Tags buttons
  - `ContactFilters.tsx` - Clear all filters button
  - `CreateSegmentModal.tsx` - Remove filter, Add condition, Cancel, Create Segment buttons
  - `CreateCampaignModal.tsx` - Back/Cancel, Next/Create Campaign buttons
  - `CreateDealModal.tsx` - Cancel, Create Deal buttons
  - `CreatePipelineModal.tsx` - Cancel, Create Pipeline buttons
  - `CreateSMSTemplateModal.tsx` - Cancel, Create Template buttons
  - `CreateEmailTemplateModal.tsx` - Cancel, Create Template buttons
  - `CreateCalendarModal.tsx` - Cancel, Create Calendar buttons

**Missing roles (status: reviewed):**
- ✅ Badge components - Reviewed: Badges primarily used as status indicators/labels, not interactive buttons

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
3. Add missing aria-labels to icon buttons (Done - CategorySelector, modals)
4. Replace inline font styles with CSS class (In progress - admin/automation headers cleaned)
5. Remove hardcoded endpoints from InvoicesPage (Done - uses `invoicesApi`)
6. Add `asyncHandler` wrapper to backend routes (Done)
7. Remove console.logs from `ProtectedRoute.tsx` (Done - no logs remain)
8. Extract production URL to environment variable (Done - `VITE_PRODUCTION_DOMAIN`/`VITE_PRODUCTION_API_URL`)
9. Replace `window.location.href` with `useNavigate` in React components (Done - AuthContext.tsx, others verified as legitimate uses)
10. Create centralized localStorage utility with error handling (Done - created `storage` utility)
11. Replace console.log statements with logger utility (Done - AI hooks, card logic hooks, canvas.tsx, RichNoteContent.tsx)
12. Add missing aria-labels to modal buttons and role="button" to badge buttons (Done - 10+ modal files updated)

---

## Notes

- Keep mobile controls consistent with `MobileControlsBar` stacked layout
- Draft badge color inconsistent (sky vs yellow) across modules
- Backend has good foundations (error handler, response utilities, validators) but needs consistent application
- ~2000+ lines of duplicate code in modal components alone
- Logger utility exists (`lib/logger.ts`) and is now used extensively (most console.logs replaced)
- API services well-structured (22 files) but could benefit from shared error handling patterns
- Form validation now standardized with zod + react-hook-form in CreateContactModal and CreateDealModal
- ✅ Estimate email sending implemented in estimates.routes.js with PDF generation support
- Multiple incomplete features marked with TODO comments across codebase (some may remain)
