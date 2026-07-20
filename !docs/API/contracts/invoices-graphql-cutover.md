# Invoicing GraphQL cutover contract

**Status:** Characterizing  
**Owner:** Billing  
**Ledger scope:** 46 operations under `/api/invoices`

## Decision

The invoicing surface becomes eight focused NestJS modules rather than one resolver mirroring the Express route tree. GraphQL owns typed reads and business mutations. HTTP remains the protocol for binary PDF downloads, multipart logo uploads, and the signed Stripe webhook.

| NestJS module | Responsibility |
| --- | --- |
| `InvoicesModule` | Invoice CRUD, email preview/send, payment-link creation, and PDF authorization metadata |
| `InvoiceBusinessesModule` | Sender/business profiles and logo lifecycle |
| `EstimatesModule` | Estimate CRUD, send, and atomic conversion to an invoice |
| `PaymentsModule` | Payment history and manual invoice/organization payments |
| `ProductsModule` | Reusable invoice products and prices |
| `RecurringInvoicesModule` | Recurring templates, scheduling state, history, and manual generation |
| `InvoiceSettingsModule` | Organization invoice defaults and branding settings |
| `InvoiceWebhooksModule` | Stripe signature verification and idempotent event processing over HTTP |

The exact operation names, ownership, risk, and current parity status live in `!docs/API/graphql-operation-overrides.json`. The generated ledger remains the authoritative list of consumers and existing backend-test references.

## Transport boundary

The following operations deliberately remain HTTP:

- `GET /api/invoices/:id/pdf` returns an authorized binary document. GraphQL may return document metadata or a short-lived download URL, but not a base64 PDF.
- `POST /api/invoices/businesses/:id/logo` and `POST /api/invoices/settings/logo` remain bounded multipart uploads. Their delete operations become GraphQL mutations.
- `POST /api/invoices/webhook/stripe` remains a raw-body, signature-verified Stripe receiver.

Retained HTTP endpoints use the same session or provider authentication and organization boundary as their GraphQL sibling operations. A NestJS controller can own them without placing the bytes in the GraphQL schema.

## Shared schema rules

The [shared GraphQL contract](graphql-shared-contracts.md) governs error codes, page inputs, `PageInfo`, dates, nullability, and decimal serialization.

- All quantities, prices, tax rates, discounts, subtotals, payment amounts, balances, and totals cross GraphQL as `Decimal` strings. They never use GraphQL `Float`.
- Every money-bearing object includes an uppercase three-letter `CurrencyCode`. Operations reject mixed currencies unless an explicit conversion feature is later designed.
- Invoice and estimate issue/due/valid-until values use the calendar-only `Date` scalar. Created, updated, sent, viewed, paid, and provider event times use `DateTime`.
- Lists use strict page-based pagination and deterministic ordering. Financial list counts and rows must use the same organization predicate and must not reveal another tenant through totals.
- Input IDs are positive integers. A malformed ID is `BAD_USER_INPUT`; an absent organization-owned row is `NOT_FOUND`, without revealing that it exists in another organization.

## Financial calculation contract

The server is authoritative for every derived value. Clients submit line-item inputs and discount/tax choices; they cannot submit trusted subtotal, tax amount, discount amount, total, amount paid, or amount due fields.

For an invoice:

1. Validate positive quantity, non-negative unit price, and bounded tax/discount rates as decimal strings.
2. Calculate each line base amount from quantity and unit price using decimal arithmetic.
3. Preserve the current invoice-level tax behavior for invoices and per-line tax behavior for estimates and recurring templates until a product decision deliberately unifies them.
4. Apply either a percentage or fixed discount, never both. A discount cannot produce a negative total.
5. Round at an explicitly tested boundary using the currency's supported scale; store the persisted decimal values returned to clients.
6. Derive `amountPaid` from successful payments and `amountDue` from the stored total and successful payments inside the same transaction.

The Express implementation currently performs important calculations with JavaScript numbers before PostgreSQL stores numeric values. The rewrite must add edge cases for fractional quantities, repeating percentages, half-unit rounding, large values, zero, overpayment, and cumulative partial payments. Binary floating-point artifacts are not a parity requirement; any changed persisted result must be recorded as an approved parity correction.

## Number allocation

Invoice and estimate numbers are unique within an organization and are allocated only during a committed create/conversion/generation transaction.

- Allocation locks or atomically increments the organization's counter; two concurrent creates cannot receive the same number.
- A preview query is advisory and does not reserve or promise the returned number.
- A rolled-back transaction cannot leave a created invoice with missing line items or advance related schedule/conversion state.
- Estimate conversion and recurring generation use the same invoice-number allocator as direct invoice creation.

