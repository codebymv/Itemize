# Platform administrator MFA

Implementation prepared September 14, 2026. Production enrollment and enforcement have not been deployed or verified.

## Access model

Normal password/Google sign-in opens the workspace. Every platform-admin GraphQL read/mutation also requires the current database ADMIN role and a non-revoked session with an authenticator verification less than 30 minutes old. The admin UI withholds its child routes until the server confirms this status; the backend guard remains authoritative. There is no environment bypass or trusted-device exemption. Unknown transports fail closed in the admin guard.

New access/refresh cookies share a random server-side session ID. Refresh preserves that ID and does not renew MFA. Logout revokes the session. Password changes, platform-role changes and account-deletion scheduling/recovery revoke sessions through a database trigger. A cancelled deletion schedule after an email failure also requires sign-in again. Sign-in checks that its verified password hash has not changed before creating a session.

Old access tokens can finish their existing 15-minute ordinary-access lifetime unless invalidated by a security change; they cannot unlock administration. Old refresh tokens without a session ID require sign-in again. Expect a one-time sign-in transition for existing users. Rolling back to an image that lacks these checks would remove MFA enforcement; use a reviewed forward fix or an MFA-compatible rollback image.

## Setup and recovery

Enrollment/replacement requires primary confirmation within five minutes. Email users enter their current password. Google users provide a newly issued OAuth access token for the configured client, matching stored Google subject and verified email; tokens with less than 55 minutes remaining are rejected. This requires a new Google authorization credential, not proof that Google demanded a password or performed its own MFA. Real Google-provider confirmation remains a rollout journey to verify.

Setup secrets expire after ten minutes and belong to the initiating session. QR images are generated locally on the API. Confirmation activates the secret, invalidates other sessions and replaces recovery codes. Administration remains locked until a new authenticator code is accepted; the setup code cannot be reused.

TOTP uses otplib 13.5.0: six digits, 30-second periods, a 30-second tolerance and persisted time-step replay protection. Per-user database locking makes consumption atomic across concurrent instances. Security actions are limited to ten per 15-minute window, including failed and successful attempts; successful primary confirmation cannot reset the counter to bypass the limit.

Ten random 128-bit recovery codes are shown once and stored as SHA-256 hashes. Recovery requires fresh primary confirmation, consumes one code atomically, revokes other sessions and permits only authenticator replacement for ten minutes. A recovery grant does not authorize admin operations. Admins can replace an authenticator after fresh primary and authenticator verification; there is no self-service switch to disable required MFA. Security notifications use the existing branded transactional email renderer and sender, with its existing best-effort delivery behavior.

If all factors/codes are lost, keep admin access blocked. The operator must independently establish account ownership under the incident procedure and approve a scoped recovery. Record an audit event, revoke all sessions and clear the affected user's MFA setup/recovery records transactionally before requiring fresh sign-in and enrollment. Do not use a public email-only reset, a global bypass flag, or reclassifying the user's role as recovery. No emergency reset has been performed or certified by this implementation.

## Keys and deployment

Configure these API-only variables before rollout:

- `ADMIN_MFA_ENCRYPTION_KEYS`: JSON object mapping version IDs to independently generated 32-byte keys encoded as 64 hexadecimal characters.
- `ADMIN_MFA_ACTIVE_KEY_ID`: the version used for new secrets, present in that object.

Secrets use AES-256-GCM with user-bound authenticated data and a versioned envelope, following the existing application keyring convention with separate key material. No JWT/calendar/development fallback is allowed. Missing keys prevent enrollment/decryption; they do not take ordinary workspace access offline. Retain old key versions until affected secrets have been replaced or re-encrypted. Never put keys in the frontend, repository, logs, screenshots or incident notes.

1. Run release gates and fresh database integration. Migration 086 creates session/MFA/recovery/audit tables and the security-change trigger.
2. Provision the keyring and check it through the API environment contract. Keep worker settings unchanged.
3. Deploy an MFA-capable API and matching frontend in a coordinated window. Admin operations will be locked until enrollment/verification. Do not roll back the API to the previous MFA-unaware image.
4. The administrator personally scans the QR code, verifies the authenticator and saves recovery codes. Agents should not retain production secrets or recovery codes.
5. Verify a second-browser challenge, explicit lock, expiry, refresh behavior and controlled recovery. Confirm the security notification and the Google flow if used. Record actual results before marking production readiness passed.

Existing account export uses an explicit allowlist and does not expose these credential tables. Session/MFA data cascades on account deletion; security audit rows retain the action/time with user identity cleared. Organization owners are not platform admins and are outside this enforcement scope.
