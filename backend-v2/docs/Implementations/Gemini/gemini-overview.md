# Itemize Gemini implementation

Itemize uses Google's Gemini API for three user-facing capabilities:

- complementary workspace-list items
- note continuations
- the public “Ask about Itemize” assistant

The provider boundary lives in
`backend-v2/src/ai/ai-provider.service.ts`. The browser reaches it only through
the NestJS GraphQL API; the Express backend no longer loads the Gemini SDK or
registers AI routes.

## Operations

Authenticated list and note suggestions use the `listSuggestions` and
`noteSuggestions` GraphQL mutations. Both require the normal Itemize session
and CSRF proof. The frontend adapters are
`fetchListSuggestions` and `fetchNoteSuggestions` in
`frontend/src/services/aiGraphql.ts`.

The public marketing assistant uses the `marketingChatToken` query followed by
the `marketingChatAsk` mutation. The token is a signed, expiring, one-time
capability and is consumed before provider work. Both public operations are
rate-limited independently by IP.

## Provider configuration

- `GEMINI_API_KEY`: server-only Gemini credential
- `MARKETING_CHAT_AI_MODEL`: optional model override; defaults to
  `gemini-2.5-flash`
- `MARKETING_CHAT_AI_ENABLED=false`: disables provider-backed public answers
  while keeping a safe support fallback

The same configured model currently serves all three capabilities. Provider
responses are length-bounded and normalized before reaching the browser.

## Cost and failure controls

Nonempty list and note results are cached for one hour in a 100-entry bounded
cache. The frontend additionally debounces, throttles, and caches suggestion
requests. List input is bounded to 100 items and note input to 20,000
characters; the shipped note hook sends only its last 200 characters of
context.

Missing credentials and provider errors fail soft for suggestions. Public chat
returns a support fallback when disabled or unavailable and filters suspicious
instruction-revealing output. Provider keys and raw configuration are never
returned to clients or logged.

See
[`!docs/API/contracts/ai-graphql-cutover.md`](../../API/contracts/ai-graphql-cutover.md)
for the complete auth, capability, error, and verification contract.
