# E-signatures GraphQL cutover contract

**Status:** Authenticated reads, draft/template mutations, provider-free cancellation, and email preview live; durable delivery, file lifecycle, and public signing retained HTTP deployed default-off

**Evidence date:** 2026-07-23

## Decision

Authenticated signature-document, template, lifecycle, delivery-intent, and audit operations move to GraphQL. Multipart PDF upload, authenticated/public PDF delivery, and every public signing capability route remain rate-limited HTTP protocols owned by NestJS.

The authoritative assignments for all 28 signature operations are in `graphql-operation-overrides.json`. This contract characterizes product behavior and evidence handling; it is not a claim that the current implementation satisfies a particular electronic-signature law or evidentiary standard.

## Ownership

| Domain | NestJS owner | Target operations |
| --- | --- | --- |
| Documents and audit | `SignatureDocumentsModule` | `signatureDocuments`, `signatureDocument`, `createSignatureDocument`, `updateSignatureDraft`, `deleteSignatureDraft`, `removeSignatureDraftPdf`, `cancelSignatureDocument`, `signatureAuditTrail` |
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

Raw signing tokens are derived with 256 bits of HMAC output, stored only as SHA-256 hashes, never returned in authenticated GraphQL DTOs, and omitted from proxy logs. Token lookup checks recipient state, document state, expiration, supported identity method, and sequential-routing activation under a row lock. Signing, decline, cancellation, and expiry revoke the capability. Repeated or concurrent terminal submission returns the same non-enumerating invalid/expired outcome without duplicate evidence.

The current product exposes `identity_method` values for email and SMS OTP, but verification is not implemented and `/verify` returns HTTP 410. Legacy configuration now rejects any method other than `none`; possession of the link is the only supported assurance. OTP values must not be advertised until issuance, throttling, hashed challenges, expiry, attempt limits, replay handling, and audit scenarios exist.

Submission accepts only the exact unlocked fields assigned to the recipient. Unknown, shared, locked, and duplicate fields are rejected rather than silently ignored. Required-value semantics are type-specific for checkboxes, text, strict calendar dates, and signature/initial images. Payload count, encoded bytes, per-image bytes, aggregate decoded image bytes, and text bytes are bounded. Images permit only structurally valid PNG or JPEG data URLs with bounded dimensions; a claimed MIME prefix alone is insufficient.

Shared fields (`recipient_id IS NULL`) are treated as document-prefill. They are not projected in a signer session and cannot be submitted by a capability, preventing a later signer from rewriting shared or earlier evidence.

Opening the signing session is the documented idempotent first-view transition. It records `viewed_at` and one audit event only once. Source-file and download routes authorize independently and never mutate viewed state.

## Audit and completion evidence

Audit rows are append-only through the application and include document/recipient identity, versioned event type, server timestamp, actor/capability class, request correlation, IP policy, user agent policy, and structured metadata. Document and source-file deletion are draft-only. Ordinary organization deletion locks the tenant and its signature rows, refuses deletion while any non-draft evidence exists, and therefore cannot cascade sent, in-progress, completed, cancelled, or expired evidence away.

Original and signed PDFs have SHA-256 hashes tied to immutable document versions. Both NestJS and the retained rollback path lock the draft, preserve any pre-existing active source not already represented, and append every accepted replacement at `MAX(version_number) + 1`. Replacements never enqueue a versioned source for deletion. Draft PDF removal and whole-draft deletion enqueue the current source plus every historical version before deleting the version rows.

Completion atomically claims the last-recipient transition and records one completion intent. Migration 044's leased worker loads the authoritative completed-recipient snapshot, generates and hashes the signed PDF plus certificate outside the request transaction, stores it through the private signature provider, fences the final document transition, queues linked-contact `contract_signed` triggers, and queues escaped completion notices. Provider email delivery stays in the existing leased outbox. A stale completion removes its newly generated artifact; retry/dead-letter state is bounded and redacted.

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

## Implemented authenticated read slice

`SignatureDocumentsModule` now implements `signatureDocuments`, `signatureDocument`, and `signatureAuditTrail`. `SignatureTemplatesModule` implements `signatureTemplates` and `signatureTemplate`. The frontend preserves its existing REST-shaped service contract and selects these queries through two independent rollback flags: `VITE_SIGNATURE_DOCUMENT_READS_GRAPHQL` and `VITE_SIGNATURE_TEMPLATE_READS_GRAPHQL`. Both flags are enabled in production.

