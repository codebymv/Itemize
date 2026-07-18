# Tenancy and organization GraphQL contract

**Status:** Workspace selector implemented; remaining management operations characterized
**Owner:** Workspace, with Platform Security owning request-context enforcement  
**NestJS boundary:** `OrganizationsModule` plus a global organization-context guard

## Decision

Every organization-scoped resolver derives its context from the authenticated user and current PostgreSQL membership. Organization ID and role claims in a JWT, GraphQL input, cached frontend state, or object returned by another resolver are not authorization evidence.

The GraphQL transport accepts an optional `x-organization-id` header. If absent, context uses the user's current default organization. The context loader validates a positive integer, verifies active membership, and attaches `{ organizationId, organizationRole }` for the request. Public and explicitly user-global operations opt out; organization-scoped resolvers fail closed when context is absent.

Legacy REST routes continue accepting organization ID from query, body, or header during migration. New GraphQL application operations use the header/default context only. Organization-management operations take an explicit organization ID argument and independently verify membership because they may inspect an organization other than the current UI selection.

## Context algorithm

1. Require a valid access-cookie identity.
2. Parse `x-organization-id` as a positive safe integer when supplied; malformed values return `BAD_USER_INPUT` before opening a database connection.
3. With an explicit ID, query `organization_members` by both organization and authenticated user.
4. Without an explicit ID, query the user's default organization joined to that same user's membership.
5. Reject missing membership without revealing whether the organization exists.
6. Attach the database role for this request only. Re-read it on the next request so role revocation does not wait for JWT expiry.

## Role matrix

| Capability | owner | admin | member | viewer |
| --- | :---: | :---: | :---: | :---: |
| Read organization and member list | yes | yes | yes | yes |
| Update organization settings | yes | yes | no | no |
| Add members | yes | yes | no | no |
| Change/remove member | yes | yes, except admins/owner | no | no |
| Delete organization | yes | no | no | no |
| Leave organization | no | yes | yes | yes |

Owner transfer is not implemented in the current REST surface. Do not make owner removal or role demotion possible through the generic member mutations.

## Organization operation map

| Legacy operation | Target |
| --- | --- |
| `GET /api/organizations` | `organizations` |
| `GET /api/organizations/:organizationId` | `organization(id)` |
| `POST /api/organizations` | `createOrganization(input)` |
| `PUT /api/organizations/:organizationId` | `updateOrganization(id, input)` |
| `DELETE /api/organizations/:organizationId` | `deleteOrganization(id)` |
| `POST /api/organizations/:organizationId/select` | `selectOrganization(id)` |
| `GET /api/organizations/:organizationId/members` | `organizationMembers(organizationId)` |
| `POST /api/organizations/:organizationId/members` | `addOrganizationMember(input)` |
| `PUT /api/organizations/:organizationId/members/:memberId` | `updateOrganizationMemberRole(input)` |
| `DELETE /api/organizations/:organizationId/members/:memberId` | `removeOrganizationMember(input)` |
| `POST /api/organizations/:organizationId/leave` | `leaveOrganization(id)` |
| `POST /api/organizations/ensure-default` | `ensureDefaultOrganization` |

## Error contract

| Condition | GraphQL code |
| --- | --- |
| Missing/invalid user identity | `UNAUTHENTICATED` |
| Missing organization and no valid default | `ORGANIZATION_REQUIRED` |
| Malformed organization ID | `BAD_USER_INPUT` with `reason=INVALID_ORGANIZATION_ID` |
| Not a current member | `FORBIDDEN` |
| Role does not allow operation | `FORBIDDEN` with `reason=INSUFFICIENT_ORGANIZATION_ROLE` |
| Organization/member absent after authorized lookup | `NOT_FOUND` |
| Duplicate membership | `CONFLICT` |
| Database unavailable | `SERVICE_UNAVAILABLE` |

Outsider responses must not distinguish an existing organization from an unknown ID. Logs may retain the internal distinction with correlation ID and actor ID but must not include session tokens.

## Transaction and state invariants

