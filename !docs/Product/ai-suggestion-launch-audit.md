# AI suggestion launch audit

The workspace suggestion layer uses GPT-5.6 Luna as its primary provider and can use Gemini as a fallback. This is a launch gate for list and note suggestions; it is intentionally separate from deterministic release checks because it calls paid, nondeterministic providers.

## Automated comparison

Run from the repository root with both provider keys available:

```bash
npm run ai:eval --workspace itemize-graphql-api
```

Use `-- --openai-only` or `-- --gemini-only` to isolate one provider. The harness covers launch planning, onboarding, short nouns, meetings, Unicode, sentence boundaries, and instruction-boundary cases. It fails when a response is missing, duplicated, too long, repeats existing content, or contains model preamble.

## Human quality gate

Review every printed result on four 1–5 dimensions:

1. Relevance: directly useful for the supplied list or note.
2. Specificity: concrete enough to act on without rewriting.
3. Continuity: reads naturally after the existing content.
4. Restraint: does not repeat, over-explain, or invent unsupported context.

Ship the provider configuration only when:

- every mechanical case passes;
- the average human score is at least 4.0;
- no individual case scores below 3;
- Luna is equal to or better than Gemini on at least three dimensions;
- median latency is acceptable in the production region;
- provider logs show bounded input/output token usage and the intended model;
- desktop accepts with Tab and Right Arrow only in the focused note;
- mobile exposes Accept, Another, and Dismiss without requiring a keyboard;
- stale responses never replace suggestions for newer text;
- provider and rate-limit errors remain visible and retryable.

## Current economic guardrails

- note context is clamped to the latest 1,200 characters;
- list context is clamped to 50 items of 160 characters each;
- Luna note output is capped at 80 tokens and list output at 120 tokens;
- successful results use bounded, privacy-safe caches;
- authenticated suggestions are limited per user and additionally per IP;
- provider, model, token counts, duration, and accepted output count are logged server-side;
- failed or malformed output is never silently presented as a valid suggestion.

Credit balances, automatic top-ups, and plan-specific quotas remain a separate product/economics decision. Do not imply unlimited AI usage in launch copy until that system exists.