Document and template details are repeatable-read aggregate snapshots. Root and child queries are tenant-qualified, list ordering is deterministic, plan access fails closed, and foreign IDs return `NOT_FOUND`. GraphQL exposes file-presence booleans that the authenticated frontend maps to retained HTTP streams; it does not expose capability hashes, IP/user-agent evidence, audit metadata, storage locations, or file hashes.

Focused service and adapter tests pass. A disposable PostgreSQL contract proves enum filtering, stable pagination, document/recipient/field/audit aggregation, ordered template roles/fields, foreign-tenant concealment, safe projections, and interoperability with the retained Express read routes. Commit `1f00606b` deployed through legacy backend `e9d25b63-f612-43dc-86fe-80be16129611`, GraphQL `2a0c55c3-299e-4d23-81e7-d00225618834`, and flag-enabled frontend `2265bdd2-6e20-4f05-b65a-e5e7782ba53f`. An authenticated production browser rendered the existing document list, expanded its detail, and rendered the empty template state without console errors; Nest recorded successful zero-error `SignatureDocumentReads`, `SignatureDocumentRead`, and `SignatureTemplateReads` operations.

## Current evidence and exit gate

Fresh PostgreSQL now covers concurrent initial-send exclusion, atomic cancellation and capability/reminder revocation, cancellation idempotency, cross-tenant reminder denial, invalid reminder delays, sent-definition immutability, selective reminder behavior, public first-view idempotency, non-mutating file reads, field ownership rollback, sequential activation, document-wide decline, concurrent terminal actions, and durable PDF completion. Existing generic database bootstrap verifies all signature tables are created from zero.

## Implemented draft and template mutation slice

`SignatureDocumentsModule` now implements `createSignatureDocument`, `updateSignatureDraft`, and `deleteSignatureDraft`. `SignatureTemplatesModule` implements `createSignatureTemplate`, `updateSignatureTemplate`, `deleteSignatureTemplate`, and `instantiateSignatureTemplate`. The frontend selects them through independent production-enabled rollback flags: `VITE_SIGNATURE_DOCUMENT_MUTATIONS_GRAPHQL` and `VITE_SIGNATURE_TEMPLATE_MUTATIONS_GRAPHQL`; multipart source upload remains on its existing HTTP boundary and draft-PDF removal has a separate staged GraphQL switch.

Document metadata, recipient replacement, field replacement, and role-to-recipient binding now share one row-locked transaction. Template metadata, unique roles, and role-bound fields likewise commit together. Creation and instantiation serialize on the organization row before enforcing the starter/unlimited monthly document quota, preventing concurrent requests from oversubscribing it. Inputs bind recipients to tenant-owned contacts, constrain email/role uniqueness, reject unimplemented OTP identity methods, bound aggregate sizes and geometry, and preserve explicit nullable metadata clearing. Non-draft deletion fails with `CONFLICT`.

Fresh PostgreSQL proves complete rollback when a child mapping fails after metadata work, GraphQL-write/retained-REST-read interoperability, template snapshot binding, exact draft deletion, and five winners from six concurrent starter-plan creates. Focused adapters prove all seven existing mutation callsites remain on REST while flags are off and switch by family without moving multipart uploads.

Commit `8e756351` deployed through legacy backend `70c49ae0-0624-4778-a658-4dd763cf6456`, GraphQL `7625d3ce-e69c-4504-aaf2-1c948715afcc`, and flag-enabled frontend `a8a0c352-1fa3-4f9d-8bef-ccab8ab588d7`. Railway confirms both mutation flags are `true`. An authenticated production browser created and edited a no-file template, instantiated it, edited the resulting draft, created a separate draft, and deleted both drafts and the template without console errors or provider work. Nest recorded successful zero-error operations for all seven mutation names, and the existing sent document remained untouched.

All e-signature application consumers and retained binary/public transports now have production NestJS ownership. Private-S3, required malware scanning, durable worker ownership, public signing, authenticated files, delivery/reminders, and draft-file removal are enabled. Remaining release assurance is deliberately narrower:

1. approve the retention duration plus portable evidence export and tamper-verification policy;
2. execute an explicitly authorized disposable browser send/sign/decline/completion/download journey through the live provider and object store;
3. keep OTP impossible to configure unless its complete issuance/throttling/hash/expiry/replay protocol is implemented;
4. rotate the reused production credentials at the agreed final cutover step.

## Implemented provider-free lifecycle and preview slice

`SignatureDocumentsModule` now implements `cancelSignatureDocument` as a CSRF-protected organization-scoped mutation. The document row is locked before state inspection; completed documents fail with `CONFLICT`, foreign IDs remain concealed, repeated cancellation returns the existing cancelled snapshot without another audit row, and the first transition atomically revokes active recipient capability hashes/expiry, locks routing, cancels pending reminders, changes document status, and appends one audit event.

`SignatureDeliveryModule` now implements `previewSignatureEmail` as a pure organization-scoped query. It validates bounded content, escapes every user-controlled HTML insertion, derives the preview link and asset origin from server configuration, ignores the legacy browser-supplied `baseUrl`, performs no delivery, and returns only subject plus rendered HTML. Independent production-enabled flags `VITE_SIGNATURE_CANCELLATION_GRAPHQL` and `VITE_SIGNATURE_EMAIL_PREVIEW_GRAPHQL` preserve data-neutral REST rollback.

Focused service/adapter tests and the disposable PostgreSQL gate pass: 489/489 retained Express tests and 218/218 Nest integration tests. PostgreSQL proves cancellation idempotency, capability/reminder revocation, one audit event, completed-state refusal, foreign-tenant concealment, escaped preview output, and invalid-message rejection without provider work.

Commit `792d4891` deployed through retained backend `0464fd60-9b7e-4a27-b551-1f5f7af4c681`, GraphQL `f69286e1-f70e-4ef6-8a62-40f6a47138bc`, default-off frontend `ba71644c-6752-4d5a-abcc-d48678d6c5f9`, and flag-enabled frontend `d747d956-49a7-4d02-8665-007f9c34a5fa`. An authenticated production editor rendered a server-origin preview for a disposable draft; a separate inert sent fixture cancelled through GraphQL with token and expiry revocation, routing lock, pending-reminder cancellation, and exactly one audit event. Nest logged both operations with status 200 and zero errors, the browser logged no console errors, both fixtures were removed, and the original sent document remained unchanged.

## Implemented durable request and reminder delivery slice

`SignatureDeliveryModule` now implements `sendSignatureDocument`, `sendSignatureReminder`, and `scheduleSignatureReminders`. The frontend routes the existing send and remind consumers together through `VITE_SIGNATURE_DELIVERY_GRAPHQL`, which is production-enabled after the single-owner delivery/completion scheduler handoff.

Migration 042 adds `signature_delivery_outbox`. Initial send locks the draft, validates its PDF and recipients, snapshots provider payloads, derives deterministic signing capabilities from the existing JWT secret (or an optional dedicated derivation key), stores only SHA-256 capability hashes on recipients, and commits lifecycle, routing, audit, and delivery intents atomically. Sequential routing activates only the first recipient; parallel routing activates all recipients. Manual reminders target only active unsigned recipients, supersede queued/retry attempts, and refuse to rotate a capability while delivery is processing.

The worker converts due schedules into recipient-scoped intents, leases work with `SKIP LOCKED`, recovers expired leases, calls the shared Resend provider with a stable idempotency key, and fences provider acknowledgement by claim generation. Failures are redacted and move through bounded exponential retry or dead-letter states. Cancellation revokes capabilities and cancels queued, retrying, or processing intents; a late provider acknowledgement cannot restore cancelled database state.

Focused service, renderer, adapter, and migration tests pass. The clean-schema gate passes 489/489 retained Express tests and 219/219 Nest PostgreSQL integration tests; the full Nest unit suite passes 373/373 and the frontend suite passes 355/355. PostgreSQL proves one initial-send winner, one provider call under concurrent workers, no raw capability in the outbox, scheduled reminder conversion, manual reminder supersession, bounded delays, audit fencing, and cancellation of queued delivery.

Commit `5bcabdf2` deployed safely with the delivery consumer still off through retained backend `15f75079-ad47-45ea-8497-fb8f437b2298`, GraphQL `c2c42c73-278c-4a18-b49a-4f63eb486e86`, and frontend `f99512b2-23db-462d-b63f-a53476cbb74f`. Railway applied migration 042 and all services became healthy. Safe unauthenticated probes proved the three operations exist in the live schema, while the shipped frontend bundle retained REST send/remind code and omitted the GraphQL delivery operation text. No worker schedule or provider canary has run.

