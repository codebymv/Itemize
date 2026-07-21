# Messaging GraphQL cutover contract

**Status:** Email-template management implemented default-off; delivery, administrator, SMS-template, and provider boundaries remain characterized

**Evidence date:** 2026-07-21

## Decision

Authenticated email/SMS template management, previews, delivery requests, and administrator audit queries move to GraphQL. Provider callbacks remain HTTP because they require provider signature verification, form/raw-body fidelity, retry acknowledgement, and delivery-level idempotency.

GraphQL resolvers may validate and persist delivery intent, but they must not synchronously call Resend or Twilio. Provider work belongs in durable workers. Provider acceptance is not final delivery, and an unconfigured client or simulation is never a successful real send.

The authoritative per-operation assignments are in `graphql-operation-overrides.json`. This contract defines the semantics shared by those 26 rows.

## Email-template management implementation checkpoint

`EmailTemplatesModule` now implements the seven organization email-template management operations. List and detail reads, category aggregation, and CSRF-protected create, update, duplicate, and delete mutations are available through independent default-off frontend read and mutation flags. The adapter preserves both existing consumer shapes, while send-test and send-to-contact continue to use REST.

Fresh PostgreSQL coverage proves GraphQL/REST interoperability, deterministic filtering and paging, tenant-private misses, CSRF denial, complete-content variable extraction, locked concurrent partial updates, inactive duplication, and deletion. Focused frontend tests prove GraphQL mapping and flag-off REST rollback. No deployed traffic is enabled by this checkpoint.

## Ownership and targets

| Legacy group | NestJS owner | Target |
| --- | --- | --- |
| Organization email template CRUD/categories | `EmailTemplatesModule` | `emailTemplates`, `emailTemplate`, create/update/delete/duplicate, `emailTemplateCategories` |
| Organization SMS template CRUD/categories/message info | `SmsTemplatesModule` | `smsTemplates`, `smsTemplate`, create/update/delete/duplicate, `smsTemplateCategories`, `smsMessageInfo` |
| Contact and test delivery | `MessagingDeliveryModule` | `enqueueContactEmail`, `enqueueContactSms`, `sendEmailTemplateTest`, `sendSmsTemplateTest` |
| Administrator send/preview | `MessagingDeliveryModule`, `AdminMessagingModule` | `enqueueAdminEmailBatch`, `previewAdminEmail` |
| Administrator logs/templates | `AdminMessagingModule` | `adminEmailLogs`, `adminEmailLog`, `adminEmailTemplates` |
| Twilio inbound/status callbacks | `SmsWebhooksModule` | retained HTTP handlers |
| Resend delivery callbacks | `EmailWebhooksModule` | retained `POST /api/email/webhook/resend` handler |

## Authorization and tenant boundaries

All organization GraphQL operations require the canonical authenticated organization context from `tenancy-graphql-context.md`.

- Template list, detail, update, duplicate, delete, and test-send operations are scoped by `organization_id`.
- Contact delivery requires the contact and optional template to belong to the active organization.
- A foreign template or contact is `NOT_FOUND`; do not reveal cross-tenant existence.
- Client-supplied `organization_id` is never authority. Remove it from GraphQL inputs.
- Administrator operations require the global administrator guard and are deliberately cross-organization. Standard organization roles cannot access them.
- Logs returned to administrators contain message content and recipient identifiers and therefore require audit access, retention, and redaction rules.

Twilio inbound routing uses the globally unique normalized `To` number in `sms_receiving_numbers` as the tenant authority. Sender matching then occurs only among contacts in that organization. Unknown receiving numbers, missing sender contacts, and duplicate sender contacts inside the selected tenant are acknowledged into distinct quarantine states without cross-tenant attribution.

## Template contract

Email creation requires non-blank `name`, `subject`, and `bodyHtml`. SMS creation requires non-blank `name` and `message`. Updates are partial: omitted fields preserve stored values, while explicit nullability follows the shared input rules.

Variables use `{{variable_name}}`. On every create/update, derive a unique deterministic variable list from the complete resulting content. Supported contact variables currently include:

```text
first_name, last_name, full_name, email, phone, company, job_title
```

Custom contact fields may participate in rendering. Unknown variables currently remain visible in rendered output; the target must either preserve that behavior or return an explicit render validation error. Silent replacement with empty data is not allowed without a deliberate decision.

Duplicates copy content/category/variables into the same organization, append a copy suffix, and always start inactive. Historical delivery logs retain nullable template references after deletion.

