# Provider webhook cutover contract

**Status:** Phase 0 characterization

**Evidence date:** 2026-07-16

## Decision

Provider callbacks are protocols, not GraphQL operations. NestJS controllers retain their HTTP method, raw/form body, signature headers, challenge responses, acknowledgement timing, and provider retry semantics. After verification, controllers normalize and durably claim an event, commit minimal local state or an outbox job, and acknowledge quickly. GraphQL exposes authenticated operational queries and retry commands; it never accepts provider signatures or payloads.

## Inventory and ownership

| Legacy operation | Target owner | Current evidence | Cutover state |
| --- | --- | --- | --- |
| `POST /api/invoices/webhook/stripe` | `InvoiceWebhooksModule` | Raw-body Stripe verification and transactional event/payment claim; concurrent duplicate PostgreSQL test | Characterizing |
| `POST /api/billing/webhook` | `SubscriptionWebhooksModule` | Exact raw-body Stripe verification, transactional event claim, deterministic provider ordering, minimal replay snapshots, leased tenant reconciliation, normalized subscription/audit writes, and idempotent notification delivery | Characterized; operator tooling remains |
| `POST /api/email/webhook/resend` | `EmailWebhooksModule` | Raw-body Resend/Svix verification, durable delivery claim, occurrence-time ordering, tenant-ambiguity quarantine, leased pending reconciliation, and log/campaign/suppression transitions | Characterized; operator tooling remains |
| `POST /api/sms-templates/webhook/status` | `SmsWebhooksModule` | Twilio form-signature verification, durable state claim, normalized transition and replay tests | Characterized |
| `POST /api/sms-templates/webhook/inbound` | `SmsWebhooksModule` | Twilio verification, durable message claim, globally unique organization-owned receiving-number routing, tenant-local sender matching, atomic conversation/message/log, and replay/quarantine tests | Characterized; operator tooling remains |
| `GET /api/social/webhook` | `SocialWebhooksModule` | Constant-time challenge-token comparison and fail-closed configuration tests | Characterized |
| `POST /api/social/webhook` | `SocialWebhooksModule` | Exact-body HMAC verification, normalized batch claim, bounded inline processing, leased overflow work, Facebook/Instagram identity separation, unmatched/ambiguous reconciliation, post-commit socket emission, and PostgreSQL concurrency/replay tests | Characterized; operator tooling remains |
| `POST /api/webhooks/:workflowId` | `WorkflowWebhooksModule` | Per-workflow HMAC, expiry window, durable delivery claim and replay tests | Characterized; execution worker remains |
| Google calendar OAuth callback | `CalendarIntegrationsModule` | Signed expiring state, membership recheck and local redirect allowlist | Characterized; nonce claim/token encryption remain |

## Shared controller boundary

Each provider controller must:

1. apply a bounded body limit and capture the exact bytes or form fields required by the provider;
2. fail closed when its verification secret is absent outside an explicitly isolated test adapter;
3. verify before JSON interpretation, database lookup, remote fetch, or logging payload content;
4. derive a stable provider delivery/event key and claim it under a unique constraint;
5. store provider occurrence time separately from receipt time and reject impossible identities/timestamps;
6. avoid status regression when delivery is out of order;
7. commit a normalized event/state transition or durable job before acknowledgement;
8. acknowledge duplicates successfully without repeating domain or provider side effects;
9. return retryable failures only when replay is safe, and expose pending/dead-letter state operationally;
10. redact signatures, secrets, access tokens, message bodies, addresses, and provider payloads from logs.

Signature middleware must see the unmodified body. Global JSON parsing must not run first. External proxy URL reconstruction is explicit for providers, such as Twilio, whose signature includes the public callback URL.

## Ordering, retries, and reconciliation

At-least-once delivery means database uniqueness is the authority; an in-memory cache is not sufficient. A delivery claim and its synchronous state mutation belong in one transaction. Slow enrichment, provider profile lookup, notifications, email/SMS, and workflow execution run after commit in idempotent workers.

Provider occurrence timestamps decide the latest status, while milestone timestamps may still be filled by older deliveries. Unknown event types are recorded as ignored or quarantined and do not pass unchecked strings into domain constraints.

Stripe upgrade notifications are claimed with `FOR UPDATE SKIP LOCKED`, leased before provider I/O, retried with bounded exponential delay, and sent to Resend with an idempotency key derived from the Stripe event ID. Exhausted attempts become redacted dead letters. `SUBSCRIPTION_WEBHOOK_JOBS_ENABLED=false` disables the scheduled worker; it is enabled by default and runs every minute.

