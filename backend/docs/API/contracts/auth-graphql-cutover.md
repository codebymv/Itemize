# Authentication GraphQL cutover contract

**Status:** Characterizing  
**Owner:** Identity, with Platform Security owning cookie and CSRF transport  
**NestJS boundary:** `AuthModule`

## Decision

Authentication remains cookie based. GraphQL must not return bearer or refresh tokens to browser JavaScript. The access token stays in `itemize_auth`; the refresh token stays in `itemize_refresh`; both remain `httpOnly` and scoped to `/`.

`GET /api/auth/csrf` and `POST /api/auth/refresh` remain HTTP during the cutover. They are browser session protocol endpoints used outside normal application queries. All other supported auth operations move to `AuthModule` queries or mutations.

The active Google flow now sends an access token to the backend. The backend validates that token's audience against `GOOGLE_CLIENT_ID`, fetches the Google profile itself, requires a verified email, and derives the account identity from that provider response. Client-supplied Google IDs, email addresses, and names are not trusted.

## Operation map

| Legacy operation | Target | Required behavior |
| --- | --- | --- |
| `POST /api/auth/register` | `register(input)` | Validate and normalize credentials; create user and personal workspace atomically; send verification email without exposing its token |
| `POST /api/auth/login` | `login(input)` | Generic bad-credential response; verified email required; set both session cookies; return user without tokens |
| `POST /api/auth/google-login` | `loginWithGoogle(input)` | Verify provider token and audience server-side; require verified provider email; set cookie-only session |
| `POST /api/auth/google-credential` | merge into `loginWithGoogle(input)` | Use the same provider-verification and account-linking service |
| `GET /api/auth/me` | `viewer` | Read the signed access cookie; return normalized user identity; never cache |
| `PUT /api/auth/me` | `updateViewerProfile(input)` | Authenticated and CSRF-protected; trim name; enforce 1-100 characters |
| `POST /api/auth/logout` | `logout` | CSRF-protected; expire both session cookies; remain idempotent |
| `POST /api/auth/change-password` | `changePassword(input)` | Verify current password; enforce password policy; replace password hash; notify user |
| `POST /api/auth/forgot-password` | `requestPasswordReset(input)` | Non-enumerating response; strict rate limit; hashed one-hour token; email side effect |
| `POST /api/auth/reset-password` | `resetPassword(input)` | Validate and consume reset token; clear token state; enforce password policy; notify user |
| `POST /api/auth/verify-email` | `verifyEmail(input)` | Validate and consume verification token; mark verified; establish session; welcome email |
| `POST /api/auth/resend-verification` | `resendVerificationEmail(input)` | Non-enumerating response; strict rate limit; replace hashed 24-hour token |
| `GET /api/auth/csrf` | retain HTTP | Issue a fresh double-submit cookie/token pair |
| `POST /api/auth/refresh` | retain HTTP | Accept refresh cookie only; validate token type and user; rotate access cookie only; never return a token |

## Session and CSRF invariants

- Access cookies expire after 15 minutes; refresh cookies expire after 30 days.
- Production cookies remain `secure`, `httpOnly`, `sameSite=none`, path `/`, with the configured cookie domain when present.
- Authentication responses use `Cache-Control: no-store` wherever identity or renewed credentials are returned.
- Cookie-authenticated GraphQL mutations require the double-submit CSRF header. A mutation with an existing access or refresh cookie cannot bypass CSRF merely because it is a login or recovery operation.
- Unauthenticated login, registration, verification, recovery, and Google bootstrap calls remain usable without a CSRF cookie because they do not carry an Itemize session.
- Webhooks and non-browser API-key calls keep their separate signature/key security model and are not routed through `AuthModule` mutations.

## Identity and organization boundary

- Authentication establishes user identity only. It does not authorize an organization supplied by the client.
- GraphQL context resolves the requested organization from the organization header or the user's default organization, then verifies current membership in PostgreSQL.
- Role and membership are database facts, not trusted JWT claims. Cross-organization access returns `FORBIDDEN` without revealing whether the target record exists.
- Registration's intended contract is atomic creation of the user, personal organization, owner membership, and default organization. The legacy route currently catches organization-creation failure and can leave a user without a workspace; that behavior is not accepted as the target contract and requires a PostgreSQL characterization/fix before dual parity.

## GraphQL error contract

Resolvers return null data for failed mutations and use stable `extensions.code` values. Initial codes are:

| Condition | GraphQL code |
| --- | --- |
| Missing, expired, or invalid access cookie | `UNAUTHENTICATED` |
| Missing/mismatched CSRF token | `FORBIDDEN` with `reason=CSRF_*` |
| Invalid input or password policy | `BAD_USER_INPUT` |
| Invalid email/password | `INVALID_CREDENTIALS` |
| Email not verified | `EMAIL_NOT_VERIFIED` |
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

Current executable evidence covers cookie-only local login, `viewer`, CSRF enforcement, access refresh, missing refresh cookie, logout cookie expiration, profile update, Google legacy-payload rejection, Google audience validation, verified-email enforcement, and server-derived Google identity. A staging browser rehearsal also proved that an expired GraphQL access cookie producing an HTTP-`200` `UNAUTHENTICATED` error performs one CSRF-protected retained-HTTP refresh and retries the GraphQL operation successfully; two frontend tests cover successful recovery and invalid-refresh failure. The rehearsal used a synthetic session, so credential-login browser coverage remains required. Real PostgreSQL concurrency and transaction scenarios still require the disposable integration environment.

## Known consumer issue

`frontend/src/pages/AuthCallback.tsx` sends an authorization code to `/api/auth/google-login`, but no code-exchange implementation exists and no current flow in the repository initiates that redirect route. The active login/register flow is `useGoogleSignIn`. Keep the callback out of the GraphQL migration until production traffic and OAuth console configuration confirm whether it can be removed or needs a proper server-side authorization-code exchange.
