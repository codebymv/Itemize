# ADR: Client-side zero-knowledge vault encryption

**Status:** Implementation in progress (dual-read). v1 server-GCM remains until vaults enroll to v2.  
**Date:** 2026-08-18  
**Supersedes:** encryption paragraphs in `API/contracts/vaults-graphql-cutover.md` (password is a read gate; `VAULT_ENCRYPTION_KEY` decrypts on the server) and vault sharing in `API/contracts/sharing-graphql-cutover.md` (bearer link returns decrypted values). Ownership, CSRF, `NOT_FOUND` concealment, and pagination in those contracts stay.

This is the implementation shape for a later PR. Do not invent algorithms mid-implementation.

## Context

Itemize vaults are human-facing secret cards (.env import, API keys, notes, optional share link). That product matches 1Password / Bitwarden, not AWS Secrets Manager / Infisical Cloud / Doppler.

Professional standard for that shape:

- The vendor cannot decrypt stored secrets.
- The vault password never leaves the device.
- Password change rewraps a vault key; it does not re-encrypt every item.
- Anonymous share links encrypt a **copy** on the sender device; the decryption key lives in the URL fragment and is never sent to HTTP.

Itemize today is the inverse: `backend-v2/src/vaults/vault.crypto.ts` uses one deployment `VAULT_ENCRYPTION_KEY`; GraphQL `WorkspaceVaultItem.value` is plaintext; `GET /api/shared/vault/:token` decrypts for anyone with the UUID. Session hygiene (write-gate on locked vaults, unlock rate limit, auto-lock, clipboard clear) does not change that threat model.

## Constraint inventory

### Stays

| Surface | Why it is compatible |
| --- | --- |
| Personal `user_id` ownership, foreign IDs as `NOT_FOUND` | AuthZ is orthogonal to crypto |
| CSRF on mutations | Same |
| GraphQL observability without variables | Same; ZKE also stops putting the password in variables |
| Canvas drag/resize, title, category, color, dimensions | Metadata, not secret payload |
| List/search `title ILIKE` only | Titles remain plaintext; item labels will no longer be searchable (they never were on the server) |
| Item types `key_value` / `secure_note`, `order_index`, 1–500 bulk import | Structural fields |
| Unlock UI, auto-lock, clipboard TTL | Still required after ZKE; plaintext lives only in a worker + short-lived card session |
| Share enable/disable as owner-scoped GraphQL; public read remains HTTP | Protocol split stays; **payload** of the public read changes |
| Share privacy headers (`no-store`, `no-referrer`, `noindex`) | Stay |
| Fail-closed public read (no partial leak) | Stay, applied to ciphertext completeness instead of server decrypt |

### Breaks (must change)

| Surface | Today | ZKE |
| --- | --- | --- |
| `CreateWorkspaceVaultItemInput.value` / GraphQL `value` | Plaintext on the wire | Ciphertext + IV only |
| `workspaceVault(masterPassword:)` | Server bcrypt then decrypt | Remove argument; client fetches blobs and decrypts locally |
| `master_password_hash` bcrypt cost 12 | Server verifies unlock | Delete after migration; failed local AES-GCM is the proof |
| `encryption_salt` unused leftover | Generated, unused | Becomes Argon2id salt + stored KDF params |
| `VAULT_ENCRYPTION_KEY` | Decrypts every tenant | Must become useless after migration |
| Unlocked vaults with no password | Server can always decrypt | Enrollment requires a vault password (or generated password shown once) |
| Public vault JSON `items[].value` | Server-decrypted | Encrypted snapshot; key in `#fragment` |
| `confirmDecryptedSharing` | Honest because server decrypts | Replace with confirm that the **fragment is the secret** |
| Integration tests asserting plaintext `value` after mutations | `vaults.integration-spec.ts` | Ciphertext-only assertions; decrypt only in frontend unit tests |
| Frontend `VaultItem.value` comment “never stored” | False: React state holds all values after unlock | Worker holds keys; UI gets values only while unlocked |

## Algorithms (locked)

No homemade primitives. Parameters stored on the vault row so they can be raised later without a format break.