## Implemented durable draft-PDF removal slice

`SignatureDocumentsModule` now implements CSRF-protected `removeSignatureDraftPdf`. The transaction locks the tenant-owned document, rejects non-drafts, is idempotent once metadata is absent, atomically clears every original/signed file locator and hash, appends one `file_removed` audit event, and enqueues the former locator before commit. `deleteSignatureDraft` uses the same enqueue boundary, closing the pre-existing orphan-object path. The frontend routes only this call through the production-enabled `VITE_SIGNATURE_FILE_MUTATIONS_GRAPHQL` switch, independently of draft metadata mutations and multipart upload.

`SignatureFilesModule` now owns the unchanged authenticated multipart and binary URLs in NestJS. Uploads enforce cookie authentication, selected-organization membership, double-submit CSRF, one 5 MiB PDF, tenant preflight, a locked authorization recheck, private unguessable storage, SHA-256 metadata, failed-commit compensation, and immutable monotonic source versions. Draft removal enqueues and clears the active source plus every historical version. Template deletion also enqueues its source, while the cleanup worker preserves any locator still used by a document, template, or immutable document version. Private reads conceal foreign resources and accept only the exact local signature root or configured S3 bucket/prefix before returning hardened inline or attachment responses. Upload and read ownership are independently reversible through default-off legacy proxy flags and require no frontend URL change.

Migration 043 adds `signature_file_deletion_jobs`. The standalone retained-backend worker leases with `SKIP LOCKED`, fences completion by claim generation, defers while any document or template still references the locator, and deletes only traversal-safe local signature paths or the exact configured S3 bucket plus `signatures/` prefix. Missing local files converge on success, transient failures retry with bounded backoff, and unsupported locators dead-letter without filesystem or network access. Worker scheduling remains deferred to the final operational cutover.

Focused migration, service, adapter, and unit tests pass. The clean-schema gate passes 489/489 retained Express tests and 220/220 Nest PostgreSQL integration tests. The disposable e-signature contract proves tenant concealment, lifecycle refusal, idempotent metadata clearing, one audit event, durable cleanup on whole-draft deletion, shared-reference preservation, and exactly one completion when two workers race.

Commit `4716dec7` deployed safely with the consumer and worker still off through retained backend `ca1929b9-1d6f-4800-b9ad-cd54b1304808`, GraphQL `998f9ca7-e544-45a7-9e8f-6bf341d261c2`, and frontend `3d582d35-11f0-4d41-9bb7-b1f4b3443be7`. Railway applied migration 043 before GraphQL started. Health and site checks passed; an unauthenticated live probe resolved the mutation and returned `UNAUTHENTICATED`; deployed signature bundles retained the REST file path and omitted the GraphQL removal operation. No storage cleanup or production data mutation ran.

## Implemented authenticated signature file HTTP slice

`SignatureFilesModule` owns the two authenticated multipart uploads and three private source/download routes without moving binary bytes into GraphQL. The unchanged URLs preserve every browser callsite. A dedicated cookie/organization guard requires double-submit CSRF on uploads, while read requests remain non-mutating. Multer bounds one 5 MiB PDF plus one ID field, and the service verifies `%PDF-` bytes before choosing an unguessable server-owned `.pdf` locator.

Uploads conceal foreign owners before storage and recheck authorization under a row lock before committing metadata. Document upload is draft-only, snapshots an unrepresented active source, and appends the replacement at the next monotonic version without queuing historical evidence for deletion. Template replacement still enqueues its superseded source, and GraphQL template deletion enqueues its private source. A lost authorization race or failed database transaction compensates by deleting the newly stored object. Draft PDF removal and whole-draft deletion enqueue every current and historical source before clearing version metadata.

Private delivery accepts only the exact local signature root or the configured S3 host plus `signatures/` prefix. Traversal, lookalike hosts, wrong prefixes, arbitrary URLs, missing objects, and foreign tenants fail closed. Successful source/template responses are inline; completed artifacts are attachments; both use `private, no-store`, `application/pdf`, `nosniff`, a sandbox CSP, exact length, and safe filenames.

