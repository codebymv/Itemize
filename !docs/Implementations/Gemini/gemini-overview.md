# Itemize AI provider implementation

Itemize uses a server-side AI provider boundary for three user-facing capabilities:

- complementary workspace-list items
- note continuations
- the public “Ask about Itemize” assistant

The provider boundary lives in `backend/src/ai/ai-provider.service.ts`. The
browser reaches it only through the NestJS GraphQL API.

## Operations

Authenticated list and note suggestions use the `listSuggestions` and
`noteSuggestions` GraphQL mutations. Both require the normal Itemize session
and CSRF proof. The frontend adapters are
`fetchListSuggestions` and `fetchNoteSuggestions` in
`frontend/src/services/aiGraphql.ts`.

The public marketing assistant uses the `marketingChatToken` query followed by
the `marketingChatAsk` mutation. The token is a signed, expiring, one-time
capability and is consumed before provider work. Both public operations are
rate-limited independently by IP. Authenticated workspace suggestions share a
separate per-IP request budget.

## Provider configuration

- `OPENAI_API_KEY`: server-only OpenAI credential
- `GEMINI_API_KEY`: optional server-only Gemini credential
- `AI_PROVIDER`: `openai` or `gemini`; when omitted, OpenAI is preferred when
  its key is present, otherwise Gemini is used
- `AI_FALLBACK_PROVIDER`: optional second provider used after primary failure
- `AI_OPENAI_MODEL`: defaults to `gpt-5.6-luna`
- `AI_OPENAI_REASONING_EFFORT`: defaults to `none`
- `AI_GEMINI_MODEL`: defaults to `gemini-2.5-flash`
- `AI_REQUEST_TIMEOUT_MS`: bounded provider timeout; defaults to 12 seconds
- `MARKETING_CHAT_AI_ENABLED=false`: disables provider-backed public answers
  while keeping a safe support fallback

`MARKETING_CHAT_AI_MODEL` remains a legacy Gemini override for deployment
compatibility. Provider responses are length-bounded and normalized before
reaching the browser.

## Cost and failure controls

Nonempty list and note results are cached for one hour in a 100-entry bounded
cache. The frontend additionally debounces, throttles, and caches suggestion
requests. List input is bounded to 100 items and note input to 20,000
characters; the shipped note hook sends only its last 200 characters of
context.

Missing credentials and provider errors fail soft for suggestions. Public chat
returns a support fallback when disabled or unavailable and filters suspicious
instruction-revealing output. Logs contain provider/model, duration, and token
counts when available, but never prompt content, API keys, or raw provider
responses.

See
[`!docs/API/contracts/ai-graphql-cutover.md`](../../API/contracts/ai-graphql-cutover.md)
for the complete auth, capability, error, and verification contract.