List operations preserve category, active, and search filters, add deterministic `updatedAt DESC, id DESC` ordering, and use the shared connection/page contract. Category counts are integer scalars, not PostgreSQL count strings.

## Rendering and message information

Email rendering substitutes variables, generates text/HTML consistently, and applies the branded wrapper once. Complete HTML documents are not wrapped again. Rendering user-authored HTML needs an explicit sanitization/trust policy before cutover; preview output must not become a stored-XSS path in the operator UI.

`smsMessageInfo` is a pure authenticated GraphQL query. It returns length, encoding, segment count, and characters remaining. The target must use a tested GSM-7/UCS-2 implementation, including GSM extension-table characters and Unicode code points; the legacy regular-expression approximation is characterization evidence only.

Phone destinations are normalized and validated as E.164 at the delivery boundary. Invalid destinations return `BAD_USER_INPUT` before a job is persisted.

## Delivery intent and worker contract

Each real-send mutation persists intent transactionally:

1. authorize the organization/contact/template or administrator request;
2. validate destination, content limits, and plan/usage entitlement;
3. snapshot the rendered subject/body or SMS message and relevant recipient data;
4. reserve usage atomically;
5. create a delivery plus a stable idempotency key;
6. record an outbox job;
7. commit before provider I/O;
8. return an accepted delivery object.

A worker claims jobs with a lease, sends through the provider adapter, records provider message ID and attempt metadata, then writes the contact activity. Retrying a resolver, worker, or provider callback must not create a second real send for the same idempotency key.

Required delivery states:

```text
queued -> sending -> provider_accepted -> delivered
                    -> failed
provider_accepted -> bounced|undelivered
```

Email may additionally transition to `opened`, `clicked`, or `unsubscribed` from signed provider events. SMS status mapping is explicit: accepted/scheduled/queued map to queued; receiving/sending to sending; sent, delivered/read, undelivered, and canceled/failed map to their domain equivalents. Unknown provider states are rejected or quarantined, never written through to a database check constraint.

The current contact-send routes now write the clean-schema `contact_activities`, `email_logs`, and `sms_logs` shapes correctly. They return 503 rather than success when the provider is unconfigured. They still perform provider I/O inline and have no request idempotency key; those are blockers, not target architecture.

Workflow email and SMS steps now implement the durable subset of this target: they snapshot one outbox intent per enrollment run/step and a leased worker writes the provider log after acceptance. Workflow SMS refuses to queue without an active organization-owned number and validates the recipient before persistence. Email passes a provider idempotency key; SMS remains at-least-once across a Twilio-success/local-commit crash until provider reconciliation exists.

## Test sends

Test sends require an organization-owned active or inactive template, a valid explicit destination, and bounded sample data. They prefix or otherwise visibly mark test content and do not increment production campaign/contact usage or create a normal contact activity.

A response distinguishes:

- provider accepted;
- explicit local simulation/preview;
- provider rejected;
- provider unavailable.

Simulation may be useful in development but cannot return the same success result as provider acceptance.

## Administrator batch delivery

`enqueueAdminEmailBatch` is administrator-only. It validates every recipient, deduplicates normalized addresses, applies a hard recipient cap, and creates a durable batch with individual recipient jobs. Partial failure is represented per recipient.

The legacy implementation sends sequentially in the request, delays between recipients, has no batch idempotency key, and previously counted simulation as sent. The simulation count is now corrected, but synchronous delivery remains a cutover blocker.

Preview is a bounded pure render operation despite remaining a mutation for compatibility. It cannot fetch remote content or send email. User-provided `baseUrl` must not become an arbitrary external-resource fetch surface.

## Retained Twilio webhooks

Both callbacks retain HTTP form handling and validate `X-Twilio-Signature` against the externally visible request URL and exact submitted parameters. Production fails closed when `TWILIO_AUTH_TOKEN` is absent. The development bypass flag is forbidden in production.

### Status callback

- Requires `MessageSid` and a supported `MessageStatus`.
- Claims `status:<MessageSid>:<MessageStatus>` in `sms_webhook_events` before mutation.
- A repeated claim returns HTTP 200 without a second transition.
- Updates the matching outbound log by globally unique provider ID.
- Error code/message and sent/delivered timestamps follow the normalized state.

### Inbound callback

