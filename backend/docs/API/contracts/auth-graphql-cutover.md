# Authentication GraphQL cutover contract

**Status:** GraphQL exclusively owns browser session, identity, recovery, password, and viewer-profile operations
**Owner:** Identity, with Platform Security owning cookie and CSRF transport  
**NestJS boundary:** `AuthModule`

## Decision

Authentication remains cookie based. GraphQL must not return bearer or refresh tokens to browser JavaScript. The access token stays in `itemize_auth`; the refresh token stays in `itemize_refresh`; both remain `httpOnly` and scoped to `/`.

The browser session protocol routes directly through GraphQL as one unit: login, active Google access-token login, current-user hydration, CSRF issuance, access refresh, and logout. Registration, email verification, verification resend, forgot/reset password, authenticated password change, and viewer-profile updates have the same permanent GraphQL ownership. The three browser rollout flags and every duplicate Express auth JSON handler have been removed.

The coordinated switch was enabled in production on 2026-07-21. Backend deployment `5d155af6-e84b-4a8a-a385-2867a01f8fc2`, GraphQL deployment `62755717-ecb6-4249-8ee7-748f229d620b`, and frontend deployment `75a3b29a-3870-492a-b99e-d6f0c5cd9475` serve commit `9f3a4c86`. Same-origin probes verified the CSRF/cookie allowlist and stable anonymous errors, and a real browser login attempt was observed as GraphQL `Login` with no retained REST auth request.

Registration, verification, and resend were enabled on 2026-07-21 from commit `44281ad3`: backend deployment `1fc4a8c1-7a73-4459-8868-d6826bd4ac99`, GraphQL deployment `7c9b6fc2-2af6-474b-be47-9ec1052a40f3`, and flag-enabled frontend deployment `0186d765-2661-49a6-9d77-f4c7e01e889e`. Safe production probes returned `BAD_USER_INPUT` for malformed registration, `INVALID_TOKEN` for an unknown verification token, and the generic success envelope for a missing resend identity without creating a row. The deployed browser rendered the verification error while GraphQL observability recorded `operationName="VerifyEmail"`; no retained REST request handled that page load.

Forgot/reset password were enabled on 2026-07-21 from commit `28d0b0af`: backend deployment `eccd0bb5-02f7-4799-80e9-a9a47a776033`, GraphQL deployment `2037928f-a948-48ca-9828-a3735d28eca1`, and flag-enabled frontend deployment `83913ee7-6566-4820-b181-033ebaa9dd12`. Safe production probes verified malformed email rejection, the generic missing-account envelope, invalid reset-token rejection, and anonymous profile denial without creating a row or sending email. A deployed forgot-password submission rendered the generic success state while NestJS recorded `operationName="RequestPasswordReset"` in 9 ms.

The active Google flow now sends an access token to the backend. The backend validates that token's audience against `GOOGLE_CLIENT_ID`, fetches the Google profile itself, requires a verified email, and derives the account identity from that provider response. Client-supplied Google IDs, email addresses, and names are not trusted.

The unused Google One Tap `POST /api/auth/google-credential` variant had no shipped consumer and was retired on 2026-07-27 together with its public CSRF exemption. The access-token GraphQL flow is the single supported Google session bootstrap.

## Operation map

| Legacy operation | Target | Required behavior |
| --- | --- | --- |
| `POST /api/auth/register` | `register(input)` | Validate and normalize credentials; create user and personal workspace atomically; send verification email without exposing its token |
| `POST /api/auth/login` | `login(input)` | Generic bad-credential response; verified email required; set both session cookies; return user without tokens |
| `POST /api/auth/google-login` | `loginWithGoogleAccessToken(input)` | Verify provider token and audience server-side; require verified provider email; set cookie-only session |
| `GET /api/auth/me` | `currentUser` | Read the signed access cookie; return normalized user identity; never cache |
| retired `PUT /api/auth/me` | `updateViewerProfile(input)` | Authenticated and CSRF-protected; trim name; enforce 1-100 characters |
| `POST /api/auth/logout` | `logout` | CSRF-protected; expire both session cookies; remain idempotent |
| retired `POST /api/auth/change-password` | `changePassword(input)` | Verify current password; enforce password policy; replace password hash; notify user |
| `POST /api/auth/forgot-password` | `requestPasswordReset(input)` | Non-enumerating response; strict rate limit; hashed one-hour token; email side effect |
| `POST /api/auth/reset-password` | `resetPassword(input)` | Validate and consume reset token; clear token state; enforce password policy; notify user |
| `POST /api/auth/verify-email` | `verifyEmail(input)` | Validate and consume verification token; mark verified; establish session; welcome email |
| `POST /api/auth/resend-verification` | `resendVerificationEmail(input)` | Non-enumerating response; strict rate limit; replace hashed 24-hour token |
| retired `GET /api/auth/csrf` | `csrfToken` | Issue or reuse a double-submit cookie/token pair |
| retired `POST /api/auth/refresh` | `refreshSession` | Accept refresh cookie only; validate token type and user; rotate access cookie only; never return a token |

## Session and CSRF invariants

