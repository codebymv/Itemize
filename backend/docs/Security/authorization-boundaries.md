# Authorization boundaries

Itemize treats authorization scope as part of each transport operation's
contract. Authentication, tenant selection, resource predicates, and public
capabilities are separate boundaries and must not substitute for one another.

## GraphQL scopes

Every GraphQL query and mutation declares one authoritative scope:

| Scope | Authority |
| --- | --- |
| `Public` | No authenticated identity is required. Use only for deliberately public operations. |
| `AccountScoped` | The verified access-cookie identity owns the data. Selected organization state is not authorization evidence. |
| `OrganizationScoped` | The global organization guard resolves the selected organization from the verified user's current PostgreSQL membership. |
| `PlatformAdminScoped` | The verified identity must also pass `AdminAccessGuard`, which re-reads the platform role from PostgreSQL. |

A method-level scope overrides a class default. This is required for mixed
resolvers such as personal workspace content, where most records are
account-owned but organization list creation consumes selected-organization
limits.

Every authenticated GraphQL mutation is also `CsrfProtected`. Public
operations do not inherit an authenticated scope merely because their resolver
has an account-scoped default.

## HTTP scopes

The GraphQL authentication guard intentionally ignores HTTP controllers, so
every HTTP route declares one of these boundaries:

| Scope | Authority |
| --- | --- |
| `Public` | An intentionally public operational or documentation endpoint. |
| `HttpPublicResourceScoped` | A published resource addressed by its public identifier, such as a page, form, or booking calendar. |
| `HttpCapabilityScoped` | Possession of an opaque, purpose-bound token or OAuth state authorizes the operation. |
| `HttpProviderWebhookScoped` | The controller verifies a provider signature or challenge before processing input. |
| `HttpSessionScoped` | An approved guard verifies the access cookie, resolves current organization membership when applicable, and enforces CSRF on writes. |

Public-resource identifiers and capability tokens must never be accepted as
organization membership. Provider payloads must not be processed before their
signature or challenge is verified. Session guards resolve organization
membership on every request rather than trusting a tenant identifier from the
browser.

## Tenant isolation

Organization context authorizes access to a tenant, but repositories still
include `organization_id` in every resource read and write predicate. Foreign
resource IDs are concealed as unavailable where existence disclosure would
leak tenant information. Organization-management operations are account-scoped
because they can target a membership other than the currently selected
organization; their services independently enforce membership and role rules.

The organization roles currently govern organization administration: settings,
invitations, membership, ownership, leaving, and deletion. They are not a
general business-module ACL. A future read-only business role must be introduced
as an explicit product and server policy rather than inferred from the label
`viewer`.

## Release enforcement

`graphql-authorization-boundary-contract.spec.ts` rejects:

- unclassified GraphQL queries or mutations;
- conflicting authenticated scopes;
- platform-admin operations without `AdminAccessGuard`;
- authenticated mutations without CSRF protection.

`http-authorization-boundary-contract.spec.ts` rejects:

- unclassified HTTP routes;
- conflicting HTTP boundaries;
- session routes without an approved membership-aware guard;
- session writes without a CSRF-enforcing guard;
- provider webhooks without an in-handler verification call.

Both contracts run in `npm run release:contracts`. New operations must choose
their boundary in code; an allowlist of unclassified routes is not accepted.