- Requires `MessageSid`, `From`, `To`, and `Body`.
- Claims `inbound:<MessageSid>` before creating domain rows.
- Selects the owning organization from the normalized `To` number before any sender lookup.
- Matches the normalized `From` number only inside that organization.
- Creates or updates one SMS conversation, one message, and one inbound SMS log atomically.
- A repeated claim returns HTTP 200 without duplicate rows.
- Unknown receiving numbers and ambiguous/unmatched tenant-local senders are acknowledged and recorded without assigning content to a guessed tenant.

The clean schema includes `sms_webhook_events` and `sms_receiving_numbers`; numbered migrations `008_sms_webhook_idempotency` and `017_sms_receiving_number_registry` provide the production path.

## Email provider events

`POST /api/email/webhook/resend` retains the provider protocol over HTTP. It verifies the exact raw request body with the Resend/Svix signing secret and `svix-id`, `svix-timestamp`, and `svix-signature` headers. Production fails closed when `RESEND_WEBHOOK_SECRET` is absent; malformed or unverifiable deliveries receive a generic 400 response.

The handler claims `svix-id` in `email_webhook_events` inside the same transaction as all domain mutations. A repeated claim acknowledges with HTTP 200 without applying a second transition. Provider `created_at`, rather than arrival time, controls the current status so a delayed `delivered` event cannot regress a newer `clicked` state. Milestone timestamps remain independently fillable by a late event.

Provider email IDs correlate deliveries to `email_logs.external_id` and `campaign_recipients.external_message_id`. Delivered/opened/clicked/bounced/complained/failed/suppressed events update the matching delivery state; campaign opens and clicks update counts and bounded link evidence. Permanent bounce and suppression events mark the matched contact bounced, while complaints mark it email-unsubscribed. Contact and trial sends now persist the provider ID needed for this correlation, and contact delivery rejects an already bounced or unsubscribed recipient.

Verified events that arrive before their local provider ID is committed are retained with `processing_status = 'pending'`. A reconciliation worker with retry/dead-letter observability is still required before cutover. The endpoint intentionally ignores unsupported event types after recording the durable delivery claim rather than mutating an unknown state.

## Required parity scenarios

| Area | Required scenarios |
| --- | --- |
| Template CRUD | validation, filtering, categories, variable extraction, partial update, duplicate inactive, delete history, tenant denial |
| Rendering | known/unknown variables, custom fields, HTML/text, wrapper once, input limits, sanitization decision |
| Email/SMS contact send | same-tenant references, cross-tenant denial, invalid destination, provider acceptance/failure/unavailable, log/activity, usage reservation, request retry |
| SMS info | GSM-7 basic/extension, Unicode/surrogate pairs, single/multipart boundaries |
| Test send | destination validation, substitution, visible test marking, provider outcomes, no production state mutation |
| Admin batch | admin denial, recipient cap/deduplication, durable acceptance, partial failure, retry idempotency, audit query pagination |
| SMS status webhook | missing/invalid signature, missing token in production, supported/unknown state, replay, error metadata |
| SMS inbound webhook | signature, replay, receiving-number ownership, same sender across tenants, duplicate sender inside one tenant, unmatched receiver/sender, atomic conversation/message/log creation |
| Email events | real SDK signature, missing secret, invalid signature, replay, out-of-order delivery, delivered/open/click/bounce/complaint transitions, campaign engagement, unmatched pending event, contact suppression |

## Current evidence and remaining blockers

Fresh PostgreSQL tests now cover the implemented GraphQL email-template management contract, REST interoperability, locked concurrent partial updates, tenant isolation, CSRF, and retained frontend mapping/rollback. Existing retained suites also cover successful email contact audit writes, provider-unavailable semantics, SMS template tenant isolation, successful/failed SMS contact logging, receiving-number ownership, concurrent inbound replay, same-sender cross-tenant routing, unmatched receiving-number quarantine, tenant-local sender ambiguity, SMS status replay/state validation, real Resend/Svix verification, duplicate and out-of-order email events, campaign engagement, contact suppression, and leased unmatched-event reconciliation.

Email-template management is implementation-ready but remains default-off pending a staging consumer/rollback gate. The broader messaging slice is not ready for traffic cutover until:

- contact, campaign, workflow, invoice, and admin sends share one durable delivery/outbox abstraction;
- email and SMS request idempotency and atomic usage reservation are implemented;
- the administrator batch becomes bounded asynchronous work;
- provider adapters have deterministic contract tests for timeout, retry, permanent failure, and duplicate acceptance;
- GSM-7/UCS-2 segmentation is replaced with a standards-correct implementation and boundary tests;
- critical email/SMS operator journeys pass against the GraphQL schema.