## State transitions

State transitions are service methods with explicit preconditions, not arbitrary status fields in update inputs.

| Aggregate | Required transition rules to preserve and characterize |
| --- | --- |
| Invoice | Draft and sent invoices are editable. Sending moves draft to sent; explicit resend may also permit sent, viewed, partial, or overdue. Successful payments produce partial or paid. The overdue job considers sent, viewed, and partial. Paid invoices are not editable. |
| Estimate | Draft and sent estimates are editable and sendable. Sending a draft marks it sent. Conversion marks the source accepted and links exactly one invoice. Accepted/declined terminal behavior must be characterized before schema finalization. |
| Recurring template | Active templates may pause; paused templates may resume. Generation locks the schedule, produces at most one invoice for a run, advances `nextRunDate` once, and moves to completed when its terminal condition is reached. |
| Payment | Only documented provider/manual states are accepted. Only a successful payment changes invoice paid/due/status fields. A provider event or payment reference is applied at most once. |

Invalid transitions return a stable domain error with `extensions.code: CONFLICT` and a safe reason. Generic update mutations never accept direct writes to status, paid totals, provider identifiers, or conversion/generation links.

## Transactions and locking

The following are single PostgreSQL transactions:

- create/update invoice with line-item replacement and derived totals;
- create/update estimate with line-item replacement and derived totals;
- estimate conversion, including number allocation, invoice/items creation, and source linkage/state;
- successful payment insertion with a locked organization-owned invoice and its balance/status update;
- recurring generation, including schedule lock, number allocation, invoice/items creation, history linkage, and advancing the schedule;
- Stripe webhook event claim, payment-reference claim, invoice lock, payment mutation, and invoice balance/status mutation.

All reads and writes include `organization_id` at the SQL boundary, including child rows, counters, settings, products, businesses, payments, and conversion/history lookups. Resolving a parent first is not permission to omit the tenant predicate from child mutations.

## External side effects and retries

- `sendInvoice` and `sendEstimate` persist the intended transition separately from email delivery evidence. A retry cannot silently create contradictory state or duplicate an email without an explicit resend request.
- `createInvoicePaymentLink` uses an idempotency key derived from the organization, invoice, amount/currency version, and request intent. It never creates a link for a paid, foreign, or stale invoice balance.
- Stripe webhook processing verifies the signature against the unmodified body and retains the existing transactional event/payment deduplication behavior.
- PDF generation and email attachment failure semantics are characterized independently from the database transition. Logs include correlation IDs but no invoice content, tokens, or provider secrets.
- Logo uploads enforce organization ownership, allowed content types, size limits, storage success, and safe replacement/deletion behavior. Failed replacement preserves the previous usable logo.

## Required parity scenarios

Every operation needs authentication, organization isolation, validation, success, not-found, and database-failure cases where applicable. Before consumer cutover, the billing slice additionally proves:

- invoice and estimate create/update/delete/list/detail with line ordering and empty/null semantics;
- filters, search, stable ordering, page metadata, and cross-tenant count isolation;
- tax/discount/rounding edge cases and exact decimal-string responses;
- concurrent invoice/estimate number allocation;
- blocked edits and invalid state transitions;
- partial, cumulative, exact, excess, failed, and duplicate payments;
- send/resend behavior under email success, failure, and retry;
- estimate conversion success, rollback, repeat, and concurrent repeat;
- recurring pause/resume/generate-now/scheduled generation, rollback, and concurrent generation;
- payment-link retry and stale-balance behavior with Stripe mocked at the provider boundary;
- webhook bad signature, duplicate event, duplicate payment reference, rollback, and concurrent delivery;
- upload authorization/type/size/replacement failure and PDF authorization/content headers;
- frontend journeys for invoice editing, estimate conversion, payment recording, recurring controls, downloads, and uploads.

## Current evidence and next gate

Existing integration suites characterize core invoice CRUD, tenant isolation, tax/discount behavior, sequential numbering, edit restrictions, manual payments, sending, estimate CRUD, estimate calculations, and list pagination. Focused tests prove that invoice numbers use one atomic PostgreSQL upsert, estimate MAX+1 allocation is serialized per organization, estimate conversion locks and scopes its source, manual recurring generation locks and scopes its template, and competing background runners skip an already claimed template. Real-PostgreSQL scenarios for concurrent invoice creation, settings updates, estimate conversion, simultaneous manual payments, and Stripe delivery all passed in the 2026-07-20 fresh-database run. The manual-payment contract uses `card` rather than `credit_card`; unsupported methods return a validation error and do not reach a database constraint failure.

