# GraphQL cutover ledger workflow

The generated cutover ledger connects the Express route inventory to static frontend consumers and backend characterization tests. It is the working queue for deciding what becomes GraphQL, what remains HTTP, and what must be reconciled before migration.

## Commands

From the repository root:

```powershell
npm run api:ledger
npm run api:ledger:check
```

`api:ledger` refreshes both the REST inventory and ledger. `api:ledger:check` is the CI drift check and does not rewrite files.

Generated artifacts:

- `!docs/API/generated/graphql-cutover-ledger.json` — machine-readable ledger with route, consumer, test, risk, and disposition evidence
- `!docs/API/generated/graphql-cutover-ledger.md` — reviewable summary, operation table, and unmatched-call queues

## Current static baseline

| Evidence | Count |
| --- | ---: |
| Registered method/path operations | 407 |
| API operations under `/api` | 402 |
| Frontend API callsites | 387 |
| Operations with frontend consumers | 365 |
| Operations referenced by backend tests | 117 |
| Unmatched frontend callsites | 0 |
| Runtime URL expressions requiring review | 0 |
| Acknowledged generic runtime URL helpers | 2 |
| Literal `${...}` inside a non-template string | 0 |
| Recommended retained HTTP operations | 21 |
| High-risk operations | 279 |

These are static matches, not production-traffic measurements. An operation with no frontend match may still serve integrations, webhooks, automation, old clients, or manually entered URLs.

## Manual decisions

Do not edit generated files. Add decisions to `!docs/API/graphql-operation-overrides.json`, keyed by the exact operation ID shown in the ledger:

```json
{
  "schemaVersion": 1,
  "operations": {
    "GET /api/contacts": {
      "disposition": "graphql-query",
      "owner": "crm",
      "targetModule": "ContactsModule",
      "targetOperation": "contacts",
      "parityStatus": "characterized",
      "risk": "high",
      "notes": "Preserve organization filtering, pagination, search, and ordering semantics."
    }
  }
}
```

Supported starting dispositions are `graphql-query`, `graphql-mutation`, `retain-http`, and `non-api`. An override can also use a project-specific disposition such as `merge-into-graphql-operation` or `remove-after-consumer-audit`, but it must include a note explaining the decision.

Suggested parity states:

- `not-started`
- `characterizing`
- `characterized`
- `implementing`
- `dual-parity`
- `consumer-migrated`
- `observing`
- `retired`

The generator preserves no implicit human state: every owner, target operation, exception, and parity state must live in the overrides file.

## Review order

1. Confirm each recommended retained-HTTP route. Webhooks, provider callbacks, health checks, multipart uploads, and binary downloads normally remain HTTP.
2. Assign owners and GraphQL targets to frontend-consumed, high-risk operations first.
3. Add characterization tests, then move the ledger state through implementation, semantic parity, consumer migration, and observation.
4. Use production traffic evidence before marking any statically unconsumed REST operation for removal.

The former 18-call unmatched queue is reconciled. Public booking/form mounts and search routing were corrected, missing invoice-payment and reputation-delete handlers were added with focused tests, onboarding reset now exposes its literal endpoint to the inventory, and two unused legacy client modules were removed. The remaining generic GET/POST `url` parameters in `frontend/src/lib/debounce.ts` are explicitly acknowledged in the override file; they are transport helpers whose callers supply the operation.

## Matching limits

- Parameter names are normalized, so `/:id` and `/:invoiceId` match.
- Concrete IDs in tests match parameterized routes.
- Runtime variables remain in a manual review queue unless explicitly classified in the override file. The two current entries are acknowledged generic transport helpers, not application operations.
- Query strings are not part of route matching; their filtering/pagination semantics still require characterization.
- Static call counts do not establish that a component is reachable or that an operation succeeds at runtime.