The legacy origin has two independent rollback switches: `SIGNATURE_FILE_UPLOADS_NESTJS_ENABLED` for the multipart routes and `SIGNATURE_FILE_READS_NESTJS_ENABLED` for the private streams/download. Focused proxy, storage, service, cleanup, and lifecycle tests pass. The full Nest suite passes 383/383, the frontend suite passes 358/358, both production builds pass, and a clean schema passes 489/489 retained Express plus 222/222 Nest PostgreSQL tests. The initial deployment kept both switches off; the production rehearsal and ownership evidence below records their later activation.

## Implemented public signing retained-HTTP slice

`PublicSigningModule` now owns all six unchanged capability URLs: session open, verification refusal, submit, decline, inline source PDF, and attachment source PDF. The legacy origin has independent default-off read and mutation proxies, `PUBLIC_SIGNING_READS_NESTJS_ENABLED` and `PUBLIC_SIGNING_MUTATIONS_NESTJS_ENABLED`, so either family can fall through to Express without changing the browser URL or repairing data. Proxies bound request/response bytes and timeouts, forward no cookies or organization context, allowlist headers, and never log a capability.

The capability query requires an active, unexpired recipient and document, `identity_method='none'`, and active sequential routing. Missing, malformed, wrong, expired, revoked, cancelled, unsupported-assurance, and routing-locked links share one non-enumerating 404. Session open records first view once; file/download do not. Signer DTOs contain a file-presence sentinel rather than a storage locator and contain only recipient-owned unlocked fields.

Submit and decline lock the document, capability recipient, and recipient set. Submit validates the complete signer-owned field set, revokes its capability, cancels obsolete reminders/deliveries, appends evidence, and either activates the next sequential recipient exactly once or queues the unique completion job. Decline cancels the document, revokes all remaining capabilities, cancels reminders/request deliveries and pending completion, and queues a sender notice. Competing sign/decline calls serialize to one authoritative event and one non-enumerating miss.

Migration 044 expands the delivery outbox for escaped signer/completion/decline notices and adds leased `signature_completion_jobs`. The worker generates the signed PDF and certificate outside the request transaction, hashes and stores it through `SignatureFilesModule`, fences completion, removes a stale generated artifact, queues linked-contact workflow events, and queues sender/recipient notices. The signing page now accepts only PNG/JPEG uploads, prevents duplicate terminal clicks, and replaces the revoked session with a terminal confirmation.

Local gates pass 397/397 Nest unit tests, 383/383 retained-backend unit tests, and 358/358 frontend tests. The targeted fresh PostgreSQL signature suite passes 15/15, including the capability, binary, ownership, sequential, decline, terminal-race, and completion paths; the complete fresh run passes 489/489 retained integration tests and 225/225 Nest integration tests. Both production builds pass.

Commit `10f8e49c` deployed default-off through retained backend `3a0f8c82-3592-4a29-8073-aa7aebf1d866`, GraphQL `0e3944bb-8c65-4245-b4ba-cc0bb9ead653`, and frontend `2b88f5be-88d6-4a84-a420-dbcd964a58fa`. Railway applied migration 044 before the retained backend started; Nest initialized the module and mapped all six routes; both proxy flags remain absent. Site/API health and unknown-capability/verification probes passed without a valid capability, provider call, worker schedule, storage write, or production data mutation. Provider/S3 rehearsal and valid browser sign, decline, and download journeys remain deferred.

The Nest deployment artifact now owns its AWS S3 client instead of dynamically requiring the retained backend, which is not packaged with the standalone Railway service. It uses the existing bucket, region, access-key, secret-key, and optional session-token contract; object keys remain unguessable, AES-256 server-side encrypted, and restricted to the private `signatures/` prefix. Upload validation now parses the complete PDF before storage, rejects encrypted or malformed input, requires 1-200 pages, and bounds every page dimension to 14,400 points in addition to the existing 5 MiB transport limit. Focused storage/validation tests pass 13/13, the full Nest suite passes 401/401, the Nest build passes, and the clean-schema gate passes 489/489 retained integration plus 225/225 Nest PostgreSQL tests. Commit `0eb05ead` deployed default-off through GraphQL deployment `bd862f41-169e-4603-95ae-b47d638d972f`; Nest started successfully and the same-origin GraphQL probe returned HTTP 200. GraphQL AWS variables remain absent, so no storage access or canary was attempted. Malware/quarantine policy, range delivery, credential wiring, and a controlled production S3 canary remain deferred.

