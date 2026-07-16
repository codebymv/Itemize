# File, binary, and bulk-transfer cutover contract

**Status:** Characterized legacy boundary; retained HTTP target

**Evidence date:** 2026-07-15

## Decision

GraphQL owns file metadata, document lifecycle, logo deletion, and upload-intent orchestration. It does not carry multipart bodies, PDF streams, generated invoice PDFs, public logo bytes, or large CSV transfers. Those protocols remain HTTP endpoints behind the same NestJS authentication, tenancy, capability, rate-limit, and observability services as GraphQL.

Never persist or return a permanent public URL for a private signature document. A GraphQL field may return metadata or an audience-bound, short-lived delivery capability; it must not expose a raw local path, bucket key, or unrestricted object URL.

## Frozen surface

| Surface | Protocol and authorization | Frozen boundary |
| --- | --- | --- |
| Signature source/template upload | Authenticated multipart HTTP plus organization membership and signature access | One `file`, 5 MiB maximum, actual `%PDF-` prefix, forced `.pdf` key, tenant-owned draft/template checked before storage metadata is committed |
| Signature template/source view | Authenticated HTTP PDF stream | Tenant lookup first; private/no-store, `nosniff`, sandbox CSP, safe inline filename; only the private signature local root or exact configured S3 bucket and `signatures/` prefix may be read |
| Completed signature download | Authenticated HTTP attachment | Tenant-owned completed artifact only; safe filename and the same private delivery/storage allowlist |
| Public signing PDF | Rate-limited signing capability over HTTP | Active, unexpired recipient/document capability first; private/no-store stream or attachment; no arbitrary URL proxy and no permanent object URL |
| Invoice PDF | Authenticated HTTP binary response | Organization-owned invoice; preserve generation semantics and attachment headers outside GraphQL |
| Business/settings logos | Authenticated multipart HTTP for writes; public HTTP for bytes | One image, 2 MiB maximum, PNG/JPEG/GIF/WebP magic bytes, safe server-selected extension/name; JSON metadata writes cannot select `logo_url` |
| Contact export | Authenticated HTTP CSV attachment | Organization filters, deterministic newest-first order, 50,000-row rejection boundary, quoted cells, formula neutralization, private/no-store and `nosniff` |
| Contact import | Authenticated HTTP JSON bulk request despite the legacy `/csv` name | Non-empty object array, strict boolean duplicate policy, 10,000 rows maximum, 500-row insert batches, organization lock and plan-limit enforcement |

## Storage namespaces

- `uploads/logos` is the only anonymously static local namespace. It uses public CORS/CORP behavior and does not expose a directory index.
- `uploads/signatures` is never mounted as static content. Reads must pass the authenticated or capability-bearing route and resolve under that exact directory.
- S3 signature reads accept only HTTPS URLs whose host exactly matches the configured bucket's Amazon S3 virtual-host form and whose key starts with `signatures/`. Lookalike hosts, other prefixes, and arbitrary HTTP(S) URLs fail closed.
- Signature objects are private. Logo objects may be public, but should use a distinct prefix and ideally a distinct bucket/policy so a policy change cannot expose signature artifacts.
- Original client filenames and MIME declarations are untrusted. Storage names, response names, extensions, and content types are server controlled.

## Upload and lifecycle rules

The server validates authorization and the owning draft/template before accepting the stored reference. An invalid, foreign, or missing owner leaves no local temporary upload behind. Replacing or deleting a file must validate the old key against the same namespace before deleting it.

Database transactions cannot atomically commit object-store side effects. The NestJS target must use a staged object followed by a locked metadata commit and idempotent finalize/cleanup work. Failed commits, abandoned upload intents, replaced objects, and deleted drafts require a retryable garbage-collection path. Legal source/signed artifacts attached to sent or completed documents are immutable and follow the evidence-retention policy.

Persist at least byte length, normalized media type, SHA-256, storage key, uploader, organization, creation time, and lifecycle state. Log stable object/document IDs, never capabilities, raw storage URLs, or file contents.

## Response rules

- Private responses set `Cache-Control: private, no-store`, `Content-Type: application/pdf`, `X-Content-Type-Options: nosniff`, a sandbox CSP, and a sanitized `Content-Disposition` filename.
- Missing, foreign, disallowed, or unreadable objects return the route's non-enumerating not-found result. The service never fetches an arbitrary database URL.
- Local delivery may use framework range handling. The S3 proxy currently does not implement `Range`; byte-range and conditional-request behavior must be made consistent before production PDF-viewer cutover.
- Public logo responses are deliberately cacheable public assets; private signature and export responses are not.
- Size limits apply before expensive parsing or database work. Transport/body limits must align with the endpoint-specific limits.

## CSV safety

CSV export quotes every data cell, doubles embedded quotes, and prefixes values whose first meaningful character is `=`, `+`, `-`, or `@` so spreadsheet clients do not execute formulas. The header row is server controlled.

The current import route does not parse an uploaded CSV file. Its compatibility contract is a JSON array of mapped contact objects. A future real CSV upload must be a separately versioned operation with explicit encoding, delimiter, header mapping, per-field length, row-error, partial-success, cancellation, and asynchronous-job semantics.

## Required cutover gates

- MIME spoof, oversize, malformed PDF/image, unsafe filename, traversal, S3-host lookalike, arbitrary remote URL, missing object, and foreign-tenant denial tests
- Authenticated, public-capability, inline, attachment, cache/header, reconnect/viewer, and browser download tests
- Replacement, rollback, abandoned-stage, retry, deletion, immutable-evidence, and garbage-collection tests against the production storage provider
- CSV formula, quote/newline, Unicode, row-limit, duplicate, plan-limit race, and cross-organization tests
- Multi-instance storage behavior and storage-provider outage/timeout/backpressure tests

## Open blockers

The current magic-byte check is necessary but not a full file-safety verdict. Before cutover, add structural PDF/image decoding, PDF page/dimension/encryption limits, malware scanning or quarantine, decompression/resource limits, and an explicit encrypted-at-rest/private-bucket policy. Also resolve S3 byte ranges, multi-instance local-storage removal or shared-volume policy, staged-object cleanup, evidence retention, and short-lived delivery-capability revocation.

These are cutover blockers for the new file service, not reasons to force binary data through GraphQL.
