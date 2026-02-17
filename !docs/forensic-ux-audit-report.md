# Forensic UX Audit Report — Itemize

**Scope:** Product UX, UI consistency, accessibility, performance perception.  
**Depth:** Forensic (all core journeys, edge cases, role-specific flows).  
**Date:** February 2025.

---

## 1. UX Surface Inventory

### 1.1 Frontend routes (App.tsx)

| Type | Path(s) | Page / behavior |
|------|--------|------------------|
| Root | `/` | RootRedirect → `/dashboard` or `/home` by auth |
| Public | `/home` | Home (lazy) |
| Public | `/auth/callback` | AuthCallback |
| Auth | `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | Login, Register, VerifyEmail, ForgotPassword, ResetPassword (static) |
| Shared | `/shared/list/:token`, `/shared/note/:token`, `/shared/whiteboard/:token`, `/shared/vault/:token` | SharedListPage, SharedNotePage, SharedWhiteboardPage, SharedVaultPage (lazy) |
| Public sign | `/sign/:token` | SignPage (lazy) |
| Protected | `/dashboard` | DashboardPage |
| Protected | `/contacts`, `/contacts/:id` | ContactsPage, ContactDetailPage |
| Protected | `/pipelines` | PipelinesPage |
| Protected | `/calendars`, `/bookings`, `/calendar-integrations` | CalendarsPage, BookingsPage, CalendarIntegrationsPage |
| Protected | `/forms`, `/inbox` | FormsPage, InboxPage |
| Protected | `/automations`, `/automations/new`, `/automations/:id` | AutomationsPage, WorkflowBuilderPage |
| Protected | `/canvas`, `/contents`, `/shared-items` | CanvasPage, ContentsPage, SharedPage (workspace) |
| Protected | `/settings`, `/preferences`, `/payment-settings` | SettingsPage (same component) |
| Protected | `/admin/*`, `/status` | AdminPage, StatusPage |
| Protected | `/segments`, `/campaigns`, `/email-templates`, `/sms-templates` | SegmentsPage, CampaignsPage, EmailTemplatesPage, SMSTemplatesPage |
| Protected | `/pages`, `/pages/:id` | LandingPagesPage, PageEditorPage |
| Protected | `/chat-widget`, `/social` | ChatWidgetPage, SocialPage |
| Protected | `/reviews`, `/review-requests`, `/review-widgets` | ReputationPage, ReputationRequestsPage, ReputationWidgetsPage |
| Protected | `/invoices`, `/invoices/new`, `/invoices/:id`, `/invoices/payments` | InvoicesPage, InvoiceEditorPage, PaymentsPage |
| Protected | `/estimates`, `/estimates/new`, `/estimates/:id` | EstimatesPage, EstimateEditorPage |
| Protected | `/recurring-invoices`, `/products` | RecurringInvoicesPage, ProductsPage |
| Protected | `/documents`, `/documents/new`, `/documents/:id` | SignaturesPage, SignatureEditorPage |
| Protected | `/templates`, `/templates/:id` | SignatureTemplatesPage, SignatureTemplateEditorPage |
| Redirects | `/signatures/*` | Redirects to `/documents` or `/templates` |
| Protected | `/help/*` | DocsPage |
| Catch-all | `*` | NotFound |

**Route count:** ~55 distinct path patterns (public + protected + shared). Most protected pages are lazy-loaded; auth and NotFound are static.

### 1.2 Navigation groups (AppSidebar.tsx)

**Main (sidebar):**

- Dashboard → `/dashboard`
- Workspace → Canvas `/canvas`, Contents `/contents`, Shared `/shared-items` (Canvas filtered on mobile)
- Contacts → `/contacts`
- Pipelines → `/pipelines`
- Sales & Payments → Invoices, Estimates, Recurring, Payments, Products
- Signatures → Documents `/documents`, Templates `/templates`
- Automations → `/automations`
- Campaigns → Campaigns, Segments, Email Templates, SMS Templates
- Pages & Forms → Pages, Forms
- Communications → Inbox, Chat Widget, Social
- Scheduling → Calendars, Bookings, Integrations
- Reputation → Reviews, Requests, Widgets

**Secondary (footer):**

- Settings → Account `/settings`, Preferences `/preferences`, Payments `/payment-settings`
- Help → `/help`
- Status → `/status`

**Global:** Cmd+K search (placeholder “Search anything…”), sidebar collapse with 200ms delay on navigate when collapsed.

### 1.3 Key frontend page files (by journey)

- **Auth/onboarding:** `Login.tsx`, `Register.tsx`, `VerifyEmail.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `AuthCallback.tsx`, `DashboardPage.tsx` (onboarding trigger), `OnboardingModal` + `onboardingRouteMap`.
- **Workspace:** `canvas.tsx`, `workspace/ContentsPage.tsx`, `workspace/SharedPage.tsx`; canvas cards: ListCard, NoteCard, WhiteboardCard, WireframeCard, VaultCard; `ShareModal`.
- **CRM:** `contacts/ContactsPage.tsx`, `contacts/ContactDetailPage.tsx`, `pipelines/PipelinesPage.tsx`, `pipelines/components/KanbanBoard.tsx`.
- **Revenue:** `invoices/InvoicesPage.tsx`, `invoices/InvoiceEditorPage.tsx`, `invoices/EstimatesPage.tsx`, `invoices/EstimateEditorPage.tsx`, `invoices/RecurringInvoicesPage.tsx`, `invoices/PaymentsPage.tsx`, `invoices/ProductsPage.tsx`.
- **Signatures:** `signatures/SignaturesPage.tsx`, `signatures/SignatureEditorPage.tsx`, `signatures/SignatureTemplatesPage.tsx`, `signatures/SignatureTemplateEditorPage.tsx`, `sign/SignPage.tsx`.
- **Growth:** `segments/SegmentsPage.tsx`, `campaigns/CampaignsPage.tsx`, `email-templates/EmailTemplatesPage.tsx`, `sms-templates/SMSTemplatesPage.tsx`.
- **Automations:** `automations/AutomationsPage.tsx`, `automations/WorkflowBuilderPage.tsx`.
- **Scheduling:** `calendars/CalendarsPage.tsx`, `bookings/BookingsPage.tsx`, `calendar-integrations/CalendarIntegrationsPage.tsx`.
- **Communications:** `inbox/InboxPage.tsx`, `chat-widget/ChatWidgetPage.tsx`, `social/SocialPage.tsx`.
- **Reputation:** `reputation/ReputationPage.tsx`, `reputation/ReputationRequestsPage.tsx`, `reputation/ReputationWidgetsPage.tsx`.
- **Pages/forms:** `pages/LandingPagesPage.tsx`, `pages/PageEditorPage.tsx`, `forms/FormsPage.tsx`.
- **Public/shared:** `SharedListPage.tsx`, `SharedNotePage.tsx`, `SharedWhiteboardPage.tsx`, `SharedVaultPage.tsx`, `SignPage.tsx`.

### 1.4 Backend API route groups (index.js)

| Mount | Backend route file | Journey |
|-------|--------------------|--------|
| `/api/auth` | auth.js | Auth, session, profile |
| `/api` (lists, canvas, notes, whiteboards, wireframes, vaults, categories) | lists.routes, canvas.routes, notes.routes, whiteboards.routes, wireframes.routes, vaults.routes, categories.routes | Workspace |
| `/api/organizations` | organizations.routes | CRM/org |
| `/api/contacts` | contacts.routes, contact-profile.routes | CRM |
| `/api/tags` | tags.routes | CRM |
| `/api/pipelines` | pipelines.routes | CRM / revenue |
| `/api/email-templates` | email-templates.routes | Campaigns |
| `/api/workflows` | workflows.routes | Automations |
| `/api/sms-templates` | sms-templates.routes | Campaigns |
| `/api/chat-widget` | chat-widget.routes | Communications |
| `/api/campaigns` | campaigns.routes | Campaigns |
| `/api/segments` | segments.routes | Campaigns |
| `/api/invoices/estimates` | estimates.routes | Revenue |
| `/api/invoices/recurring` | recurring.routes | Revenue |
| `/api/invoices` | invoices.routes | Revenue, payments |
| `/api/billing` | billing.routes | Subscription |
| `/api/subscriptions` | subscriptions.routes | Legacy subscription |
| `/api/reputation` | reputation.routes | Reputation |
| `/api/social` | social.routes | Communications |
| `/api/pages` | pages.routes, pageVersions.routes | Landing pages |
| `/api/preview` | preview.routes | Preview |
| `/api/calendars` | calendars.routes | Scheduling |
| `/api/bookings` | bookings.routes | Scheduling |
| `/api/forms` | forms.routes | Forms |
| `/api` (signatures) | signatures.routes | E-signatures |
| `/api/conversations` | conversations.routes | Inbox |
| `/api/analytics` | analytics.routes | Dashboard/analytics |
| `/api` (search) | search.routes | Global search |
| `/api/webhooks` | webhooks.routes | Workflows |
| `/api/calendar-integrations` | calendar-integrations.routes | Scheduling |
| `/api` (sharing) | sharing.routes | Shared content |
| `/api/admin`, `/api/admin/email` | admin.routes, admin-email.routes | Admin |
| `/api/onboarding` | onboarding.routes | Onboarding |
| `/api/suggestions` (inline), `/api/note-suggestions` | aiSuggestionService, noteSuggestions | AI suggestions |

**Rate limits (index.js):** global `/api` 1000/15min; write 30/min; position 120/min; public 100/hour. Auth and email-sending have stricter limits.

---

## 2. Journey Walkthroughs: Friction and Breakpoints

### 2.1 First-run: Land → Auth → Verification → First value

**Path:** `/` or `/home` → `/login` or `/register` → (email) `/verify-email` → `/dashboard` → onboarding modal.

**Friction and breakpoints:**

- **Root redirect:** `/` sends authenticated users to `/dashboard`, unauthenticated to `/home`. No in-app “first time here?” guidance; home is marketing, not a clear “Get started” funnel. *Files: App.tsx (RootRedirect), Home.tsx.*
- **Auth methods:** Email/password and Google OAuth coexist. Login handles `EMAIL_NOT_VERIFIED` (redirect to verify-email with email in query) and `GOOGLE_ACCOUNT` (toast: use Google button). Backend returns 401 for unverified email and 400 with `GOOGLE_ACCOUNT` for email login on Google-linked account. *Files: Login.tsx (handleEmailLogin), AuthContext (loginWithEmail), backend auth.js (login, verify check).*
- **Session expiration:** UseSessionExpiration shows a toast only; api interceptor on failed refresh does `window.location.href = '/login?session=expired'`. Toast and hard redirect can feel redundant or abrupt; no “session expiring soon” warning. *Files: useSessionExpiration.ts, api.ts (401/refresh, failed refresh redirect).*
- **Token refresh:** Access token 15 min (backend); refresh on 401 with queue. After 3 failed refresh attempts, hard redirect to `/login?session=expired`. No in-UI countdown or “extend session” CTA. *Files: api.ts (interceptor), auth.js (token expiry).*
- **Onboarding:** Dashboard triggers onboarding via `useOnboardingTrigger('dashboard')`. Other pages use `useRouteOnboarding()` and route map (onboardingRouteMap). Modal shows after 500 ms; step indicator and keyboard (arrows, Escape). “Skip” only closes modal (handleClose); “Dismiss” persists. Route change closes modal. No single “golden path” first action (e.g. “Create your first list”). *Files: DashboardPage.tsx, useOnboardingTrigger.ts, useRouteOnboarding, OnboardingModal.tsx, onboardingRouteMap.ts, onboardingContent.*

### 2.2 Daily operator: Dashboard → task execution → cross-module handoff

**Path:** `/dashboard` → sidebar or quick actions → list/contacts/invoices/… → back or another module.

**Friction and breakpoints:**

- **Dashboard load:** useDashboardData runs multiple parallel queries (analytics, conversions, communications, velocity, revenue). All enabled when organizationId is set; no progressive loading (e.g. stats first, charts later). Widget collapse state is local (useState); on mobile four widgets start collapsed; state not persisted. *Files: DashboardPage.tsx, useDashboardData.ts.*
- **Navigation:** Sidebar groups (Workspace, Sales & Payments, Signatures, Campaigns, etc.) with sub-items. Collapsed sidebar uses 200 ms setTimeout before navigate; first click can feel unresponsive. On mobile, Canvas is removed from Workspace. Global search is Cmd+K placeholder; no in-report verification of search implementation. *Files: AppSidebar.tsx (handleItemClick, filteredMainNavItems).*
- **Cross-module handoff:** No in-UI “from contact → create invoice” or “from deal → send document” shortcuts documented in these pages. Contact detail and pipeline stages would need to be checked for contextual actions. *Files: ContactsPage, ContactDetailPage, PipelinesPage, InvoicesPage.*

### 2.3 Workspace: Canvas → create → organize → share

**Path:** `/canvas` or `/contents` / `/shared-items` → create list/note/whiteboard/etc. → arrange → share.

**Friction and breakpoints:**

- **Canvas vs Contents/Shared:** Three entry points (Canvas, Contents, Shared); onboarding key for all is `canvas`. Contents and Shared are list views; Canvas is spatial. Mental model “workspace” vs “canvas” may blur. *Files: AppSidebar, onboardingRouteMap, canvas.tsx, workspace/ContentsPage, SharedPage.*
- **Sharing:** ShareModal and token-based public URLs. Shared list loads via `/api/shared/list/:token`; SharedListPage sets title and meta; optional socket for “live” viewer count. Error states: “Invalid share link” if no token. *Files: ShareModal, SharedListPage.tsx, sharing routes.*
- **Real-time:** WebSocket used for canvas; position updates rate-limited (120/min). No verification here of drag performance with many cards. *Files: backend index.js (positionLimiter), canvas routes.*

### 2.4 Revenue lifecycle: Contact → pipeline → invoice/estimate → signature → payment

**Path:** Contacts → Pipelines (deals) → Invoices or Estimates → (optionally) Documents/signatures → Payments.

**Friction and breakpoints:**

- **Terminology:** Nav uses “Sales & Payments” and “Signatures” (Documents / Templates). Routes expose both `/signatures/*` (redirects) and `/documents`, `/templates`. Risk of “where do I send a contract?” confusion. *Files: App.tsx (signature redirects), AppSidebar.*
- **Contacts:** ContactsPage uses useOrganization; on 500 shows message about CRM migrations. Pagination (e.g. 50), filters, bulk actions, import. Plan limit enforced on backend (403); frontend must surface upgrade path. *Files: ContactsPage.tsx, contacts.routes.js.*
- **Invoices:** InvoicesPage has tabs, filters, send/record payment/create payment link/modals. Uses invoicesApi (getInvoices, sendInvoice, recordPayment, createPaymentLink, etc.). *Files: InvoicesPage.tsx, invoicesApi, invoices.routes.js.*
- **Signatures/Documents:** SignPage (public) uses getPublicSigningData, submitPublicSignature, declinePublicSignature; PDF viewer, signature canvas, fields. No audit of link between “send invoice” and “send for signature” in one flow. *Files: SignPage.tsx, signaturesApi, signatures.routes.js.*

### 2.5 Growth lifecycle: Segment → campaign/template → send → analytics

**Path:** Segments → Campaigns / Email or SMS templates → send → (Campaigns/analytics).

**Friction and breakpoints:**

- **Backend limits:** Campaign sending can return 429 (usage limit). Contact create returns 403 when plan limit exceeded. Error payloads may not consistently include upgrade CTA. *Files: campaigns.routes.js, contacts.routes.js, errorHandler.js.*

### 2.6 Public-facing: Shared links, booking, forms, signing

**Path:** `/shared/list|note|whiteboard|vault/:token`, `/sign/:token`, and public booking/form routes.

**Friction and breakpoints:**

- **Shared list:** Fetches by token; loading and error (“Invalid share link”); optional live viewer count. *Files: SharedListPage.tsx.*
- **Signing:** SignPage is token-based; PDF + signature canvas + field values; submit/decline. Rate limits apply to public endpoints (100/hour per IP). *Files: SignPage.tsx, signatures.routes.js (public), index.js (publicRateLimit).*
- **Booking/forms:** Public routes under `/api/bookings`, `/api/forms`; not walked in detail here but same rate-limit and error-handling patterns apply.

---

## 3. UI Consistency

### 3.1 Design system adherence

- **Design tokens** ([design-system/design-tokens.ts](frontend/src/design-system/design-tokens.ts)): Central tokens for colors (primary, success, warning, danger, info, neutral scale), spacing, borderRadius, shadows, opacity. Semantic status (active, paid, draft, sent, overdue, cancelled, etc.) and module colors (invoice, contact, signature, workflow, campaign, etc.) defined. Many pages use Tailwind directly; token usage is optional, so drift is possible.
- **Component library:** shadcn/ui under `components/ui/` (button, card, dialog, form, input, select, tabs, table, etc.). Variants (primary, destructive, outline, ghost) and theme (next-themes light/dark) applied consistently where components are used.
- **Widgets:** design-system/widgets (InvoicesWidget, SignaturesWidget, WorkspaceWidget, ContactsWidget) used on dashboard for consistency there.

### 3.2 Interaction and state consistency

- **Loading:** PageLoading (Spinner + optional message) used for route/suspense fallback. Many list pages use Skeleton rows or Spinner; usage is mixed (some “Loading…”, some skeletons). *Files: page-loading.tsx, loading-skeletons, Spinner; pages import one or the other.*
- **Empty states:** Not uniformly audited; some pages have empty-state components, others may show only “No X yet” text.
- **Toasts:** Centralized toastMessages (failedToLoad, created, saved, etc. with entity param); getUserFriendlyError in api supplies title/message for API errors. 403 message “Contact your administrator” may not suit plan-limit case (upgrade CTA preferred). *Files: toastMessages.ts, error-messages.ts.*

### 3.3 Terminology alignment

- **Signatures vs Documents vs Templates:** Sidebar label is “Signatures”; sub-items are “Documents” and “Templates”. Routes: `/documents`, `/templates`; `/signatures/*` redirects to them. “Signatures” can mean the feature, the action, or the list; “Documents” is the main artifact. Inconsistent naming can confuse “where do I create a contract?”.
- **Sales & Payments:** Groups Invoices, Estimates, Recurring, Payments, Products. Clear.
- **Reputation:** Nav uses “Reviews”, “Requests”, “Widgets”; routes `/reviews`, `/review-requests`, `/review-widgets`. Aligned.
- **Workspace:** “Canvas” (spatial), “Contents” (list), “Shared” (shared items). “Workspace” is the group; “Canvas” is one view—acceptable but could be clarified in onboarding.

### 3.4 Microcopy quality

- **Toast and error copy:** Generic patterns (e.g. “Failed to load X”) and user-friendly API errors. Session: “Your session has expired. Please sign in again.” Login: “This account uses Google sign-in. Please use the Google button below.” for GOOGLE_ACCOUNT. Good.
- **Onboarding:** Step title/description from ONBOARDING_CONTENT; not audited line-by-line.
- **Buttons/labels:** “Use Signature”, “Copy link”, “Send”, etc. scattered; no single copy doc audited.

---

## 4. Accessibility

### 4.1 Keyboard and focus

- **Sidebar:** Collapse/expand button has aria-label (“Expand sidebar” / “Collapse sidebar”). Search placeholder “Search anything…” and Cmd+K; input is readOnly (opens command palette). *File: AppSidebar.tsx.*
- **Modals/dialogs:** DialogContent used in OnboardingModal, ShareModal, and many pages. Radix-based Dialog typically traps focus; not verified for all instances. Escape closes onboarding.
- **Forms:** Form components from ui/form; label/input association and error display need verification. No systematic aria-describedby for validation errors found in this pass.
- **Tables/lists:** ContactsTable, InvoicesPage tables; keyboard navigation (arrow keys, Enter) not verified. Pagination and dropdowns (Select) from Radix are generally keyboard-accessible.

### 4.2 ARIA and semantics

- **Usage:** aria-label appears on sidebar toggle, some search/buttons (e.g. “Copy link”, “Change list color”). Many interactive elements (cards, list items, canvas controls) do not have explicit aria-labels. *Grep: ~30 files with aria-|role=|tabIndex in components.*
- **Live regions:** useSessionExpiration shows toast on session expiry; toasts are typically announced if Toaster uses a live region. No explicit aria-live for dynamic content (e.g. “Invoice sent”) verified.
- **Skip link:** No skip-to-main-content link found in AppShell or layout.

### 4.3 Form errors and contrast

- **Form errors:** React Hook Form + Zod; error message rendering via FormField/FormItem. Visibility and association (aria-describedby, aria-invalid) depend on form component implementation; not fully audited.
- **Contrast:** Design tokens use slate and blue/green/orange/red with light/dark variants. WCAG AA not measured; semantic status badges use text and background classes that should be checked (e.g. green-800 on green-100).

### 4.4 Hotspots for critical tasks

- **Login:** Form labels, error visibility, and focus after error.
- **Dashboard:** Focus order and heading hierarchy (h1 vs h2).
- **Contacts/Invoices lists:** Table semantics, sort/filter announcements, bulk action feedback.
- **Sign (public):** Signature canvas and form fields for keyboard and screen reader.

---

## 5. Performance Perception

### 5.1 Loading states and progressive disclosure

- **Route transitions:** Suspense boundary wraps AppContent; fallback is PageLoading (Spinner + optional message). All lazy-loaded pages show the same full-page spinner until the chunk loads. No route-specific skeleton or progressive shell. *Files: App.tsx (Suspense, PageLoading).*
- **Dashboard:** useDashboardData runs five queries in parallel (analytics, conversions, communications, velocity, revenue). All wait on organizationId. No staged loading (e.g. show stats first, then charts). Widgets can show loading independently; collapse state is local and not persisted, so on revisit the dashboard may “pop” as widgets load. *Files: useDashboardData.ts, DashboardPage.tsx.*
- **List pages:** ContactsPage, InvoicesPage, etc. use Skeleton (ListRowSkeleton or similar) or Spinner while fetching. Inconsistent: some pages use skeletons, others raw “Loading” or spinner. *Files: loading-skeletons.tsx; multiple pages.*
- **Mutations:** Send invoice, record payment, create contact, etc. Buttons may show Loader2 icon or disabled state; not every mutation has explicit loading feedback. Toast on success/error is the main feedback.

### 5.2 Async feedback and responsiveness

- **React Query:** staleTime 5 min, cacheTime 10 min, refetchOnMount 'always' (uses cache when available). Retry 3 times for non-4xx with exponential backoff. Refetch on window focus only in dev. Users see cached data quickly on revisit; background refetch can cause a brief flash if data changed. *Files: App.tsx (queryClient config).*
- **API timeout:** 30 s in api.ts. Long-running operations (e.g. PDF generation, bulk import) may hit timeout; no progress indicator for multi-step backend jobs.
- **Sidebar:** 200 ms delay when navigating from collapsed state (toggle then setTimeout then navigate). First click can feel unresponsive. *File: AppSidebar.tsx (handleItemClick).*
- **Rate limits:** 429 from backend; getUserFriendlyError and retry logic (retryOn429) can retry once for some mutations. User may see generic “Too many requests” if limits are hit; no Retry-After surfaced in UI.

### 5.3 Action responsiveness

- **Optimistic updates:** Not systematically used. Most list updates refetch after mutation success, so list can lag by one round-trip after create/update/delete.
- **Debouncing:** Search/filter inputs may or may not be debounced (page-dependent). Canvas position updates are rate-limited on backend (120/min); frontend may debounce or throttle.

---

## 6. Competitive Expectation Deltas

| Journey | Competitor reference | Expected pattern | Itemize delta / gap |
|--------|----------------------|------------------|----------------------|
| First-run | Notion, ClickUp | Single clear “first action” (e.g. create doc/list), optional short tour | Many entry points; onboarding is per-feature modal, no single “golden path” first step |
| Auth | Gmail, HubSpot | One primary method or clear “Continue with Google” / “Email”; session “extend” or warning before expiry | Email + Google; 15 min token + refresh; no “session expiring soon”; hard redirect after 3 failed refreshes |
| Dashboard | Monday, HubSpot | Widgets load in priority order; key metrics above fold; persistent layout/collapse | All queries in parallel; collapse not persisted; mobile starts with four widgets collapsed |
| CRM | HubSpot, Pipedrive | Contact → deal → next step in one flow; pipeline view with drag-drop | Contacts and Pipelines separate; no single “from contact create deal” or “from deal create invoice” wizard |
| Invoicing + Signing | HoneyBook, QuickBooks + DocuSign | Invoice and “get signature” in one document lifecycle; status timeline | Invoices and Documents (signatures) are separate modules; terminology split (Signatures vs Documents/Templates) |
| Campaigns | Mailchimp, Customer.io | Audience → message → schedule → report in one flow | Segments, templates, campaigns, analytics spread across nav; orchestration across modules |
| Sharing | Notion, Coda | Simple share dialog; predictable public view; “Copy link” prominent | Token-based share; multiple share types (list, note, whiteboard, vault, document); behavior differs by type |
| Public sign | DocuSign | Minimal, focused sign experience; clear progress; mobile-friendly | SignPage has PDF + fields + canvas; rate limit 100/hour per IP may affect high-volume signers |

---

## 7. Prioritized Remediation Backlog

### 7.1 Severity-ranked issues (summary)

**Critical**

- **C1.** Session expiry: hard redirect after 3 failed refreshes with no “session expiring soon” warning. *Root: api.ts interceptor, auth.js token TTL.*
- **C2.** First-run: no single “first value” action; dashboard and feature onboarding compete. *Root: onboarding content and dashboard CTA.*

**High**

- **H1.** Dashboard: all-or-nothing load; no progressive loading or persisted widget state. *Root: useDashboardData, DashboardPage.*
- **H2.** Terminology: “Signatures” vs “Documents”/“Templates” and `/signatures` redirects cause confusion. *Root: AppSidebar, App.tsx routes, copy.*
- **H3.** 403/429 errors for plan or usage limits lack upgrade/CTA in UI. *Root: error-messages.ts, backend error payloads, frontend handling.*
- **H4.** Cross-module golden path (contact → invoice → sign → pay) not surfaced as guided flow. *Root: IA and contextual actions.*

**Medium**

- **M1.** Sidebar: 200 ms delay on collapsed click; Canvas hidden on mobile. *Root: AppSidebar handleItemClick, filteredMainNavItems.*
- **M2.** Loading: mix of PageLoading, Skeleton, and Spinner; no standard per context. *Root: pages and components.*
- **M3.** Accessibility: no skip link; limited ARIA; form error association not verified. *Root: AppShell, form components, critical pages.*
- **M4.** Public rate limit 100/hour may block legitimate use (e.g. signing). *Root: backend index.js publicRateLimit.*

**Low**

- **L1.** Optimistic updates not standard; list updates wait for refetch.
- **L2.** Toast copy for “Contact your administrator” on 403; plan limits need upgrade CTA.
- **L3.** Widget collapse state not persisted across sessions.

### 7.2 Quick wins (1–2 sprints)

- Add “Session expiring soon” warning (e.g. 2 min before expiry) and optional “Stay signed in” refresh. Keep redirect as fallback.
- Unify 403/429 handling: backend returns `code: 'PLAN_LIMIT'` or `'RATE_LIMIT'` and optional `upgradeUrl`; frontend shows toast/alert with CTA (e.g. “Upgrade plan” or “Try again in X minutes”).
- Remove or reduce sidebar navigate delay (replace setTimeout with CSS transition or immediate navigate).
- Add skip-to-main-content link in AppShell; ensure one focusable target and correct heading order on Dashboard and Login.
- Standardize list loading: use ListRowSkeleton (or CardGridSkeleton) for all list/index pages; reserve PageLoading for route suspense only.
- Normalize copy: pick “Documents” as primary for e-sign and use “Signatures” only as feature name; update nav and empty states accordingly.

### 7.3 Structural improvements (3–6 sprints)

- **Golden path:** Add “From contact → create invoice” and “From invoice → send for signature” (or combined “Send & get signature”) flows: contextual actions from Contact detail and Invoice detail, or a short wizard that links contact → document → send.
- **Dashboard:** Progressive loading (e.g. analytics + conversions first, then communications/velocity/revenue); persist widget collapse in user preferences or localStorage.
- **First-run:** Single prominent CTA on first dashboard visit (e.g. “Create your first list” or “Add a contact”) with optional 3-step mini-tour; defer per-feature onboarding to first visit of each section.
- **Role-based home:** Optional “Creator” / “Growth” / “Ops” home mode that changes default landing and nav emphasis (same routes, different default and highlights).
- **Accessibility:** Audit Login, Dashboard, Contacts list, Invoices list, and Sign page for keyboard flow, ARIA, and form error association; add aria-live for critical toasts and list updates.

### 7.4 Longer-term platform UX

- Cross-module status timeline at contact/company level (invoices, documents, payments, campaigns in one timeline).
- Global search (Cmd+K) that returns contacts, invoices, documents, and workspace items with deep links.
- Consistent error boundary strategy: section-level boundaries with recovery actions (e.g. “Retry” for dashboard widgets).
- Performance: consider virtualization for long contact/invoice lists; measure LCP and INP on dashboard and canvas.

### 7.5 Golden path redesign recommendation

**Highest-impact user story:** “Get from new lead to signed, paid customer with minimal context switching.”

- **Proposed flow:** Contact detail → “Create quote/invoice” → “Send for signature” (or “Send invoice” with optional “Also get signature”) → single document lifecycle with status (draft → sent → viewed → signed → paid). One timeline on the contact showing all related documents and payments.
- **Implementation:** Add contextual actions on Contact detail (Create invoice, Send document); optional “Send & sign” from Invoice that creates or links a signature document; shared status component and API that surfaces document + payment status for a contact. Keep existing Invoices and Documents modules but surface this path as the default “close deal” flow in UI and onboarding.

---

*End of forensic UX audit report. All findings are tied to files and modules listed in Section 1 and in the plan.*
