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

## Account data export

An authenticated account can download a versioned JSON export before leaving.
The export includes identity and membership records, personal lists, notes,
categories, whiteboards, and the client and commercial records belonging to
workspaces the account owns. Provider credentials, Stripe identifiers, signing
capabilities, public access tokens, webhook secrets, and file URLs are omitted.
The export also describes records that Itemize may retain for legal, financial,
fraud-prevention, and signature-evidence obligations.

## Account deletion and recovery

The account settings UI runs a server-authoritative preflight before accepting
a deletion request. Every blocking workspace is listed with a direct handoff:

- transfer or remove an owned workspace that still has other members;
- cancel any active workspace subscription;
- retain an account when an owned workspace contains signature evidence that
  cannot legally be deleted.

An eligible request requires the account email and current password. Itemize
then schedules deletion seven days later, invalidates every existing session,
prevents new password or provider sign-ins, stores only a hash of the recovery
capability, and emails the recovery link. If the email provider does not accept
that message, Itemize cancels the schedule and leaves the account active.
Recovery consumes that capability,
restores sign-in, and records an append-only lifecycle event. When the grace
period ends, a background worker rechecks all blockers before deleting owned
workspaces, memberships, integrations, pending jobs, personal content, and the
account. If a blocker appeared during the grace period, deletion is canceled
instead of removing data. Scheduled, recovered, canceled, and completed events
retain only a one-way email hash after the user row is gone.

## Workspace ownership allowance

Subscriptions remain workspace-scoped, while the highest live plan among the
workspaces a user owns sets that user's ownership allowance: Free permits one,
Solo permits three, and Studio permits unlimited workspaces. A newly created
workspace always starts on Free, so one paid workspace does not grant paid
features to the owner's other workspaces.

Creation serializes on the owner account before counting ownership, preventing
concurrent requests from exceeding the allowance. Ownership transfer applies
the incoming workspace's live plan before checking the recipient's resulting
count, then changes both roles atomically. Transferring a paid workspace keeps
its subscription with the workspace. Downgrades and expired trials do not
delete or hide existing workspaces; an over-limit owner cannot create or accept
another workspace until they upgrade or transfer ownership.

Password recovery, verification resend, password change, profile updates, data
export, and account deletion are owned by the GraphQL authentication lifecycle.