| Role | Choice | Rationale |
| --- | --- | --- |
| Vault-password KDF | **Argon2id** `m=65536` (64 MiB), `t=3`, `p=1`, 32-byte output | Password Hashing Competition winner; OWASP minimum is 19 MiB / t=2 — we take the stronger password-manager practice that still targets &lt;1s on a laptop. Store `m,t,p` so low-memory clients can be versioned later. |
| KDF library | **`hash-wasm` in a Web Worker** | Argon2id is not in Web Crypto. Worker keeps the password off the React/DOM thread. |
| Key split | **HKDF-SHA-256** (Web Crypto), info `itemize/vault-unlock` | Derive the wrap key from the Argon2id master key. Do **not** encrypt items with the KDF output directly. |
| Vault encryption key (VEK) | 32 random bytes (`getRandomValues`) | Password change = rewrap VEK only (O(1)). |
| Item encryption | **AES-256-GCM**, **96-bit IV** per item (Web Crypto default) | AEAD. Current server path uses 16-byte IVs; v2 items use 12-byte IVs. Never reuse an IV with the same key. |
| VEK wrap | AES-256-GCM of the VEK under the unlock key | Same primitive; distinct IV. |
| Share secret | 16 random bytes, URL-safe base64 in the fragment | Matches Bitwarden Send / 1Password share-link: key never in the HTTP request. Stretch with HKDF-SHA-256 info `itemize/vault-share` before AES-GCM. |
| Capability token at rest | SHA-256 of the path token | Already required by the sharing contract; current schema still stores raw UUID. |
| Recovery | Second AES-GCM wrap of the VEK under a 128-bit recovery secret | Emergency kit. Email “reset password” cannot unwrap secrets. |

Reject: PBKDF2 as the long-term vault KDF (acceptable only as a FIPS fallback we do not need); encrypting items directly with the password; wrapping the VEK with the **account** login (password reset would either destroy the vault or require a server-held wrap).

## Key hierarchy

```
vaultPassword (never on the wire)
    -> Argon2id(salt, m, t, p) -> masterKey
        -> HKDF(info=itemize/vault-unlock) -> unlockKey
            -> AES-GCM unwrap -> VEK
                -> AES-GCM per item payload { label, value }
```

Optional recovery:

```
recoverySecret (printed once)
    -> HKDF(info=itemize/vault-recovery) -> recoveryWrapKey
        -> AES-GCM unwrap -> same VEK
```

Account session stays as it is. It authorizes “this user may read/write **ciphertext** for vault N”. It does not authorize plaintext.

Wrong password: `unlockKey` fails GCM unwrap of the VEK. The server is not asked to bcrypt-compare. Fetching blobs still requires the owner session.

## What the server may store

**Allowed:** vault metadata (title, category, color, position, size), `crypto_version`, Argon2id salt + params, `wrapped_vek`, optional `wrapped_vek_recovery`, item `item_type`, `order_index`, item ciphertext + IV, share snapshot ciphertext, hashed share token, expiry / remaining views.

**Forbidden:** plaintext `value`, plaintext item `label`, vault password, master key, VEK, unlock key, share fragment key.

`item_type` and `order_index` stay plaintext so a locked card can still say “3 key-values, 1 note” without decrypting.

## GraphQL shape (v2)

Remove `masterPassword` from `workspaceVault` and from item mutations.

```
type WorkspaceVault {
  cryptoVersion: Int!          # 1 = legacy server GCM, 2 = ZKE
  kdf: VaultKdfParams          # null on v1
  wrappedVek: String           # base64; null until enrolled
  wrappedVekRecovery: String   # base64; null if user declined kit (discouraged)
  items: [WorkspaceVaultItem!]!
}

type VaultKdfParams {
  algorithm: String!  # "argon2id"
  salt: String!
  memoryKiB: Int!
  iterations: Int!
  parallelism: Int!
}

type WorkspaceVaultItem {
  id: Int!
  vaultId: Int!
  itemType: String!
  orderIndex: Int!
  ciphertext: String!   # AES-GCM(JSON { label, value })
  iv: String!           # 12-byte IV, base64
  cryptoVersion: Int!
}

input CreateWorkspaceVaultItemInput {
  itemType: String!
  ciphertext: String!
  iv: String!
}
```

List queries continue to return empty `items` plus `itemCount`. Detail returns blobs; the card decrypts in the worker after the user types the vault password.

## Sharing

Replace server-decrypt bearer links.

1. Owner unlocks locally, client encrypts a **snapshot** (copy, not live vault) with a random share secret.
2. Upload snapshot ciphertext via GraphQL. Server stores ciphertext + hashed path token + optional `expires_at` / `max_views`.
3. URL: `https://itemize.cloud/shared/vault/{token}#{shareSecret}`.
4. Public GET returns ciphertext only (same no-store headers). The page reads `location.hash` in JS, decrypts in a worker, never sends the fragment.
5. Revoke deletes the snapshot. Re-enable rotates the token. Changing the vault password does not have to rewrite snapshots (they are copies); UX should still warn that existing links remain valid until expiry or revoke.

