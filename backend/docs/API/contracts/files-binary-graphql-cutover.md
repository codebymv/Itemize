# File, binary, and bulk-transfer cutover contract

**Status:** Retained HTTP targets implemented for contact transfer, invoice PDF, invoice-logo upload, authenticated signature files, and public capability-authorized signature files

**Evidence date:** 2026-07-23

## Decision

GraphQL owns file metadata, document lifecycle, logo deletion, and upload-intent orchestration. It does not carry multipart bodies, PDF streams, generated invoice PDFs, public logo bytes, or CSV transfers. Those protocols remain HTTP endpoints behind the same NestJS authentication, tenancy, capability, rate-limit, and observability services as GraphQL. `ContactTransfersModule` owns the two retained CSV routes, `InvoicesModule` owns retained invoice-PDF delivery, `InvoiceLogoUploadsModule` owns the two retained invoice-logo uploads, and `SignatureFilesModule` owns the two authenticated signature uploads plus three private streams/downloads. The legacy origin proxies each boundary only behind an independently scoped default-off rollback flag.

Never persist or return a permanent public URL for a private signature document. A GraphQL field may return metadata or an audience-bound, short-lived delivery capability; it must not expose a raw local path, bucket key, or unrestricted object URL.

## Frozen surface

| Surface | Protocol and authorization | Frozen boundary |
| --- | --- | --- |
| Signature source/template upload | Authenticated multipart HTTP plus organization membership and signature access | One `file`, 5 MiB maximum, actual `%PDF-` prefix, forced `.pdf` key, tenant-owned draft/template checked before storage metadata is committed |
| Signature draft-PDF removal | CSRF-protected GraphQL metadata mutation | Tenant-owned draft row lock; idempotent metadata clear and audit; former exact storage locator committed to a leased cleanup job |
| Signature template/source view | Authenticated HTTP PDF stream | Tenant lookup first; private/no-store, `nosniff`, sandbox CSP, safe inline filename; only the private signature local root or exact configured S3 bucket and `signatures/` prefix may be read |
| Completed signature download | Authenticated HTTP attachment | Tenant-owned completed artifact only; safe filename and the same private delivery/storage allowlist |
| Public signing PDF | Rate-limited signing capability over HTTP | Active, unexpired recipient/document capability first; private/no-store stream or attachment; no arbitrary URL proxy and no permanent object URL |
| Invoice PDF | Cookie-authenticated NestJS HTTP attachment plus selected-organization membership | Tenant-scoped invoice/items/business/settings snapshot; shared renderer; validated `%PDF-` output; safe filename, exact length, private/no-store, `nosniff`, and sandbox CSP; same-origin default-off proxy preserves Express rollback |
| Business/settings logos | Authenticated multipart HTTP for uploads; CSRF-protected GraphQL for deletion; public HTTP for bytes | One image, 2 MiB maximum, PNG/JPEG/GIF/WebP magic bytes, safe server-selected extension/name; JSON metadata writes cannot select `logo_url`; deletion atomically clears metadata and enqueues exact server-owned cleanup |

The NestJS invoice-logo receiver bounds multipart files, fields, and parts before examining one in-memory upload. It requires complete container markers in addition to the claimed MIME type, generates an unguessable server-owned filename, and uses configured shared S3 in production; the retained local public-logo directory is development/test-only. Replacement stores the new object first, then locks the tenant-owned metadata row and atomically enqueues the prior URL for leased cleanup. Database failure triggers compensating deletion of the new object. The legacy-origin proxy buffers only a bounded multipart body and forwards only the host cookie, organization, CSRF token, request ID, and exact content type. `INVOICE_LOGO_UPLOADS_NESTJS_ENABLED` is default-off.

The NestJS signature receiver applies the same split to one PDF plus one resource-ID field. It caps the file at 5 MiB, bounds files/fields/parts and the legacy proxy body, verifies MIME, `%PDF-` bytes, full structural parsing, encryption policy, page count, and page dimensions, generates an unguessable `.pdf` locator, and fails closed in production without shared S3. Tenant ownership is checked before storage and again under a database row lock. Document uploads require `draft`, preserve any unrepresented active source, and append the new source at the next monotonic immutable version; a versioned source is never queued merely because it is superseded. Template replacement and template deletion enqueue their former locator. A lost row-lock race or database failure compensates by deleting the newly stored object. `SIGNATURE_FILE_UPLOADS_NESTJS_ENABLED` controls only the two uploads, while `SIGNATURE_FILE_READS_NESTJS_ENABLED` controls only the three authenticated private reads; both are default-off.