The product catalog checkpoint is implemented. `ProductsModule` owns typed organization-scoped list/create/update/delete operations with strict paging, literal search, deterministic ordering, decimal-string prices/tax rates, currency and recurring-period validation, nullable-field clearing, CSRF, and tenant-hidden misses. A fresh PostgreSQL parity suite mounts the retained Express router beside NestJS and proves REST rollback CRUD, REST reads of GraphQL writes, GraphQL reads/updates/deletes, decimal fidelity, filters, validation, CSRF, and cross-tenant denial. The frontend maps the typed schema back into the existing product shape behind independent default-off read and mutation flags.

The invoice business-profile checkpoint is also implemented. `InvoiceBusinessesModule` owns typed active-list, detail, create, partial-update, and soft-delete operations. Lists retain last-used/newest ordering, inactive rows remain available by ID for historical references, blank optional fields normalize to null, logo URLs are read-only, and tenant-hidden misses plus CSRF are enforced. Fresh PostgreSQL mounts the retained Express router beside NestJS and proves ordering, REST rollback CRUD, soft deletion, REST reads of GraphQL writes, retained logo ownership, paging, validation, and tenant isolation. Independent default-off frontend flags switch profile reads and CRUD while multipart logo uploads always remain HTTP.

The payment checkpoint is implemented in `PaymentsModule`. Reads return bounded, deterministic, organization-scoped pages with typed status and method filters, decimal-string amounts, and organization-qualified invoice/contact display joins. The two manual-payment mutations validate bounded amount/currency/method/status/date inputs, lock any referenced tenant-owned invoice, perform balance arithmetic in PostgreSQL, and commit the payment, invoice state, and one durable `invoice_paid` trigger together. Pending and failed payments do not alter invoice balances. Fresh PostgreSQL proves ordering, filtering, paging, CSRF, hidden foreign references, standalone payments, partial/full transitions, concurrent final payments without lost updates, and exactly one paid event. Independent default-off frontend flags select reads and both shipped writes.

The core invoice checkpoint is implemented in `InvoicesModule`. `invoices` and `invoice` provide organization-scoped filters, literal search, stable paging, and organization-qualified contact, business, item, and payment projections. `createInvoice` validates tenant-owned references, allocates numbers atomically, and commits line items plus PostgreSQL-calculated tax, discount, total, and balance values in one transaction. `updateInvoice` locks the row, permits only draft/sent edits, validates the effective date/reference state, and replaces items plus derived totals atomically. `deleteInvoice` conceals foreign rows and returns stable deleted identity. Fresh PostgreSQL proves exact fractional calculations, REST/GraphQL interoperability, CSRF, tenant isolation, locked paid-invoice edits, and concurrent unique numbering. Independent default-off frontend flags select reads and CRUD mutations without changing the retained consumer shape.

The estimate CRUD checkpoint is implemented in `EstimatesModule`. `estimates` and `estimate` provide organization-scoped status/contact/search filters, literal search, stable paging, and tenant-qualified contact, product, and item projections. `createEstimate` validates tenant-owned references, serializes per-organization `EST-xxxxx` allocation, and commits items plus PostgreSQL-calculated per-line tax, subtotal discount, and total values atomically. `updateEstimate` locks the row, permits only draft/sent edits, validates effective dates and references, and replaces items plus derived totals atomically. `deleteEstimate` conceals foreign rows and returns stable deleted identity. Fresh PostgreSQL proves exact calculations, REST/GraphQL interoperability, CSRF, tenant isolation, terminal-state edit denial, and concurrent unique numbering. Independent default-off frontend flags select reads and CRUD mutations without changing the retained consumer shape.

The estimate-conversion checkpoint is implemented in the same module. `convertEstimateToInvoice` is CSRF-protected, locks and conceals the tenant-owned source, and treats the stored conversion link as the idempotency authority. A first request uses the shared atomic invoice-number allocator, copies header and ordered line values with tenant-qualified contact/product references, creates the invoice/items, and marks plus links the source in one transaction. A repeat returns the original tenant-owned invoice; a missing or cross-tenant stored target fails closed. Fresh PostgreSQL proves exact copied values, REST readback, cross-tenant denial, fail-closed corrupt links, allocation/source rollback after an invoice-write failure, stable replay, and two simultaneous requests converging on one invoice and one counter increment. A separate default-off conversion flag preserves retained REST rollback; estimate send remains on REST.

