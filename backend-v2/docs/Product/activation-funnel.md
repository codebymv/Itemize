# Activation funnel

## Production events

The first commercial activation event is `artifact_sent`. It is written only
after the delivery provider accepts an invoice, estimate, or initial signature
request. UI clicks and queued deliveries do not count.

Events are organization-scoped, idempotent per artifact, and contain no client
names, email addresses, phone numbers, document bodies, or provider tokens.
Telemetry persistence is best-effort and must never fail the delivery itself.

`artifact_advanced` is the downstream value signal. It is written only from
authoritative server transitions and is idempotent per artifact and stage:

- a public signature session records `viewed`;
- a valid public signing submission records `signed`;
- a public estimate session records `viewed`;
- an explicit public estimate approval records `accepted`;
- a verified Stripe invoice checkout that changes the invoice to paid records
  `paid`.

Estimate declines update the estimate lifecycle for owner visibility but do not
count as downstream activation. Estimate view and acceptance events come only
from a valid, unexpired recipient capability; authenticated owner conversion is
not treated as recipient acceptance.

`returned_after_send` is recorded once per organization by an authenticated
dashboard analytics load at least 24 hours after the first provider-confirmed
send. The delay avoids counting mutation refetches and same-session browsing as
retention.

## Funnel joins

The existing product tables provide the leading indicators:

- organization creation or trial start
- first contact creation
- first invoice, estimate, or signature document creation
- first provider-confirmed `activation_events.event_name = 'artifact_sent'`
- recipient/payment `artifact_advanced` after the first send
- authenticated `returned_after_send` after the first send
- active paid subscription with a recorded trial whose end followed the first
  send

The first-send timestamp for an organization is:

```sql
SELECT organization_id, MIN(occurred_at) AS first_artifact_sent_at
FROM activation_events
WHERE event_name = 'artifact_sent'
GROUP BY organization_id;
```

Do not use feature-page visits as activation. Administrators can query
`adminActivationFunnel(days: Int)` for a bounded signup cohort (default 30
days). Rates use explicit denominators: sends/signups, advances/sends,
returns/sends, and trial-to-paid/activated trials. Trial conversion requires a
server-recorded trial bounds plus current active billing, and the trial must end
after the first send. A direct paid signup is not mislabeled as a trial
conversion.

Public estimate links store only a token hash, expire at the end of the quoted
validity date, and render the immutable delivery snapshot. A successful resend
revokes older links. Public responses are terminal and serialized under a row
lock, so accept and decline cannot overwrite one another.

## Background entitlement contract

Paid background work is selected and claimed only when the organization has a
paid plan label and either an active subscription or an unexpired trial. A
cancellation, unpaid state, expired trial, or downgrade to Free leaves queued
work durable but suspended so it can resume after legitimate reactivation.

Recipient completion notices remain deliverable after cancellation. They are
part of completing an obligation already sent, not starting new paid work.
