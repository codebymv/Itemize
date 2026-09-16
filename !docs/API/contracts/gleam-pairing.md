# Organization pairing

## Customer flow

1. In Itemize **Settings → Integrations → Gleam voice follow-ups**, an accepted organization owner/admin chooses an eligible task assignee and due interval, then creates a pairing code. The organization name is displayed. Codes are 256-bit browser-generated random values valid for ten minutes; only their SHA-256 hash is stored by either service. The code is never placed in a URL or browser storage.
2. In Gleam **Settings → Integrations → Itemize** (`/app/settings?tab=integrations`), an accepted owner/admin pastes the code and approves the displayed Gleam organization. The backend generates a dedicated RSA key pair and persists the private key through the existing authenticated-encryption vault. Itemize verifies the source organization, current manager, public key, expiry, nonce and exact code hash through its configured Gleam peer origin.
3. Itemize displays the verified Gleam organization and saved task assignee/due interval. Its manager explicitly approves that pairing. Itemize rechecks source approval before activating the receiver grant. A code cannot be claimed by another connection.
4. The Gleam manager chooses **Finish connecting** after reviewing the verified Itemize organization name. Gleam signs a `connection:read` request; Itemize validates the pinned key and current target approval/entitlement. Only a matching active receiver response activates the local connection. New exports also require the separate delivery rollout flag.

The two products retain independent organizations, sessions, subscriptions and databases. Email addresses never determine organization pairing. Existing requests and queues are not retargeted or bulk-exported by connecting another organization.

## Retry, expiry and revocation

Connection attempts retain their original ID, key pair and code hash across lost-response retries. Browser forms freeze an uncertain request so retrying does not silently change its assignee or destination. Refreshing a page can discard an undisplayed code; create a new code in Itemize and start again if it cannot be recovered. Starting a new request cancels older pending attempts, preserving audit evidence.

Approvals and revocations are transactional, audited and idempotent. Itemize stores mutation receipts to reject reuse of an approval/revocation key for a different action. The temporary source-proof capability is encrypted with Itemize's configured application key ring and erased on final approval or cancellation. Pairing explicitly refuses the development JWT-derived encryption fallback.

Disconnecting in either product immediately stops that product from authorizing new work. A source disconnect does not retract an already committed Itemize task; an in-flight request can still finish. The UI explains that the other product's connection must also be disconnected to clear its local approval. Local status/revocation does not require access to Gleam's wrapping key or an active subscription. Unfinished and applied delivery evidence is retained.

## Deployment configuration

Apply Gleam migration `20260915110000_itemize_pairing` after the outbox migration and regenerate Prisma types. Apply Itemize migration `089_gleam_pairing` after receiver migration 088. Neither migration creates a live connection.

Gleam requires `ITEMIZE_PAIRING_ENABLED=true`, a deployment-controlled HTTPS `ITEMIZE_API_ORIGIN`, and the dedicated `ITEMIZE_WRAPPING_KEYS_JSON` / `ITEMIZE_ACTIVE_WRAPPING_KEY_ID` vault configuration. `ITEMIZE_HANDOFF_EXPORT_ENABLED` remains a separate switch controlling producer/worker execution.

Itemize requires `GLEAM_PAIRING_ENABLED=true`, a deployment-controlled HTTPS `GLEAM_API_ORIGIN`, and configured `CALENDAR_TOKEN_ENCRYPTION_KEYS` / `CALENDAR_TOKEN_ACTIVE_KEY_ID` for its existing application key ring. The peer-origin helper rejects credentials, paths, query strings and fragments, does not follow redirects, limits responses to 16 KiB, and applies a ten-second timeout. Customer input never selects either peer origin.

These settings remain disabled/unconfigured in real environments. No production migration, connection, export, commit or push was performed during implementation.

## Verification and remaining release work

PostgreSQL/HTTP suites cover actor and tenant checks, CSRF, code expiry, key and code binding, concurrent claims, approval replay, changed destinations, late approval after disconnect and unavailable credentials. UI tests cover explicit organization approval, frozen retries, permission controls and stale organization responses.

Itemize's optional `gleam-cross-service.integration-spec.ts` uses both real HTTP controller stacks and both disposable databases. Set `GLEAM_TEST_RUNTIME_ROOT` to an isolated Gleam checkout with compiled `backend/dist` and matching generated Prisma client, and `GLEAM_TEST_DATABASE_URL` to the guarded disposable Gleam database on loopback port 55439. Itemize uses its existing guarded `TEST_DATABASE_URL` harness. The suite routes only two synthetic HTTPS peer origins through local test HTTP handlers, provisions generated credentials and verifies pairing followed by one assigned task, a dropped response and receipt recovery without another handoff POST. It does not contact external services.

Human task completion/reopening now appears in Gleam through authenticated, versioned status reads; see ITEMIZE_TASK_STATUS.md. The cross-service suite also verifies completion, reopening, stale results, unavailable reads, revocation and deletion. Notification ownership and late-delivery coordination are now implemented. Audited manual delivery recovery is now implemented; exact navigation and deployment/pilot readiness remain outstanding. Keep customer rollout disabled until readiness is reviewed.


## Organization allowlists

Both backends require explicit local organization enrollment in addition to the
existing flags, plans, membership and approval checks. Set
`ITEMIZE_ALLOWED_ORGANIZATION_IDS` to comma-separated Gleam organization IDs and
`GLEAM_ALLOWED_ORGANIZATION_IDS` to comma-separated Itemize organization IDs.
Missing, empty or malformed lists deny all; wildcards are not supported. Deploy
both sides with flags off before enabling a pilot. The same ID must not be copied
between apps: each list uses its own database's organization IDs.

Gleam excludes non-enrolled organizations from producer export and all worker
claims. Removing enrollment pauses existing queued work without consuming
attempts or changing permanent notification ownership. New excluded handoffs
retain the ordinary Gleam fallback and are not exported retroactively. Itemize
rejects excluded pairing and authenticated integration requests. Settings status
and disconnect remain available to authorized managers outside the lists.
Environment changes require deployment and do not cancel in-flight requests;
disconnect is the revocation mechanism.
