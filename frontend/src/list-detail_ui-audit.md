# List–Detail UI Consistency Audit

Source of truth: `/invoices` list + expanded panel behavior.

## Inventory (current state)

### Contacts (list → detail)
Files:
- `Itemize/frontend/src/pages/contacts/ContactsPage.tsx`
- `Itemize/frontend/src/pages/contacts/components/ContactCard.tsx`
- `Itemize/frontend/src/pages/contacts/ContactDetailPage.tsx`

Observations:
- List uses card-style items (not `divide-y`) with avatar + name and an expanded panel.
- Expanded panel actions exist, but layout feels off-center compared to invoice preview actions.
- Status badge uses correct theme colors, but row layout differs from invoice list row pattern.

### Automations (list → workflow builder)
Files:
- `Itemize/frontend/src/pages/automations/AutomationsPage.tsx`
- `Itemize/frontend/src/pages/automations/WorkflowBuilderPage.tsx`

Observations:
- Header title wrapper lacks `min-w-0`, so long titles can wrap.
- Mobile controls are not consistently stacked in full-width rows.
- Stat cards use `md:grid-cols-5` (not 4).
- List rows use `divide-y`, but metadata is in a single row; status badge uses hardcoded `bg-green-500`.

### Landing pages (list → page editor)
Files:
- `Itemize/frontend/src/pages/pages/LandingPagesPage.tsx`
- `Itemize/frontend/src/pages/pages/PageEditorPage.tsx`

Observations:
- Header title wrapper lacks `min-w-0`.
- Mobile controls are not in `flex-col items-stretch`, and inputs are not full-width.
- List uses card grid with thumbnails (not invoice list row pattern).
- Status badge uses local mapping (green/yellow/gray).

### Invoices (list → invoice editor)
Files:
- `Itemize/frontend/src/pages/invoices/InvoicesPage.tsx`
- `Itemize/frontend/src/pages/invoices/InvoiceEditorPage.tsx`

Observations:
- Serves as source of truth for list-row layout, expansion, and action buttons.
- Header/title truncation and mobile controls pattern are correct.

### Estimates (list → estimate editor)
Files:
- `Itemize/frontend/src/pages/invoices/EstimatesPage.tsx`
- `Itemize/frontend/src/pages/invoices/EstimateEditorPage.tsx`

Observations:
- List uses `divide-y`, but row layout is simpler than invoices (no middle/footer rows).
- Right-side dropdown exists; no chevron/expand.
- Header/title wrapper uses `min-w-0` on list, but detail header lacks `min-w-0`.

---

## Per-page delta checklist (vs invoices)

### Contacts list
- Align list-row structure to invoice pattern:
  - Header row: primary label + actions right.
  - Middle row: status badge + company/role (truncate).
  - Footer row: email/phone (truncate).
- Ensure expanded panel aligns to row width and uses consistent padding (`px-6` style).
- Expanded actions should mirror menu options exactly and be centered like invoice actions.
- Consider moving from card grid to `divide-y` list for 1:1 consistency.

### Automations list
- Header: add `min-w-0` to title wrapper; keep one-line truncation.
- Mobile controls: stack rows `flex-col items-stretch`, with `w-full` on each row.
- Stat cards: change grid to `md:grid-cols-4`.
- List rows:
  - Add `min-w-0` on left group and truncate long names.
  - Use theme status badges (green/orange/red) instead of `bg-green-500`.
  - Split metadata into a middle/footer row with `flex-wrap`.

### Landing pages list
- Header: add `min-w-0` to title wrapper and truncate.
- Mobile controls: use `MobileControlsBar` with `flex-col items-stretch` and `w-full` inputs.
- List layout: replace card grid with invoice-style rows (or explicitly accept card grid as a visual exception).
- Status badge: map to shared color rules (published = green, draft = sky/yellow? archived = red/gray).

### Estimates list
- Align list rows to invoice pattern:
  - Add middle row with contact name + status + valid-until.
  - Add footer row for mobile amount and status details.
  - Use `px-6` on metadata rows and `min-w-0` truncation.
- Consider adding expand behavior + action buttons if matching invoices 1:1.

---

## Detail/editor header consistency checklist
Applies to: `ContactDetailPage`, `WorkflowBuilderPage`, `PageEditorPage`, `InvoiceEditorPage`, `EstimateEditorPage`.
- Left header group should be `flex-1 min-w-0`.
- Title should be `truncate`.
- Right actions should be `flex-shrink-0` to avoid wrapping.

Pages missing `min-w-0` on the title wrapper:
- `WorkflowBuilderPage.tsx`
- `PageEditorPage.tsx`
- `InvoiceEditorPage.tsx`
- `EstimateEditorPage.tsx`

---

## Shared visual rules (apply everywhere)
- **Title truncation**: `min-w-0` on containers, `truncate` on text.
- **List row spacing**: `p-4` base, `px-6` for metadata rows, `gap-x-3 gap-y-1.5`.
- **List rows**: `divide-y`, `hover:bg-muted/50`, `transition-colors`, `cursor-pointer`.
- **Actions**: expanded panel actions mirror 3-dot menu options.
- **Status colors**: green (active/success), orange (attention), red (archived/overdue), sky (draft/info), gray (neutral).
- **Mobile controls**: `MobileControlsBar` with `flex-col items-stretch` and full-width inputs.

---

## Implementation order (after sign-off)
1. Fix detail/editor headers (truncate + one-line layout).
2. Normalize mobile controls stacking on list pages.
3. Align list row layouts to invoice pattern (contacts, automations, estimates).
4. Normalize badge colors and action placement.
5. QA across mobile/tablet + dark mode.