- Access cookies expire after 15 minutes; refresh cookies expire after 30 days.
- Production cookies remain `secure`, `httpOnly`, `sameSite=none`, path `/`, with the configured cookie domain when present.
- Authentication responses use `Cache-Control: no-store` wherever identity or renewed credentials are returned.
- Cookie-authenticated GraphQL mutations require the double-submit CSRF header. A mutation with an existing access or refresh cookie cannot bypass CSRF merely because it is a login or recovery operation.
- Unauthenticated login, registration, verification, recovery, and Google bootstrap calls remain usable without a CSRF cookie because they do not carry an Itemize session.
- Webhooks and non-browser API-key calls keep their separate signature/key security model and are not routed through `AuthModule` mutations.
- Login and active Google bootstrap retain the legacy per-IP/identity 15-minute attempt limit in NestJS.
- The same-origin GraphQL proxy forwards only the three authentication cookies plus the cache/CSRF response headers needed by this protocol; unrelated upstream cookies and headers are dropped.

## Identity and organization boundary

- Authentication establishes user identity only. It does not authorize an organization supplied by the client.
- GraphQL context resolves the requested organization from the organization header or the user's default organization, then verifies current membership in PostgreSQL.
- Role and membership are database facts, not trusted JWT claims. Cross-organization access returns `FORBIDDEN` without revealing whether the target record exists.
- Registration atomically creates the user, personal organization, owner membership, and default organization. A workspace failure rolls back the complete identity transaction instead of preserving the legacy route's partial account.

## GraphQL error contract

Resolvers return null data for failed mutations and use stable `extensions.code` values. Initial codes are:

| Condition | GraphQL code |
| --- | --- |
| Missing, expired, or invalid access cookie | `UNAUTHENTICATED` |
| Missing/mismatched CSRF token | `FORBIDDEN` with `reason=CSRF_*` |
| Invalid input or password policy | `BAD_USER_INPUT` |
| Invalid email/password | `UNAUTHENTICATED` with `reason=INVALID_CREDENTIALS` |
| Email not verified | `UNAUTHENTICATED` with `reason=EMAIL_NOT_VERIFIED` |
| Existing local or Google account conflict | `ACCOUNT_CONFLICT` |
| Invalid/expired verification or reset token | `INVALID_TOKEN` |
| Provider token/audience/identity failure | `INVALID_PROVIDER_TOKEN` |
| Rate limit exceeded | `RATE_LIMITED` |
| Database unavailable | `SERVICE_UNAVAILABLE` |

Password recovery and verification resend must not expose account existence through codes, messages, timing-sensitive branching visible to the caller, or response shape.

## Transaction and side-effect boundaries

- Registration commits the user/workspace/membership/default-workspace records together. Email is queued only after commit.
- Verification and password-reset token consumption must lock or conditionally update the token row so concurrent reuse succeeds at most once.
- Email failures do not roll back committed identity state; they are observable and retryable through an outbox/job boundary.
- Google first-login workspace creation is atomic. A provider identity is never persisted from unverified browser fields.
- Logout cookie expiration is safe to repeat.

## Required parity scenarios

1. Local login success, wrong email, wrong password, Google-only account, and unverified email.
2. Cookie flags, absence of tokens in response bodies, expiry, refresh token type, unknown user, and unverified user.
3. CSRF missing cookie, missing header, mismatch, success, unauthenticated bootstrap, and authenticated GraphQL mutation.
4. Viewer success, missing/expired token, user deleted after token issuance, profile validation, and trimmed update.
5. Registration conflicts plus atomic workspace creation and rollback.
6. Verification/resend and password reset/change success, invalid token, expired token, replay, rate limit, and notification failure.
7. Google token failure, wrong audience, unverified email, normalized verified identity, existing account, new account, and workspace-creation rollback.
8. Organization header/default selection, non-member denial, role changes after token issuance, and cross-tenant record denial.

Current executable evidence covers cookie-only local GraphQL login, generic bad credentials, `currentUser`, public CSRF issuance, CSRF-protected access refresh, logout cookie expiration, and the legacy attempt limit. HTTP-level Nest tests prove that response bodies contain no token, both session cookies are `httpOnly`, refreshed access cookies authenticate subsequent operations, and failed login emits no cookie. Fresh PostgreSQL additionally proves atomic account/workspace creation and rollback, concurrent single-winner verification and password reset, hashed verification/reset token storage, cookie-only verification sessions, non-enumerating resend/recovery, bcrypt replacement, authenticated current-hash password change, CSRF denial, and trimmed profile persistence. The backend GraphQL proxy proves the cookie/cache header allowlist, while frontend tests prove direct session, identity, recovery, and Google access-token adapter mapping without REST fallback. Production probes and deployed browser flows verify registration/verification/resend and password recovery are active through GraphQL. Google live-provider behavior remains outstanding.

## Express retirement boundary

The 11 mounted Express auth JSON endpoints and three already-retired aliases are covered by a full-composition 404 matrix with valid session and CSRF cookies. The deleted endpoints are login, Google access-token login, current-user hydration, logout, refresh, registration, verification/resend, password recovery/reset, and CSRF issuance; the existing retired aliases are profile update, password change, and Google credential bootstrap.

The unused `/auth/callback` page was also removed. It attempted to send an OAuth authorization code to the access-token endpoint even though no application flow initiated that redirect and no backend code-exchange implementation existed. The supported Google browser flow remains `useGoogleSignIn`, which obtains an access token through Google Identity Services and submits it to `loginWithGoogleAccessToken`.

Authentication still uses HTTP-only cookies and the GraphQL HTTP transport. This retirement removes duplicate application JSON operations; it does not move tokens into JavaScript, weaken CSRF enforcement, or change webhook/API-key security boundaries.