- Creating an organization commits the organization, owner membership, and initial default assignment together.
- `ensureDefaultOrganization` is idempotent under concurrency and cannot create multiple personal organizations for simultaneous calls.
- Adding a member performs lookup, duplicate protection, insert, and inviter attribution within one transaction backed by a unique `(organization_id, user_id)` constraint.
- Leaving or removing a member repairs `users.default_organization_id` when it points to the departed organization.
- Deleting an organization defines and tests cascade behavior, default-organization cleanup, last-owner rules, and audit requirements before implementation. It currently has no backend characterization test and remains high risk.
- Every resource query and mutation includes `organization_id` in the SQL predicate even after context authorization. Context authorization alone is not row-level isolation.

## Required parity scenarios

1. Explicit valid organization, default organization fallback, no default, malformed ID, and database failure.
2. Current member for every role, outsider, deleted membership, and role changed after access-token issuance.
3. Same resource ID in two organizations plus read/update/delete denial from the wrong organization.
4. Organization create success and rollback after membership/default failure.
5. Member add duplicate/race, unknown email, invalid role, owner protection, admin-on-admin restriction, and scoped member IDs.
6. Leave as owner and non-owner, including default-organization repair.
7. Delete authorization, cascade/default behavior, repeated delete, and last-organization behavior.
8. Concurrent `ensureDefaultOrganization` calls result in one valid default membership.

Current executable evidence covers explicit membership resolution, default fallback, outsider denial, malformed-ID rejection before PostgreSQL, missing-auth rejection, role enforcement, optional-context behavior, and connection release on failure. The legacy organizations suite passes against disposable PostgreSQL and proves selected-workspace persistence, non-member selection denial, and repair when a stored default is no longer a membership. The frontend uses one shared provider, exposes a compact selector only for multi-workspace users, persists selection, and clears tenant-scoped query caches on change. Four provider tests cover initialization, selection, first-workspace creation, and repair. The Phase 1 NestJS guard chain adds focused GraphQL operation tests plus 4 real-PostgreSQL context cases proving default membership, current-role re-read, outsider denial, and immediate denial after membership deletion. Contact mutation integration cases additionally reject a cross-tenant assignee, hide a foreign contact on update/delete, and confirm an owned delete exactly. A staging boundary rehearsal queried the same search under two valid memberships: the default organization returned zero rows and the explicitly selected temporary organization returned its single owned row.

The workspace-selector checkpoint implements `organizations`, `selectOrganization`, and `ensureDefaultOrganization` in `OrganizationsModule`. Four additional fresh-PostgreSQL cases prove membership/default projection, GraphQL-to-retained-REST interoperability, outsider denial without existence disclosure, CSRF rejection without mutation, and concurrent first-workspace creation producing exactly one organization, owner membership, and default. Three frontend adapter cases prove retained-shape mapping, CSRF mutation transport, and independent default-off `VITE_ORGANIZATION_READS_GRAPHQL` and `VITE_ORGANIZATION_MUTATIONS_GRAPHQL` rollback. Static consumer inspection found no shipped imports for the other nine organization-management adapters, so they remain on REST and are not claimed as implemented. `deleteOrganization` remains blocked on the cascade/default/audit contract.

The deployed selector gate passed on 2026-07-17. In the real frontend, each of two workspaces exposed only its own distinctive contact, selecting the second workspace persisted the server-side default across reload, and switching back restored the original tenant. The GraphQL trace paired the selection write with `POST /graphql`; the rollback trace used `GET /api/contacts` with the selected organization ID. The original default was restored, all temporary tenant/contact rows were removed, and a database query confirmed zero fixture residue.

The operation-specific selector gate passed on 2026-07-18 against GraphQL deployment `e038d431-84cf-466b-98fc-039465f28f69`. The real provider listed two current memberships through `organizations`, selected the second through CSRF-protected `selectOrganization`, retained it after reload, and returned that same default from repeated authenticated `ensureDefaultOrganization` calls. Disabling both selector flags then loaded the selected workspace through `GET /api/organizations`, switched back through `POST /api/organizations/21/select` (`200`), and retained the REST selection after reload without data repair. Cleanup returned zero fixture users, organizations, or memberships; temporary localhost CORS was removed; clean backend deployment `8007e7a6-c4d0-4b53-b51f-f98077be43a1` returned direct and proxied `readiness: ready`; and production was untouched.