Stripe subscription ordering compares provider occurrence time and then the stable event ID, so same-second deliveries converge regardless of arrival order. Unmatched and ambiguous events persist only the normalized fields needed for replay; a separately leased worker retries until the local customer/subscription mapping identifies exactly one organization, then applies the original transition transactionally. It never guesses among tenants or stores arbitrary Stripe payload fields.

Resend pending events already contain the bounded event type, provider email ID, occurrence time, and normalized bounce/click details needed for replay. A leased `SKIP LOCKED` worker retries events that arrived before their local send log. If the provider ID matches records from more than one organization, neither tenant is mutated; reconciliation continues only after the mapping becomes unique. Existing pending rows are backfilled into this worker, and exhausted attempts become redacted dead letters. `EMAIL_WEBHOOK_JOBS_ENABLED=false` disables the scheduled worker.

Meta verifies and normalizes the complete delivery before one durable batch claim. The callback processes at most 10 newly claimed messages inline by default (`META_WEBHOOK_INLINE_LIMIT` may set 0-100); leased `SKIP LOCKED` workers drain the remainder with bounded batches, retry delay, and redacted dead letters. Unmatched and ambiguous messages retain only normalized replay fields and are reapplied only after the page or Instagram business-account mapping identifies exactly one active organization. Socket delivery remains post-commit for both inline and worker paths. `SOCIAL_WEBHOOK_JOBS_ENABLED=false` disables the scheduled workers.

Twilio inbound tenancy is selected by the normalized `To` number in `sms_receiving_numbers`, whose global uniqueness gives each active provider number one owning organization. Only after that lookup does the handler match `From` against contacts inside the selected tenant. Unknown receiving numbers, missing sender contacts, and duplicate tenant-local sender contacts are recorded as distinct quarantine statuses without creating a conversation, message, or SMS log. Number provisioning is an operator/provider-account action and must complete before webhook traffic is enabled.

Workflow email, SMS, and outbound-webhook intents are persisted in `workflow_side_effect_outbox` before enrollment progress continues. Workers claim due work with `FOR UPDATE SKIP LOCKED`, increment a fenced attempt number, and apply provider-specific bounded recovery until sent, dead-lettered, or quarantined. Email and webhook leases can be recovered automatically because they carry a stable provider/receiver key. Twilio has no equivalent message-create key, so message creation runs once per claim; a timeout, network failure, missing HTTP status, or expired in-flight lease moves to `reconciliation_required` and is never automatically resent. A tenant-scoped operator either supplies the accepted Twilio SID, which records one correlated SMS log, or explicitly authorizes a resend with durable audit history. Cancelling the enrollment terminally cancels queued, retrying, dead-letter, and reconciliation-required intents.

Outbound workflow webhooks validate every DNS answer as globally routable, pin the accepted address set into the connection, ignore ambient proxies, reject redirects, cap request/response bytes, and protect transport/tracing headers. Temporary DNS/network failures plus 408/425/429/5xx retry; prohibited destinations, redirects, ordinary 4xx, and byte-policy failures dead-letter immediately. `WORKFLOW_SIDE_EFFECT_JOBS_ENABLED=false` disables the scheduled worker.

Workflow execution now exposes tenant-scoped summary and paginated queue queries with age, attempts, failures, cancellations, dead letters, operator retry history, and provider correlation IDs. These projections omit provider payloads, destinations, recipient addresses, custom headers, authorization data, and idempotency keys. Equivalent cross-provider dashboards for Stripe, Resend, Twilio, and Meta remain platform work.

Events that cannot yet correlate to a local provider ID remain pending. Reconciliation jobs use bounded exponential retry, lease/attempt metadata, a dead-letter terminal state, and operator-visible correlation IDs. Reconciliation must never guess a tenant from a non-unique sender, page, phone number, or email address.

## Remaining P0 blockers

- Cross-provider dashboards still need signature failures, duplicates, pending reconciliation, dead letters, and provider correlation IDs without payload leakage.

## Required parity scenarios

Every retained callback requires valid, missing, malformed, and stale signature tests; duplicate and concurrent duplicate delivery; unknown event; out-of-order state; provider retry after a 5xx; transaction rollback and redelivery; body-size rejection; secret-unavailable failure; payload/log redaction; and tenant isolation. Provider-specific suites additionally cover Stripe object/event races, Resend pending correlation and suppression, Twilio public-URL reconstruction and receiving-number routing, Meta challenge and page mapping, workflow signature expiry, and OAuth state tamper/replay.