The recurring-template CRUD checkpoint is implemented in `RecurringInvoicesModule`. `recurringInvoices` and `recurringInvoice` provide organization-scoped status filtering, stable paging, tenant-qualified contact/source-invoice projections, generated-invoice counts, and decimal-string totals. `createRecurringInvoice` validates tenant-owned contacts/products, frequency and date bounds, persists legacy-compatible JSON items, and calculates totals transactionally. `updateRecurringInvoice` locks the row, validates effective references and dates, replaces items when supplied, and recalculates totals from stored items when the discount changes. `deleteRecurringInvoice` conceals foreign rows and returns stable deleted identity. Fresh PostgreSQL proves calculations, REST/GraphQL interoperability, CSRF, tenant isolation, lifecycle compatibility, and discount-only recalculation. Independent default-off frontend flags select CRUD.

The recurring lifecycle/history checkpoint is implemented in the same module. `recurringInvoiceHistory` verifies the tenant-owned parent before returning a bounded, deterministic page with decimal-string totals. `pauseRecurringInvoice` and `resumeRecurringInvoice` are CSRF-protected, row-lock the template, allow only active-to-paused and paused-to-active transitions, and return stable conflicts for stale/replayed actions. Resume advances a stale date-only schedule beyond PostgreSQL `CURRENT_DATE` before committing. Fresh PostgreSQL proves paging, tenant-private misses, transition conflicts, CSRF, REST readback, and stale-schedule advancement. History follows the default-off recurring read flag; lifecycle mutations have an independent default-off flag.

The recurring preview/from-invoice checkpoint is implemented in the same module. `previewRecurringInvoiceNumber` reads the selected organization's configured prefix and current next number without reserving it; atomic invoice creation remains the allocation authority. `createRecurringInvoiceFromInvoice` validates dates and frequency, row-locks and conceals the tenant-owned source, rejects cancelled/refunded invoices, copies only tenant-qualified contact/product references and ordered item values, recalculates recurring totals in PostgreSQL, and atomically creates the template plus marks the otherwise-preserved source invoice. Fresh PostgreSQL proves non-reserving preview behavior, exact cloned totals, CSRF, tenant isolation, terminal-state rejection, source preservation, REST readback, and that cloning does not consume an invoice number. Preview follows the recurring read flag and cloning has an independent default-off flag.

The manual recurring-generation checkpoint is implemented in the same module. `generateRecurringInvoiceNow` requires a bounded explicit idempotency key, takes the tenant-owned template lock before checking its durable namespaced invoice receipt, validates template money, items, payment terms, schedule, and tenant-qualified contact/product references before allocating, then commits the invoice, line items, number reservation, and schedule transition together. A completed template rejects a new request while a prior key still replays its original result. Fresh PostgreSQL proves CSRF, private misses, invalid keys, completed-state conflict, exact invoice/item values, and two simultaneous identical requests converging on one invoice, one number, and one schedule advance. An independent default-off generation flag preserves retained HTTP rollback.

Scheduled recurring generation now uses the same NestJS repository transaction as manual generation. A bounded internal worker snapshots due active templates, derives one durable idempotency key from the template and scheduled date, then rechecks active status, due date, end date, and the exact claimed occurrence under the template row lock. Competing workers converge on the same receipt; invoice allocation, invoice and item writes, and schedule advancement commit together. A one-shot `jobs:recurring-invoices` command supplies the scheduler boundary without exposing an operator mutation or enabling production execution. Fresh PostgreSQL proves one invoice per due occurrence under competing workers, future-template exclusion, terminal completion, exact counter advancement, and rollback of the counter and schedule after an invoice uniqueness failure.

The invoice-settings checkpoint is implemented in `InvoiceSettingsModule`. `invoiceSettings` returns selected-organization configuration or virtual retained defaults without creating a database row; Stripe connection fields and the server-owned logo URL remain read-only. `updateInvoiceSettings` performs strict partial validation, normalizes clearable fields, requires CSRF, creates a retained-compatible base row only when a write is requested, and serializes on the same settings row used by atomic invoice-number allocation. Counter regression and exact formatted-number collisions fail with stable conflict reasons. Fresh PostgreSQL proves tenant isolation, REST interoperability, CSRF, validation, collision denial, and concurrent settings/allocation convergence without duplicate numbers. Independent default-off frontend read and mutation flags preserve the retained settings shape and filter provider/storage fields from writes.

Logo deletion/storage lifecycle, email preview, payment-link creation, and estimate send still lack sufficient executable characterization. Provider behavior and deployment configuration, including scheduling the one-shot command, remain deferred.
