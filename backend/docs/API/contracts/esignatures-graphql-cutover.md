# E-signatures GraphQL cutover contract

**Status:** Phase 0 characterization

**Evidence date:** 2026-07-15

## Decision

Authenticated signature-document, template, lifecycle, delivery-intent, and audit operations move to GraphQL. Multipart PDF upload, authenticated/public PDF delivery, and every public signing capability route remain rate-limited HTTP protocols owned by NestJS.

The authoritative assignments for all 28 signature operations are in `graphql-operation-overrides.json`. This contract characterizes product behavior and evidence handling; it is not a claim that the current implementation satisfies a particular electronic-signature law or evidentiary standard.

## Ownership

| Domain | NestJS owner | Target operations |
| --- | --- | --- |
| Documents and audit | `SignatureDocumentsModule` | `signatureDocuments`, `signatureDocument`, `createSignatureDocument`, `updateSignatureDraft`, `deleteSignatureDraft`, `cancelSignatureDocument`, `signatureAuditTrail` |
| Templates | `SignatureTemplatesModule` | `signatureTemplates`, `signatureTemplate`, `createSignatureTemplate`, `updateSignatureTemplate`, `deleteSignatureTemplate`, `instantiateSignatureTemplate` |
| Delivery intent | `SignatureDeliveryModule` | `sendSignatureDocument`, `sendSignatureReminder`, `scheduleSignatureReminders`, `previewSignatureEmail` |
| Binary storage/delivery | `SignatureFilesModule` | retained HTTP draft/template upload, tenant/private source stream, completed download, and capability-authorized signing stream/download |
| Public signing | `PublicSigningModule` | retained HTTP `getSigningSession`, `submitSignature`, `declineSignature`, and the currently unavailable `verifySigner` |

## Authentication, tenancy, and plans

Authenticated operations use verified organization context. Documents, templates, recipients, fields, contacts, files, reminders, and audit rows scope through an organization-owned root. Outside-organization IDs return `NOT_FOUND`; child references supplied to an owned mutation return `BAD_USER_INPUT` without revealing foreign objects.

- Recipient `contactId`, when present, belongs to the active organization.
- A field's `recipientId` belongs to the same document.
- A document's source template belongs to the same organization.
- Public endpoints derive all authority from one high-entropy hashed recipient capability. They never accept an organization header.
- Plan access and monthly document quota are checked transactionally. The legacy route checks feature access but does not enforce `SIGNATURE_LIMITS`; concurrent creates can exceed the advertised quota.

## Draft definition and template snapshots

A document is editable only while `draft`. Title is non-blank; routing mode is `parallel` or `sequential`; expiration is a bounded positive number of days. Update input distinguishes omitted from explicit null. Recipient emails are normalized and unique case-insensitively per document, signing order is positive, and at most 50 recipients are accepted.

Supported fields are `signature`, `initials`, `text`, `date`, and `checkbox`. A field has a valid positive page number, positive dimensions, and percentage bounds fully contained within the page. At most 500 fields are accepted. Role names are non-blank and unique case-insensitively; every role-bound template field resolves deliberately when instantiated.

Metadata, roles/recipients, and fields are one aggregate transaction. Invalid child input changes nothing. Legacy routes still update metadata and replace child collections in separate transactions, so partial definition changes remain a cutover blocker despite pre-validation and draft locks.

Template instantiation snapshots file identity, metadata, roles, recipients, fields, routing, and expiration into a new draft in one transaction. Later template edits never rewrite existing documents. Cross-tenant recipient contacts are rejected.

## Lifecycle and concurrency

The target document lifecycle is:

```text
draft -> sent -> in_progress -> completed
draft|sent|in_progress -> cancelled
sent|in_progress -> expired
```

`completed`, `cancelled`, and `expired` are terminal. A sent document's source PDF, definition, recipients, completed artifact, hashes, and audit evidence are immutable. Only drafts can be deleted.

Initial send locks the draft. Exactly one concurrent request transitions it, creates active recipient capabilities, records audit/outbox events, and queues delivery. Legacy PostgreSQL coverage now proves two simultaneous sends produce one success, one conflict, one token, and one sent audit event.

Cancellation locks the document, refuses completed documents, revokes all active tokens, locks pending recipients, cancels pending reminders, and appends exactly one cancellation event. Repeated cancellation is idempotent. The former cancellation route was a no-op because generic document update ignored `status`; this is fixed and covered.

Immediate reminder applies only to `sent` or `in_progress` documents and only active unsigned recipients. It does not reopen signed/declined recipients, reset their evidence timestamps, or transition document state. Scheduled reminders use the same tenant/lifecycle rule. The former route reused initial send and reminder scheduling omitted organization scope; both defects are fixed and covered.

## Public signing capability

Raw signing tokens are generated with at least 256 bits of randomness, stored only as hashes, never returned in authenticated GraphQL DTOs, and redacted from logs/traces. Token lookup checks recipient state, document state, expiration, and sequential-routing activation under a row lock. Signing, decline, cancellation, and expiry revoke the capability. Repeated or concurrent terminal submission returns the same non-enumerating invalid/expired outcome without duplicate evidence.

The current product exposes `identity_method` values for email and SMS OTP, but verification is not implemented and `/verify` returns HTTP 410. Legacy configuration now rejects any method other than `none`; possession of the link is the only supported assurance. OTP values must not be advertised until issuance, throttling, hashed challenges, expiry, attempt limits, replay handling, and audit scenarios exist.