## Implemented immutable signature source-version slice

NestJS and the retained rollback upload path now serialize on the draft row, preserve an existing active source when importing pre-versioned data, and append every accepted replacement with a monotonic version number, immutable locator, file metadata, SHA-256 hash, creator, and timestamp. A replaced source remains live evidence and is not submitted to the deletion queue.

Draft PDF removal and whole-draft deletion collect the distinct active and historical locators inside the same transaction, enqueue each for durable deletion, and only then clear or delete the version rows. The cleanup worker now treats `signature_document_versions` as a live reference, so it cannot delete a historical source while evidence still retains it. Both implementations use the same behavior, preserving a safe rollback boundary.

The retained unit suite passes 384/384, the Nest unit suite passes 401/401, the Nest build passes, and the clean-schema cross-stack gate passes 490/490 retained integration plus 225/225 Nest PostgreSQL tests. The PostgreSQL contracts prove the same monotonic version/removal behavior through both implementations, no premature cleanup intent, malformed full-PDF rejection before storage, all-version cleanup on removal/deletion, shared-reference deferral, and single-winner cleanup leasing. Commit `d322f844` deployed default-off through retained backend `9409092a-e540-483e-a951-50485db89231` and GraphQL `906891d1-3f36-4f1a-a63a-ff92c84838ef`; both became healthy and the same-origin GraphQL probe returned HTTP 200. The four signature file/public-signing proxy flags remain absent, no worker or storage operation ran, and no production data changed.

## Implemented signature PDF range and conditional-delivery slice

Authenticated source/template/completed reads and public capability-authorized source reads now share one explicit HTTP representation contract across NestJS and the retained rollback handlers. The persisted source/signed SHA-256 is emitted as a strong ETag. A matching `If-None-Match` returns `304`; one valid closed, open-ended, or suffix byte range returns `206` with exact `Accept-Ranges`, `Content-Range`, and `Content-Length`; and a stale `If-Range` returns the complete `200` representation. Multiple, malformed, or unsatisfiable ranges fail non-enumerating with `416` and `Content-Range: bytes */<total>`.

Local storage opens and reads only the selected window. The standalone Nest S3 provider issues `HeadObject` before ranged `GetObject`, while the retained S3 provider uses the same bounded request contract. Both default-off read proxies forward only `Range`, `If-Range`, and `If-None-Match` from the client and copy only the hardened response-header allowlist, including ETag and range metadata.

Focused range/parser, provider, service, proxy, and route tests pass. The retained unit suite passes 385/385, the Nest unit suite passes 414/414, the Nest build passes, and the clean-schema cross-stack gate passes 491/491 retained integration plus 225/225 Nest PostgreSQL tests. The integration contracts exercise authenticated and public delivery, exact partial bytes, conditional `304`, stale-validator full fallback, and unsatisfiable `416` behavior.

Commit `2f2aefff` deployed default-off through retained backend `ca9417d5-7b0c-4f0c-8a6e-b9c7e114d8db` and GraphQL `7a6a91fb-d395-408a-b77c-28702f78ee78`. Both releases became healthy; itemize.cloud, production API health, and the same-origin GraphQL probe returned HTTP 200. Railway confirmed all four signature file/public-signing proxy flags remain absent on both services and the GraphQL service still has no AWS variables. No valid capability, authenticated file request, S3 operation, worker, provider call, or production data mutation ran.

## Implemented crash-abandoned signature artifact cleanup slice

NestJS and the retained rollback upload path now allocate the final owned local/S3 locator, commit a delayed `signature_file_deletion_jobs` receipt, and only then write PDF bytes. Retained Multer uses bounded memory until that receipt exists. The locked document/template metadata transaction removes the receipt only after the new locator and immutable version data commit. Failed writes, authorization races, transaction failures, and process death therefore leave a retryable cleanup record; successful compensation may remove bytes immediately while the worker safely converges a missing object.

The signed-PDF completion worker uses the same pre-registration boundary before storing its generated artifact. Its fenced completion transaction removes the receipt together with the completed locator/hash transition. A crash between storage and fencing can no longer produce an undiscoverable artifact, and a stale completion still attempts immediate removal.

