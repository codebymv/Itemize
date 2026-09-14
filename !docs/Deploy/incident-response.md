# Incident response

Prepared September 14, 2026; not yet exercised in a tabletop or production incident. The responding Itemize maintainer acts as incident lead until an explicit handover. Paging recipients and coverage still need verification.

## Triage and evidence

Treat suspected cross-tenant exposure, credential compromise, incorrect charges or duplicate deliveries as urgent. Establish affected journeys and whether scope is one organization or the whole service.

Start a restricted record with UTC onset/detection times, affected journey, deployment IDs/commits, status codes, sanitized error signatures, queue counts/oldest age and provider event IDs. Name the lead and next update time. Keep credentials, cookies, webhook signatures, document bodies and recipient lists out of general notes. Preserve relevant logs promptly because provider retention is unverified.

## Containment

- Regression: follow [API recovery](production-api-restore.md). Check schema compatibility before rollback.
- Delivery loop: inspect Admin Operations and [ownership flags](runtime-and-worker-ownership.md). Pause the affected owner when justified, recording its prior value and backlog. A disabled scheduler may not stop request-triggered sends or in-flight work; inspect the source's entry points before declaring containment.
- Ambiguous accepted email: use Review delivery with verified provider evidence. Do not reset held jobs or resend without evidence. See the [recovery journey](../held-email-recovery-journey-2026-09-14.md).
- Credential/session compromise: identify affected credentials and access paths; coordinate revocation/rotation and session invalidation. Do not assume password reset invalidates existing JWTs. Platform-admin MFA is not currently implemented. Shared provider key changes can interrupt other applications and require explicit scope review.
- Data loss: stop destructive follow-up actions and preserve evidence. Backup/PITR is deferred; do not promise a restore point or run destructive repair scripts as diagnosis.

## Recovery and communication

Verify deployed revision, database readiness, a normal authenticated operation, the affected journey and queue progress. Reconcile external provider receipts with local state before retrying. Observe at least two normal worker cycles when scheduling is involved; an empty queue alone does not prove execution.

Record impact, mitigation, uncertainty and next update time. Customer/provider communications require maintainer approval and applicable organizational/legal review; this procedure does not authorize sending notices. Do not speculate about exposure or recovery deadlines.

## Closure and drill

Record timeline, evidence, cause, mitigation, verification and follow-up owners/dates. Document accepted residual risks. A first tabletop should cover an accepted email with a missing receipt and a failed migration deployment: locate logs, identify the owner, explain safe recovery and demonstrate that no duplicate send or incompatible rollback is proposed. Record actual drill results separately; this document is preparation, not completion evidence.
