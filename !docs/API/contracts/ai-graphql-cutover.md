# AI GraphQL cutover contract

## Scope

The AI boundary is owned by `AiModule` in the NestJS GraphQL service. It
replaces the four application REST operations that previously lived in the
Express service:

| GraphQL operation | Access | Replaces |
| --- | --- | --- |
| `marketingChatToken` | Public, IP rate-limited | `GET /api/marketing-chat/token` |
| `marketingChatAsk` | Public, one-time capability, IP rate-limited | `POST /api/marketing-chat/ask` |
| `listSuggestions` | Authenticated, CSRF-protected | `POST /api/suggestions` |
| `noteSuggestions` | Authenticated, CSRF-protected | `POST /api/note-suggestions` |

The browser uses `frontend/src/services/aiGraphql.ts` for all four operations.
There is no runtime REST fallback or feature flag.

## Public marketing-chat boundary

`marketingChatToken` issues a signed random capability that expires after five
minutes. The server also records the exact token in a bounded in-memory set.
`marketingChatAsk` consumes the capability before provider work, so it cannot
be replayed even when the provider fails. Tokens are limited to 200 characters,
conversation history to 20 messages, and message content to 500 characters.
Only `user` and `assistant` roles are accepted.

Token and ask operations have independent per-IP 15-minute budgets. The
in-memory rate-limit and capability stores are bounded and prune expired
entries. This matches the prior single-instance semantics; a future
multi-instance deployment must move both stores to a shared atomic backend
before horizontal scaling.

The assistant is constrained to Itemize product information. It does not
invent plan prices, customers, certifications, guarantees, or account details.
Provider output is bounded and filtered for instruction leakage and common
prompt-injection markers. Missing credentials or an explicitly disabled
marketing assistant returns a safe support response without exposing provider
configuration.

## Authenticated suggestion boundary

List and note suggestions use the ordinary Itemize access-cookie guard and
double-submit CSRF proof. The provider key remains server-only.

List inputs require a nonempty title of at most 200 characters and at most 100
nonempty items of at most 200 characters each. Notes accept nonempty content up
to 20,000 characters; the shipped browser currently sends only its final
200-character context window. Provider output is normalized, deduplicated, and
bounded.

Successful nonempty suggestions are cached in memory for one hour. The cache is
limited to 100 entries. A missing provider key and provider failures preserve
the existing `{ suggestions, cached?, error? }` response shape so the browser
can fail soft without inventing suggestions.

## Error contract

- malformed input: `BAD_USER_INPUT`
- missing or replayed marketing capability: `UNAUTHENTICATED` with
  `MARKETING_CHAT_TOKEN_INVALID`
- exhausted public budget: `RATE_LIMITED` with `AI_RATE_LIMITED`
- missing authenticated session: `UNAUTHENTICATED`
- missing or mismatched CSRF proof: `FORBIDDEN`

Provider failures for list and note suggestions remain data-level soft
failures. Public marketing chat presents a safe fallback rather than provider
details.

## Verification

Service tests cover bounded input, missing-credential behavior, capability
replay denial, and independent rate-limit buckets. HTTP GraphQL tests exercise
public capability issuance and consumption, replay rejection, authentication,
and CSRF. Frontend tests cover the four GraphQL request envelopes and the
marketing launcher journey. The production build must contain no references to
the retired REST paths.

The generated cutover ledger after retirement contains 301 registered
operations and 245 static frontend callsites, with zero unmatched frontend
calls and zero unresolved runtime URL expressions. All remaining registered
application endpoints are already classified as GraphQL migrations or
deliberately retained HTTP protocols.
