# Shared GraphQL error, pagination, and scalar contract

**Status:** Characterized foundation  
**Owner:** Platform API  
**Executable reference:** `backend/src/contracts/graphql-contract.js`

## Decision

GraphQL preserves domain outcomes, authorization decisions, database state, and side effects; it does not reproduce REST status codes or response envelopes. Errors use stable `extensions.code` values. Paginated queries return a consistent page object. PostgreSQL decimals remain decimal strings across the transport boundary.

The first cutover uses strict page-based pagination because the current React consumers are page based. Cursor pagination can be added for feeds that need stable traversal, but individual fields cannot silently switch pagination models during parity testing.

## Error shape

```graphql
type ErrorExtensionContract {
  code: String!
  reason: String
  field: String
  requestId: String
}
```

GraphQL libraries carry this data in the standard error `extensions` object rather than a schema field. Resolver data is null at the field allowed by schema nullability.

| Outcome | `extensions.code` |
| --- | --- |
| Invalid input or validation | `BAD_USER_INPUT` |
| Missing/invalid/expired session | `UNAUTHENTICATED` |
| Authenticated but unauthorized or CSRF failure | `FORBIDDEN` |
| Authorized resource lookup misses | `NOT_FOUND` |
| Unique/state conflict | `CONFLICT` |
| Payload exceeds a documented limit | `PAYLOAD_TOO_LARGE` |
| Rate limit | `RATE_LIMITED` |
| Required dependency unavailable | `SERVICE_UNAVAILABLE` |
| Unexpected implementation failure | `INTERNAL_SERVER_ERROR` |

Approved domain codes such as `EMAIL_NOT_VERIFIED`, `INVALID_CREDENTIALS`, `INVALID_PROVIDER_TOKEN`, `INVALID_TOKEN`, `ACCOUNT_CONFLICT`, and `ORGANIZATION_REQUIRED` remain stable when they convey behavior the client must handle.

`reason` may retain a safe legacy detail such as `CSRF_TOKEN_MISMATCH` or `VALIDATION_ERROR`. `field` contains a public input field name only. `requestId` correlates the client error with server logs. Stack traces, SQL, provider payloads, secrets, token values, and unexpected internal messages never enter GraphQL errors.

## Pagination schema

```graphql
input PageInput {
  page: Int = 1
  pageSize: Int = 50
}

type PageInfo {
  page: Int!
  pageSize: Int!
  total: Int!
  totalPages: Int!
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
}

type InvoicePage {
  nodes: [Invoice!]!
  pageInfo: PageInfo!
}
```

- `page` is one-indexed and must be at least 1.
- `pageSize` must be 1-100 unless a field documents a smaller maximum.
- Invalid values return `BAD_USER_INPUT`; GraphQL does not silently clamp them as some legacy REST helpers do.
- An empty result is `nodes: []`, `total: 0`, and `totalPages: 0` while the requested page remains 1.
- Default ordering is deterministic and includes a unique tie-breaker, normally `createdAt DESC, id DESC`.
- Filters, ordering, and search arguments are explicit typed inputs; raw SQL column names are never accepted from clients.
- Counts and nodes are read under semantics that cannot leak cross-tenant rows. Exact snapshot consistency is required for financial and state-transition screens when concurrent changes would produce misleading totals.

## Scalars

| Scalar | Transport contract |
| --- | --- |
| `DateTime` | RFC 3339 timestamp with an explicit offset; server storage/comparison uses UTC |
| `Date` | Calendar date `YYYY-MM-DD`; never shifted through a browser timezone |
| `Decimal` | JSON string containing a base-10 decimal; never a binary floating-point GraphQL `Float` |
| `CurrencyCode` | Uppercase ISO-style three-letter code validated at input |
| `JSON` | Reserved for genuinely schemaless settings/content; not a shortcut around typed domain inputs |

Financial amounts use `Decimal`. Money-bearing objects include both `amount` and `currency`. Arithmetic, comparisons, totals, taxes, discounts, and payment application occur with PostgreSQL numeric values or a decimal library, not JavaScript floating point.

## Nullability and mutation results

- Required database identities and invariant fields are non-null.
- Optional user-entered fields are nullable; empty string and null are not interchangeable unless the field contract explicitly says so.
- List fields return empty arrays rather than null.
- Mutations return the resulting domain object or a purpose-built payload when they also create side effects, URLs, or warnings.
- Delete mutations return the deleted ID and a boolean outcome only when repeat behavior is defined; they do not return arbitrary REST messages.
- Resolver-level failures use GraphQL errors rather than `{ success, error }` payload unions unless partial success is a deliberate domain behavior.

## Executable gates

`backend/src/contracts/graphql-contract.js` currently proves:

- legacy status/code evidence maps to the stable GraphQL taxonomy;
- unexpected internal messages and stacks are not exposed;
- field, reason, and request correlation metadata are constrained;
- page input is strict and produces a deterministic SQL offset;
- canonical `PageInfo` names and empty-page behavior are stable;
- decimal strings preserve PostgreSQL precision and malformed/non-finite values fail.

Each NestJS exception filter, pagination input, and custom scalar must run these shared cases plus resolver-specific cases before the first dual-parity slice.
