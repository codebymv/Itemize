# Activation funnel

## Production event

The first commercial activation event is `artifact_sent`. It is written only
after the delivery provider accepts an invoice, estimate, or initial signature
request. UI clicks and queued deliveries do not count.

Events are organization-scoped, idempotent per artifact, and contain no client
names, email addresses, phone numbers, document bodies, or provider tokens.
Telemetry persistence is best-effort and must never fail the delivery itself.

## Funnel joins

The existing product tables provide the leading indicators:

- organization creation or trial start
- first contact creation
- first invoice, estimate, or signature document creation
- first provider-confirmed `activation_events.event_name = 'artifact_sent'`
- active paid subscription after the first send

The first-send timestamp for an organization is:

```sql
SELECT organization_id, MIN(occurred_at) AS first_artifact_sent_at
FROM activation_events
WHERE event_name = 'artifact_sent'
GROUP BY organization_id;
```

Do not use feature-page visits as activation. The next instrumentation slice is
an `artifact_advanced` event for recipient view, acceptance, signature
completion, or payment, followed by an authenticated return-after-send metric.

## Background entitlement contract

Paid background work is selected and claimed only when the organization has a
paid plan label and either an active subscription or an unexpired trial. A
cancellation, unpaid state, expired trial, or downgrade to Free leaves queued
work durable but suspended so it can resume after legitimate reactivation.

Recipient completion notices remain deliverable after cancellation. They are
part of completing an obligation already sent, not starting new paid work.