`PublicSigningModule` reuses the same exact storage provider for capability-authorized inline and attachment streams. It returns no raw locator, arbitrary URL, cookie, or organization-selected authority. Session/file reads and submit/decline writes have independent default-off legacy-origin proxies; binary responses are capped at 25 MiB and JSON at 2 MiB. The last signer queues a leased completion job that parses the source PDF, renders signer-owned values plus a completion certificate, stores and hashes the result, and fences the document transition. A stale fence removes the generated object.
| Contact export | Authenticated HTTP CSV attachment | Organization filters, deterministic newest-first order, 50,000-row rejection boundary, quoted cells, formula neutralization, private/no-store and `nosniff` |
| Contact import | Authenticated, CSRF-protected HTTP JSON bulk request despite the legacy `/csv` name | 1 MiB body, non-empty object array, 10,000 rows, 20 columns, strict field validation and duplicate policy, at most 100 returned row errors with total/truncation metadata, organization lock, atomic plan-limit enforcement, and a 30-second query/upstream timeout |

## Storage namespaces

- `uploads/logos` is the only anonymously static local namespace. It uses public CORS/CORP behavior and does not expose a directory index.
- `uploads/signatures` is never mounted as static content. Reads must pass the authenticated or capability-bearing route and resolve under that exact directory.
- S3 signature reads accept only HTTPS URLs whose host exactly matches the configured bucket's Amazon S3 virtual-host form and whose key starts with `signatures/`. Lookalike hosts, other prefixes, and arbitrary HTTP(S) URLs fail closed.
- Signature objects are private. Logo objects may be public, but should use a distinct prefix and ideally a distinct bucket/policy so a policy change cannot expose signature artifacts.
- Original client filenames and MIME declarations are untrusted. Storage names, response names, extensions, and content types are server controlled.

## Upload and lifecycle rules

The server validates authorization and the owning draft/template before accepting the stored reference. An invalid, foreign, or missing owner leaves no local temporary upload behind. Replacing or deleting a file must validate the old key against the same namespace before deleting it.

Database transactions cannot atomically commit object-store side effects. The NestJS target must use a staged object followed by a locked metadata commit and idempotent finalize/cleanup work. Failed commits, abandoned upload intents, replaced objects, and deleted drafts require a retryable garbage-collection path. Legal source/signed artifacts attached to sent or completed documents are immutable and follow the evidence-retention policy.

Invoice-logo removal now follows that split boundary. Migration `037_invoice_logo_deletion_jobs` commits the tenant, scope, owner ID, and exact former URL with the metadata clear. Its leased one-shot worker preserves URLs still referenced by another tenant row and allows the terminal receipt to be requeued when the final reference is later removed. It accepts only a safe filename under the local public logo directory or an HTTPS object in the configured bucket's exact S3 host and `logos/` prefix. Missing local objects converge on success; provider errors retry with bounded backoff; malformed, foreign, or unsupported URLs dead-letter without an outbound request or filesystem traversal.

Signature file lifecycle uses the same durable split. Migration `043_signature_file_deletion_jobs` records the tenant, optional document snapshot, and former locator in the metadata transaction. The worker preserves any locator still referenced by a document, template, or immutable document version, accepts only a traversal-safe path below the private signature root or the exact configured S3 host and `signatures/` prefix, treats a missing local object as success, retries transient errors, and dead-letters unowned locators without egress. Draft PDF removal and whole-draft deletion enqueue every distinct active and historical source before clearing version rows; template replacement/deletion enqueue their source. `VITE_SIGNATURE_FILE_MUTATIONS_GRAPHQL`, both retained-HTTP proxy flags, and worker scheduling remain default-off until production rehearsal.

Persist at least byte length, normalized media type, SHA-256, storage key, uploader, organization, creation time, and lifecycle state. Log stable object/document IDs, never capabilities, raw storage URLs, or file contents.

