# Account and organization lifecycle

## Ownership transfer contract

An organization owner may transfer ownership only to an existing, joined member
of the same organization. The transfer is one atomic database operation:

- the selected member becomes `owner`;
- the former owner remains in the organization as `admin`;
- a non-owner cannot initiate the transfer;
- a pending or unknown member cannot receive ownership;
- the database permits at most one owner membership per organization.

The settings UI requires an explicit confirmation and explains the former
owner's resulting role. Ownership transfer is the required handoff before an
owner can leave a workspace or later delete an account without deleting the
organization.

## Existing organization lifecycle

- Owners and administrators can manage joined members within the plan's seat
  limit; administrators cannot manage peer administrators.
- Non-owner members may leave and their default organization selection is
  repaired to another membership when available.
- Only owners may delete an organization.
- Organizations containing non-draft signature evidence cannot be deleted.
- Signature files associated with a deletable organization are queued for
  durable object-storage cleanup before the organization row is removed.

## Invitation lifecycle

Owners and administrators can invite a person by email as an administrator,
member, or viewer, subject to the same peer-administrator rules as direct
member management. An active pending invitation reserves one plan seat so a
workspace cannot overbook its limit while recipients decide whether to join.

Invitation links are seven-day, single-use capabilities. Only a SHA-256 hash
of the capability is stored. Acceptance requires an authenticated, verified
account whose normalized email exactly matches the invited address; acceptance
then atomically creates the membership, consumes the capability, and selects
the invited organization as the account's default workspace.

Recipients without an account can register from the invitation page. The
capability is preserved through email verification and accepted immediately
after verification. Resending rotates the capability and expiry, and revoking
an invitation releases its reserved seat. The organization settings UI shows
pending and expired invitations with delivery, resend, and revoke controls.

## Remaining account lifecycle work

1. Provide a user data export covering identity, memberships, workspace data,
   client records, commercial artifacts, and retained-record disclosures.
2. Add account deletion with recent-authentication confirmation, owned-workspace
   preflight, ownership-transfer guidance, subscription cancellation handling,
   and explicit retention outcomes.
3. Resolve the plan-language conflict between organization-scoped subscriptions
   and the Solo plan's advertised three-organization allowance before enforcing
   an organization creation limit.

Password recovery, verification resend, password change, and profile updates
are already owned by the GraphQL authentication lifecycle and are not part of
this remaining organization work.