`confirmDecryptedSharing` is replaced by a confirmation that **anyone with the full URL, including the fragment, can read the snapshot** and that Itemize cannot recover a link copied without the fragment.

Locked vs unlocked is no longer the sharing gate. Sharing requires a local unlock so the client can encrypt the snapshot.

## Enrollment and vaults with no password

Every v2 vault has a vault password. Creating a vault without one is rejected.

Legacy unlocked vaults: on first open after ship, the UI blocks items until the owner sets a password (or accepts a generated 20+ character password) and saves the emergency kit. Then the client re-encrypts.

Do not wrap VEK with the Itemize account password. Account recovery must not resurrect vault plaintext.

## Recovery kit

On enrollment and on password change, generate a 128-bit recovery secret, wrap the VEK, store `wrapped_vek_recovery`, and show a printable emergency kit (vault id + recovery secret + created-at). Restoring: Argon2id is not used; HKDF the recovery secret and unwrap VEK, then the user sets a new vault password (rewrap).

If the user declines the kit, they can still use the vault, but copy must state **there is no forgot-password**. Default the checkbox on.

## Migration

1. Add `crypto_version` (default 1) to `vaults` and `vault_items`. Add `wrapped_vek`, `kdf_*` columns. Keep `encrypted_value` / `iv` for v1 bytes.
2. Dual-read: v1 items decrypt **once** on the client during enrollment. The client is the only place that may call the legacy server-decrypt **enrollment mutation** (`migrateWorkspaceVaultToV2`), which:
   - requires owner session + current bcrypt password if the vault is locked, or just session if unlocked
   - returns **one-time plaintext items** (or client already has them from the existing get)
   - accepts v2 blobs + wrapped VEK in the same transaction
   - sets `crypto_version = 2` and nulls `master_password_hash`
3. Prefer: unlocked-for-session card already has plaintext in memory from the old API; push ciphertext up without a new “give me plaintext” endpoint when possible. Locked vaults still need one authenticated decrypt-for-migration read.
4. Fail closed if any item cannot be re-encrypted; leave `crypto_version = 1`.
5. After 100% enrollment (or a forced cutoff), delete `decryptVaultValue` from the hot path and rotate `VAULT_ENCRYPTION_KEY` out of production. A stolen old key must not unwrap v2 rows.

## Where crypto runs

- Web Worker: Argon2id, HKDF, wrap/unwrap VEK, item encrypt/decrypt, share encrypt/decrypt.
- Main thread / React: vault password input, masked UI, clipboard with 30s clear, auto-lock (already shipped).
- Never persist VEK or password in `localStorage`. Memory only for the card session.

## Tests that must change

- `backend-v2/test/integration/vaults.integration-spec.ts` — stop asserting mutation `value: 'secret-value'`; assert ciphertext present and GraphQL schema has no plaintext field; public share returns no `value`.
- `backend-v2/src/vaults/vault.service.spec.ts` — server encrypt-on-write tests become “stores opaque blobs, rejects plaintext fields”.
- `frontend/src/services/workspaceVaultGraphql.test.ts` — variables contain `ciphertext`/`iv`, never `value`.
- New: frontend worker tests for wrap/unwrap, wrong password, share fragment decrypt, migration round-trip of a fixture v1 item.

Threat cases (must pass):

| Attack | Expected |
| --- | --- |
| Stolen Postgres | Titles and ciphertext; no secrets |
| Stolen `VAULT_ENCRYPTION_KEY` after cutoff | Cannot unwrap v2 |
| Stolen session cookie | Can fetch blobs; cannot decrypt without vault password |
| Share URL without `#fragment` | Useless ciphertext |
| Share URL with fragment | Reads **snapshot only**, not the live vault |

## Implementation sequence (later PR, not this document)

1. Schema + GraphQL types for v2 blobs (keep v1 running).
2. Worker crypto module + unit tests.
3. Card unlock/decrypt/encrypt path; remove `masterPassword` from queries.
4. Enrollment / migration mutation.
5. Share snapshot + fragment URLs; hash tokens at rest.
6. Turn off v1 decrypt; drop `VAULT_ENCRYPTION_KEY`.

## References

- OWASP Password Storage Cheat Sheet — Argon2id (2026): minimum 19 MiB / t=2; we select 64 MiB / t=3.
- [1Password share-items security](https://support.1password.com/share-items-security/) — copy encrypted on device; share secret not sent to the server.
- [Bitwarden Send encryption](https://bitwarden.com/help/send-encryption/) — 128-bit secret, HKDF stretch, key in URL fragment.
- NIST SP 800-38D — AES-GCM 96-bit IV.
- Web Crypto API — AES-GCM and HKDF; Argon2id via WASM (`hash-wasm`).