## Response rules

- Private responses set `Cache-Control: private, no-store`, `Content-Type: application/pdf`, `X-Content-Type-Options: nosniff`, a sandbox CSP, and a sanitized `Content-Disposition` filename.
- Missing, foreign, disallowed, or unreadable objects return the route's non-enumerating not-found result. The service never fetches an arbitrary database URL.
- Local delivery may use framework range handling. The S3 proxy currently does not implement `Range`; byte-range and conditional-request behavior must be made consistent before production PDF-viewer cutover.
- Public logo responses are deliberately cacheable public assets; private signature and export responses are not.
- Size limits apply before expensive parsing or database work. Transport/body limits must align with the endpoint-specific limits.

## CSV safety

CSV export quotes every data cell, doubles embedded quotes, and prefixes values whose first meaningful character is `=`, `+`, `-`, or `@` so spreadsheet clients do not execute formulas. The header row is server controlled.

The import route does not parse an uploaded CSV file. Its compatibility contract is a JSON array of mapped contact objects. The browser parser accepts CRLF, escaped quotes, quoted commas/newlines, BOM, and documented header aliases, then enforces the same 1 MiB, 10,000-row, and 20-column limits before sending JSON. Malformed rows, unclosed quotes, duplicate mapped headers, and rows wider than the header fail before transport. A future server-side file upload must be a separately versioned operation with explicit encoding, delimiter, cancellation, and asynchronous-job semantics.

Fresh-PostgreSQL tests prove authentication, membership and CSRF denial; tenant/status/tag export filtering; deterministic quoting and formula neutralization; strict row validation; both duplicate modes including concurrent imports; atomic plan-limit enforcement; bounded body/row/column/error behavior; and transactional contact, workflow-trigger, and activity writes. The 2026-07-17 staging gate enabled the two-route proxy, wrote and exported data through NestJS, then removed only the flag and read that same data plus a new legacy import through Express without repair. Cleanup left no fixture rows and production was untouched.

Invoice-PDF PostgreSQL coverage proves cookie authentication, malformed identity handling, selected-organization concealment, ordered tenant snapshot construction, exact PDF bytes and hardened headers, renderer unavailability, and invalid-output failure. Signature PostgreSQL coverage proves document/template upload, monotonic immutable replacement history without premature cleanup, authenticated and capability-authorized inline/attachment delivery, locator secrecy, foreign-tenant concealment, CSRF and full-parser spoof rejection, completed-artifact readiness, durable signed-PDF completion, all-version draft cleanup, and template-delete cleanup. Focused proxy coverage proves default-off Express fallback, exact path construction, allowlisted request/response headers, bounded multipart/JSON/PDF forwarding, timeout/upstream failure closure, and rejection of unsafe upstream targets. Browser consumers keep the stable same-origin URLs across transports.

## Required cutover gates

- MIME spoof, oversize, malformed PDF/image, unsafe filename, traversal, S3-host lookalike, arbitrary remote URL, missing object, and foreign-tenant denial tests
- Authenticated, public-capability, inline, attachment, cache/header, reconnect/viewer, and browser download tests
- Replacement, rollback, abandoned-stage, retry, deletion, immutable-evidence, and garbage-collection tests against the production storage provider
- Keep the completed CSV formula, quote/newline, malformed-input, byte/row/column/error-limit, duplicate-mode, plan-limit race, tenant-denial, side-effect, and rollback scenarios in the fresh and frontend gates
- Multi-instance storage behavior and storage-provider outage/timeout/backpressure tests

## Open blockers

The PDF receiver rejects malformed/encrypted input, enforces 1-200 pages and 14,400-point page dimensions, and stores S3 objects privately with AES-256 server-side encryption, but this is not a complete file-safety verdict. Before cutover, add malware scanning or quarantine and explicit decompression/resource-complexity limits. Signer-provided PNG/JPEG values already receive structural container and dimension checks. Also resolve S3 byte ranges, multi-instance local-storage removal or shared-volume policy, abandoned staged-object cleanup, and evidence retention.

These are cutover blockers for the new file service, not reasons to force binary data through GraphQL.