Submission accepts an exact allowlist of fields assigned to the recipient. Unknown fields are rejected rather than silently ignored. Required-value semantics are type-specific: unchecked checkbox, empty text, date format, signature/initial image format, duplicate IDs, payload count, and aggregate decoded-byte limits all need explicit validation. Signature image input permits only supported raster formats after decoded-content inspection; a `data:image/` prefix alone is insufficient.

Shared fields (`recipient_id IS NULL`) are currently writable by every recipient and can be overwritten. The target chooses explicit document-prefill versus signer-specific ownership and prevents later signers from changing earlier evidence.

Viewing may append a single first-view event, but a generic GET should not hide a state mutation. Source-file and download routes must not call a view-mutating loader. Define a separate idempotent `markViewed` transition or a clearly documented signing-session open operation.

## Audit and completion evidence

Audit rows are append-only and include document/recipient identity, versioned event type, server timestamp, actor/capability class, request correlation, IP policy, user agent policy, and structured metadata. Database roles prevent update/delete outside an explicit retention workflow. Document deletion is draft-only; non-draft evidence cannot cascade away through ordinary product operations.

Original and signed PDFs have SHA-256 hashes tied to immutable document versions. Every replacement creates a monotonically allocated version; the legacy upload always attempts version `1` with `ON CONFLICT DO NOTHING`, so later uploads can change the active hash without recording a new version. Fix this before cutover.

Completion atomically claims the last-recipient transition and records completion intent. PDF generation, object storage, and email delivery run as durable idempotent jobs outside the database transaction. The legacy submit path performs PDF generation and multiple emails inside the signing transaction, creating long locks and ambiguous provider-success/database-rollback outcomes.

## Files and storage

Upload remains authenticated multipart HTTP. Validate declared MIME and PDF magic bytes, parsing success, encryption policy, maximum bytes/pages/dimensions, decompression complexity, malware scanning, filename, and ownership before activation. Objects are private and addressed by owned keys, never arbitrary stored URLs.

The legacy local-file resolver pointed at `backend/src/uploads` while uploads were written under `backend/uploads`; it now resolves the correct root and rejects path traversal. Remote file delivery still contains a generic Axios proxy fallback based on stored URLs. The target must remove that SSRF surface and use only recognized private storage adapters.

Storage writes/deletes are not transactionally reversible with PostgreSQL. Use staged objects and an outbox/cleanup workflow so database failure does not orphan an upload and provider failure does not erase the only legal artifact. Completed downloads use short-lived authorization or a server stream, safe content disposition, and integrity metadata; permanent public S3 URLs are forbidden.

## Delivery and reminders

Resolvers commit delivery intent and return an accepted state; they do not call email, PDF, or object-storage providers. An outbox worker owns idempotency keys per document/recipient/event, retry state, provider message IDs, backoff, dead-letter handling, and operational visibility.

The legacy initial-send and immediate-reminder services call email inside database transactions. The reminder cron selects all due rows without a durable claim and catches errors without recording a failed state, so concurrent schedulers can duplicate mail and stuck work is invisible. Durable `FOR UPDATE SKIP LOCKED` or atomic claim/update semantics are required before cutover.

## Required parity scenarios

| Area | Required scenarios |
| --- | --- |
| Plans/tenancy | feature and monthly quota, concurrent quota race, every root/child cross-tenant reference, redacted not-found behavior |
| Drafts | create/update/null semantics, atomic recipient/field replacement rollback, duplicate email/role, field geometry/type/page limits, sent immutability |
| Templates | CRUD/tenancy, atomic role/field replacement, snapshot instantiation, missing role, contact denial, source replacement/versioning |
| Lifecycle | concurrent initial send, no recipient/file, cancellation/idempotency, completed cancellation denial, expiry, draft-only delete/file mutation |
| Capabilities | entropy/hash/redaction, wrong/expired/revoked/locked token, cancellation revocation, concurrent submit/decline, non-enumerating responses |
| Signing fields | unknown/duplicate IDs, ownership, all required types, raster validation, decoded-byte/count limits, shared-field policy, transaction rollback |
| Sequential routing | first activation, next activation once, decline policy, reminder targeting, equal/missing order, concurrent signer completion |
| Audit/evidence | ordered append-only events, immutable versions/hashes, first-view semantics, timestamps/IP policy, retention/export, tamper detection |
| Files | PDF magic/parse/malware/limits, path traversal, tenant denial, SSRF denial, object orphan cleanup, safe stream/download headers |
| Delivery/jobs | outbox atomicity, one provider call under worker race, provider success then crash, retry/dead-letter, reminder claim, cancellation race |

## Current evidence and exit gate

Fresh PostgreSQL now covers concurrent initial-send exclusion, atomic cancellation and capability/reminder revocation, cancellation idempotency, cross-tenant reminder denial, invalid reminder delays, sent-definition immutability, selective reminder behavior, and unknown signing-field rejection. Existing generic database bootstrap verifies all signature tables are created from zero.

The e-signature slice is not ready for traffic until:

1. document/template aggregate edits and quota enforcement are atomic and concurrency-safe;
2. public field values, shared ownership, sequential routing, expiry, decline, and terminal races have complete validation and PostgreSQL coverage;
3. source/signed artifacts use immutable versioned private storage with safe parsing, scanning, delivery, cleanup, and no arbitrary URL proxy;
4. audit evidence is append-only under database permissions with defined retention/export and integrity verification;
5. PDF generation, initial delivery, completion notices, and reminders use durable idempotent jobs outside transactions;
6. OTP verification is fully implemented and tested or remains impossible to configure;
7. GraphQL operations, retained HTTP protocols, and critical draft/send/sign/decline/cancel/download browser journeys pass semantic parity and rollback tests.