The retained unit suite passes 386/386, the Nest unit suite passes 414/414, and the Nest build passes. A clean disposable database passes the retained signature contract 11/11 plus the complete Nest integration gate 225/225. PostgreSQL observes a delayed queued receipt during upload and completion storage callbacks and proves it is absent only after each authoritative transaction commits.

Commit `2d8a3948` deployed default-off through retained backend `aca109f5-0144-4cca-9216-a125f0a60414` and GraphQL `e2dd4111-a57a-4d28-acaf-f04f84a0a10d`. Both became healthy; itemize.cloud, production API health, and the same-origin GraphQL probe returned HTTP 200. Railway confirmed all four signature file/public-signing proxy flags and both checked cleanup-schedule variables remain absent, while GraphQL still has no AWS variables. No upload, completion, cleanup worker, storage access, provider call, or production data mutation ran.

## Implemented signature PDF safety boundary

NestJS and the retained rollback receiver now apply the same full-PDF safety policy before any storage locator or durable cleanup receipt exists. In addition to the 5 MiB transport, encryption, page-count, and page-dimension limits, the parser bounds indirect objects, graph nodes, dictionaries, arrays, streams, decoded Flate bytes, compression ratio, per-image pixels, and aggregate image pixels. Active actions, scripts, forms, XFA, rich media, imports, launches, and embedded-file markers are rejected. Non-image streams may use only inspectable Flate encoding; embedded images have a narrow filter allowlist plus decoded-workload bounds.

Both paths also implement a bounded ClamAV `INSTREAM` client configured by `SIGNATURE_CLAMAV_HOST`, optional `SIGNATURE_CLAMAV_PORT`, and optional `SIGNATURE_CLAMAV_TIMEOUT_MS`. Inspection occurs while the upload remains in memory and before storage allocation, making the untrusted-memory boundary the quarantine stage. Detected content returns the existing non-disclosing upload error. When `SIGNATURE_MALWARE_SCAN_REQUIRED=true`, missing, invalid, timed-out, or unreachable scanning returns `FILE_SCAN_UNAVAILABLE` with HTTP 503 and performs no storage work. With the gate absent, the result is explicitly `skipped`, not `clean`, preserving deployment compatibility without overstating the production verdict.

The retained unit suite passes 391/391, the Nest unit suite passes 421/421, targeted scanner framing and fail-closed tests pass, and the Nest build passes. A clean disposable database passes the complete retained integration gate 491/491 and Nest integration gate 225/225. Production scanner attachment, required-mode clean/infected/outage canaries, private-S3 credential rehearsal, and upload-route traffic cutover remain deferred to the final configuration phase.

Commit `56d82680` deployed with compatibility defaults through retained backend `e41e24c8-613e-40cf-b1a6-5677a1369d59` and GraphQL `e6f38789-5e8a-4ab7-9300-219430624e30`. Both releases became healthy; itemize.cloud, production API health, and the same-origin GraphQL probe returned HTTP 200. Railway confirmed all four signature file/public-signing proxy flags and all scanner variables remain absent, while GraphQL still has no AWS variables. No upload, storage, scanner, worker, provider call, or production data mutation ran.

## Implemented signature evidence-retention boundary

All product deletion paths now preserve non-draft signature evidence. Both GraphQL mutations and the retained rollback service reject source removal and document deletion after draft state; an unused retained helper that could clear a non-draft source was removed. The retained organization-delete transaction locks the organization and every signature row, returns `SIGNATURE_EVIDENCE_RETAINED` with HTTP 409 when any document has left draft, and cannot race a lifecycle transition into an evidence-erasing cascade.

A draft-only organization can still be deleted. Before its rows cascade, the transaction snapshots every active source, signed artifact, immutable document version, and template locator into `signature_file_deletion_jobs`. Migration 045 deliberately removes that queue's organization foreign key while retaining the immutable organization-ID snapshot, so cleanup authority survives deletion of the organization row. The cleanup worker now also treats `signed_file_url` as a live reference.

