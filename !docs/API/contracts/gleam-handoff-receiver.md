# Gleam handoff receiver

Date: 2026-09-15. Implemented locally; no customer connection enabled.

## Implemented boundary

Itemize now exposes authenticated service endpoints:

- `POST /api/integrations/gleam/handoffs`: applies a `gleam.handoff.requested` event and returns a committed v1 handoff receipt.
- `GET /api/integrations/gleam/receipts/:eventId`: retrieves an existing receipt for the authenticated connection and generation.

This is the receiving half of the integration. There is no customer-facing connect/approve flow, grant-provisioning endpoint, Gleam handoff producer/outbox or delivery worker yet. Do not seed production grants as a substitute for the two-product approval flow. Only disposable test fixtures create active grants in this slice.

## Authentication

Both endpoints use a new, explicitly classified integration HTTP boundary and `GleamIntegrationGuard`. They do not use browser session cookies, CSRF exemptions on session routes, or generic provider webhook authentication.

Credentials are RS256 JWTs signed by a dedicated per-connection RSA private key (at least 2048 bits). Itemize stores only the public key. The guard pins that key and key ID from the connection record; token-supplied key URLs, embedded keys, unsupported algorithms and unknown header fields are rejected.

Required JWT fields:

| Field | Contract |
| --- | --- |
| Header | alg RS256, typ JWT, kid equal to the connection's key ID |
| iss | `urn:gleam:client-work:v1` |
| aud | `urn:itemize:client-work:v1` |
| sub | Approved Gleam organization ID |
| connectionId | Connection UUID |
| generation | Current positive integer connection generation |
| scope | Exactly `handoffs:write` for POST or `receipts:read` for GET |
| jti | UUID identifying this credential issuance |
| iat / exp | Integer seconds; positive lifetime of at most 300 seconds; expired credentials rejected; future issuance limited to 30 seconds of clock skew |
| nbf | Optional; enforced when present |

Gleam's `backend/src/integrations/itemize-service-token.ts` implements the matching signer. It takes an already authorized connection description and a dedicated private key. It does not retrieve grants, authorize users or send requests. Each mint has a new jti; a delivery retry retains the same event ID and payload even when it mints a fresh credential.

After verification, the receiver locks the connection and rechecks state, approvals, source and destination organization IDs, generation, key ID/fingerprint and expiry. The destination organization is derived from that verified connection, never from body fields or `x-organization-id`.

The local approving owner/admin must still be an accepted manager. New handoffs require an eligible default assignee; a missing, removed, invited or viewer assignee blocks application with ASSIGNEE_UNAVAILABLE. Reapproval/reassignment UI is part of the next connection-management slice.

## Atomic application and replay

The receiver serializes application per connection and commits the following in one PostgreSQL transaction:

1. Validate the event and connection, current approval, plan entitlement and assignee.
2. Verify an explicit Itemize client reference belongs to this organization, if supplied.
3. Create one assigned task with call context and configured due interval, measured from the source request time.
4. Append a call activity to the explicitly linked client, when present.
5. Append a task audit record with integration provenance, without impersonating the approving user.
6. Persist source-to-task mapping and an immutable applied receipt.

The HTTP response is emitted only after commit. There is no enqueue-only success response. Receipt failure rolls back the task, activity, audit and source mapping.

An unknown caller remains an unlinked task with callback details visible in its description. The receiver does not guess a contact from a shared phone number, create a CRM contact, or silently discard the request. Automatic matching/creation and later manual linkage need their own workflow.

Inbox uniqueness is (connection ID, generation, event ID). The fingerprint covers the normalized, canonically ordered event. Same key and intent returns the original receipt; changed intent returns EVENT_PAYLOAD_CONFLICT.

Source uniqueness is (connection ID, handoff ID), deliberately independent of generation. Re-emitting the same immutable handoff under a new event ID or generation returns the existing task, without overwriting staff edits or creating duplicate activity/audit. Changed source content is SOURCE_IDENTITY_CONFLICT; v1 does not support revising an already emitted handoff.

Deleting a task leaves its source mapping as a tombstone, and new re-emissions return HANDOFF_REMOVED instead of recreating it. An original receipt remains evidence of the historical application. Changing either organization on a connection is rejected by a database trigger; a different organization pair requires a different connection and an explicit migration decision.

New work requires the existing Solo-or-higher entitlement. An exact replay or receipt lookup may reconcile an already committed result after subscription expiry. Revoked connections, obsolete credentials or invalid approval still cannot access receipts.

## Responses

Successful POST and GET return the shared `HandoffAppliedReceipt` body with HTTP 200.

Errors return `{ "error": { "code": "..." } }` without token, provider or database details from the integration layer:

- 400: INVALID_EVENT or INVALID_EVENT_ID.
- 401: INVALID_CREDENTIAL or CONNECTION_REVOKED.
- 403: SCOPE_FORBIDDEN, CONNECTION_MISMATCH, APPROVAL_REQUIRED or ENTITLEMENT_REQUIRED.
- 404: RECEIPT_NOT_FOUND, including an event belonging to another connection.
- 409: EVENT_PAYLOAD_CONFLICT, SOURCE_IDENTITY_CONFLICT, CONTACT_REFERENCE_INVALID or ASSIGNEE_UNAVAILABLE.
- 410: HANDOFF_REMOVED.

Unexpected server failures retain the application's standard 500 handling. A lost response or 5xx is not evidence that application failed: retry the identical event or use receipt lookup. Do not mint a new event ID for uncertain delivery.

## Schema and rollout

Migration `088_gleam_handoff_receiver.js` delegates to `db/src/db_gleam_handoff_receiver_migrations.js`. The canonical initializer records `gleam_handoff_receiver_v1`.

Tables are `gleam_connections`, `gleam_handoff_sources` and `gleam_handoff_inbox`. New grants default to pending; active rows require approval timestamps from both products. The [pairing coordinator](gleam-pairing.md) establishes that approval through fixed-peer verification and explicit managers' actions; timestamps alone are not a remote ownership-verification mechanism. Initial active connections are one-to-one between organizations.

Deploy the additive migration before the Itemize backend. Pairing, encrypted Gleam credential storage, audit/revocation UI and the producer/outbox/worker are now implemented behind rollout switches; see [pairing configuration and acceptance coverage](gleam-pairing.md). Keep customer rollout disabled until reverse task-completion events and notification coordination complete the release gate. Activation must be explicit per organization. Raw recordings/transcripts, outbound calls, automatic contact creation and assignment notifications are not enabled by this slice.

## Verification

- Migration applied to the disposable PostgreSQL 16 database and rerun idempotently; schema bootstrap verified 178 tables and 168 migration markers.
- 25 HTTP/PostgreSQL tests pass: atomic delivery, concurrent duplicate requests, changed payload/source conflicts, staff-edit preservation, unknown callers, tenant isolation, audience/issuer/signature/key-header/scope checks, expiry, revocation between guard and transaction, replaced-key races, generation changes, immutable organization pairs, deleted-task tombstones and receipt-write rollback.
- Five HTTP authorization-boundary checks pass, including the new requirement for the dedicated guard and explicit route scope.
- Two Gleam signer tests pass, verifying the signature, claim bindings, short lifetime, unique credential IDs and rejection of weak keys/unsupported scopes.
- Itemize backend TypeScript checking passes.
- The ten existing task lifecycle PostgreSQL/GraphQL tests also pass. Gleam's current backend source builds in the isolated verification workspace with its current Prisma client, and the signer passes ESLint.

No production database, customer grant or provider credential was used.
