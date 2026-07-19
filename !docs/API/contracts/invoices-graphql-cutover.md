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

Existing integration suites characterize core invoice CRUD, tenant isolation, tax/discount behavior, sequential numbering, edit restrictions, manual payments, sending, estimate CRUD, estimate calculations, and list pagination. Focused tests prove that invoice numbers use one atomic PostgreSQL upsert, estimate MAX+1 allocation is serialized per organization, estimate conversion locks and scopes its source, manual recurring generation locks and scopes its template, and competing background runners skip an already claimed template. Real-PostgreSQL scenarios for concurrent invoice creation, estimate conversion, simultaneous manual payments, and Stripe delivery all passed in the 2026-07-15 fresh-database run. The manual-payment contract uses `card` rather than `credit_card`; unsupported methods return a validation error and do not reach a database constraint failure.

The product catalog checkpoint is implemented. `ProductsModule` owns typed organization-scoped list/create/update/delete operations with strict paging, literal search, deterministic ordering, decimal-string prices/tax rates, currency and recurring-period validation, nullable-field clearing, CSRF, and tenant-hidden misses. A fresh PostgreSQL parity suite mounts the retained Express router beside NestJS and proves REST rollback CRUD, REST reads of GraphQL writes, GraphQL reads/updates/deletes, decimal fidelity, filters, validation, CSRF, and cross-tenant denial. The frontend maps the typed schema back into the existing product shape behind independent default-off read and mutation flags.

The invoice business-profile checkpoint is also implemented. `InvoiceBusinessesModule` owns typed active-list, detail, create, partial-update, and soft-delete operations. Lists retain last-used/newest ordering, inactive rows remain available by ID for historical references, blank optional fields normalize to null, logo URLs are read-only, and tenant-hidden misses plus CSRF are enforced. Fresh PostgreSQL mounts the retained Express router beside NestJS and proves ordering, REST rollback CRUD, soft deletion, REST reads of GraphQL writes, retained logo ownership, paging, validation, and tenant isolation. Independent default-off frontend flags switch profile reads and CRUD while multipart logo uploads always remain HTTP.

The payment-history read checkpoint is implemented in `PaymentsModule`. It returns bounded, deterministic, organization-scoped pages with typed status and method filters, decimal-string amounts, and organization-qualified invoice/contact display joins. Fresh PostgreSQL proves ordering, filtering, paging validation, selected-tenant isolation, and joined projections. The existing Payments page selects this query behind one default-off read flag; manual organization and invoice payment writes remain on their characterized, row-locking REST transactions.

Settings, logo deletion/storage lifecycle, payment mutations, email preview, payment-link creation, estimate send, and most recurring behavior still lack sufficient executable characterization. Estimate conversion and manual generation are now `characterizing`, but explicit request idempotency and real-PostgreSQL concurrent execution remain open. The next billing gate is another database-only mutation/read slice; provider and deployment configuration remains deferred to the final cutover phase.
