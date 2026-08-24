# Production operational consumer wave GraphQL cutover contract

**Status:** Production consumer cutover complete

**Evidence date:** 2026-07-22

## Scope

This wave reconciles 97 already-enabled, frontend-consumed operations across billing and invoicing (42), messaging templates (15), scheduling (13), workflow automation (11), campaigns (11), and calendar integrations (5). Their ledger parity status is now `consumer-cutover-complete`; this is an evidence-only promotion and does not change runtime flags, credentials, or application data.

Provider-facing campaign send, pause/resume, contact delivery, and other operations still marked `characterizing` remain outside this wave even where code or a production flag exists. The three blocked analytics definitions also remain outside the claim. Retained OAuth callbacks, webhooks, uploads/downloads, public capabilities, and Socket.IO boundaries are not GraphQL candidates.

## Production evidence

Railway confirms the associated booking, calendar, calendar-integration, campaign, email-template, SMS-template, invoice, estimate, recurring-invoice, payment, product, invoice-business, invoice-settings, and workflow frontend switches are `true`. The observed production deployments were legacy backend `8cb086aa-1ade-4faa-8557-c2443437c3c3`, GraphQL `352bc5f6-bdf9-4a1b-b18c-51768342c9a3`, and frontend `a9151cb8-4ec0-4843-8cb5-bde960ff1aa9` before this evidence-only commit.

An authenticated production Chrome session loaded `/invoices`, `/estimates`, `/recurring-invoices`, `/invoices/payments`, `/email-templates`, `/sms-templates`, `/calendars`, `/bookings`, `/calendar-integrations`, `/automations`, and `/campaigns`. Every route stayed authenticated and rendered its authoritative zero-data state. Nest observability recorded successful, zero-error `Invoices`, `Estimates`, `InvoiceBusinesses`, `Products`, `RecurringInvoices`, `Payments`, `EmailTemplates`, `SmsTemplates`, `CalendarReads`, `CalendarConnections`, `BookingReads`, `WorkflowDefinitions`, and `Campaigns` queries from those navigations.

The same source checkpoint passes 338 frontend tests and 352 Nest unit tests, and both production builds compile. Existing fresh-PostgreSQL suites remain the write-path, tenant-isolation, CSRF, concurrency, idempotency, provider-fencing, and retained-REST interoperability evidence. Production verification was deliberately read-only: it did not create data or invoke a provider.

## Rollback

Rollback remains data-neutral and domain-scoped: set only the affected `VITE_*_GRAPHQL` switch to `false` and rebuild the frontend. The retained REST adapters read the same PostgreSQL state. Provider worker ownership and retained HTTP protocols are separate boundaries and are unchanged by this evidence reconciliation.