Retained unit tests pass 392/392, Nest unit tests pass 422/422, and the Nest build passes. Fresh PostgreSQL passes the focused signature and organization contracts 41/41 plus the complete Nest integration gate 225/225. These tests prove non-draft deletion denial with source/hash/version/audit preservation and zero cleanup intents, draft-only cascade cleanup receipt survival, and the matching GraphQL conflict behavior. The product currently retains non-draft evidence indefinitely; defining a time-based purge, portable evidence export, and tamper-verification scheme remains a product/legal decision rather than an implicit delete cascade.

Commit `5c1533c9` deployed through retained backend `e76180e9-7768-44bf-b3a9-0572f272b806`. Railway completed the pre-deploy migration and the migration-gated release became healthy; itemize.cloud, retained API health, and the live same-origin GraphQL probe returned HTTP 200. The GraphQL service required no deployment for this retained deletion-boundary change. No organization deletion, cleanup worker, file operation, or production data mutation was run during verification.

## Implemented single-owner signature worker scheduling

The retained scheduler now has two explicit operational controls. `LEGACY_SIGNATURE_REMINDER_JOBS_ENABLED=false` disables its historical reminder cron, while `SIGNATURE_FILE_CLEANUP_ENABLED=true` enables the durable file-deletion worker on the validated `SIGNATURE_FILE_CLEANUP_CRON` schedule. Cleanup rejects an invalid cron at startup, prevents overlapping runs, and keeps its existing lease, retry, reference-preservation, and locator-allowlist semantics.

NestJS now has an independently default-off `SignatureJobsSchedulerService`. `SIGNATURE_JOBS_SCHEDULER_ENABLED=true` makes it the single owner of completion and delivery work at `SIGNATURE_JOBS_SCHEDULER_INTERVAL_MS`; every cycle runs completion before delivery so generated evidence and the resulting notices retain their intended order. The service runs once on startup, prevents overlaps, uses the existing leased/fenced job services, and stops its timer during application shutdown. The legacy reminder disable is deliberately separate so deployment can transfer ownership without a double-run window.

Focused scheduler tests pass 9/9 in each runtime. Retained unit tests pass 396/396, Nest unit tests pass 425/425, the Nest build passes, and the canonical fresh harness passes both stacks from a disposable PostgreSQL database, including all 28 Nest integration suites and 225/225 assertions. The implementation defaults to no new worker ownership until the coordinated production flags are set.

The production infrastructure prerequisite is complete. A private `clamav/clamav:stable` service has no public domain; both deployed runtimes pass clean, EICAR, unavailable, and timeout scanner canaries with required mode enabled. Existing private-S3 credentials were copied to Nest without disclosure; both runtimes pass read-only access, and Nest created, ranged, deleted, and confirmed absence of one isolated canary object. `SIGNATURE_FILE_READS_NESTJS_ENABLED=true` and `SIGNATURE_FILE_UPLOADS_NESTJS_ENABLED=true` route the unchanged authenticated HTTP paths to Nest, and an authenticated existing-document preview passed after the read switch.

Commit `b8cfab97` first deployed default-off through retained backend `423d0a03-1bf3-43d9-8135-e39c177ff43a` and GraphQL `76cb0b47-aefc-48f9-a2ac-c7843bee47e7`. With delivery, completion, cleanup, and due-reminder queues all at zero, retained deployment `476a858c-d822-4297-a5cf-de671f368833` disabled legacy reminders and initialized durable cleanup every five minutes. GraphQL deployment `4f033ed4-29e5-42e5-8180-91dc1b0e6e13` then became the sole completion/delivery owner at 60 seconds. Startup logs proved each owner and subsequent queue and error scans remained empty.

Retained deployments `cf4f8231-60ae-473f-980e-b49af8bbaba6` and `98c63370-7ee0-48f0-ab1a-9f97103166be` enabled public reads and mutations independently. Unknown-capability session/file/download, decline, and structurally valid submit probes returned non-enumerating 404 responses; the intentionally unavailable verification endpoint returned 410. Frontend deployment `e3930e4e-3c97-44ab-81a3-d1cfc888d5df` compiled `VITE_SIGNATURE_DELIVERY_GRAPHQL=true` and `VITE_SIGNATURE_FILE_MUTATIONS_GRAPHQL=true`. Its bundle contains the two GraphQL mutation operations; an authenticated Documents reload rendered the existing sent document with no console error while Nest logged successful zero-error `SignatureDocumentReads`. No resend, cancellation, upload, deletion, valid capability, provider call, or user-data mutation was invoked during this final routing gate.
