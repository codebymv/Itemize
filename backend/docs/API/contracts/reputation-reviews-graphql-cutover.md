# Reputation reviews GraphQL cutover contract

**Status:** Implemented at dual parity behind `VITE_REPUTATION_REVIEWS_GRAPHQL`

**Evidence date:** 2026-07-21

## Decision

The five authenticated review-management operations move to `ReputationReviewsModule`: `reputationReviews`, `reputationReview`, `createReputationReview`, `updateReputationReview`, and `deleteReputationReview`. Platform connection, review-request delivery, widgets, settings, analytics, and public collection remain separate future slices.

Reviews are organization-owned records. Every operation requires the canonical selected-organization context, and foreign IDs return a non-enumerating miss or validation failure. Joined platform and contact projections qualify both the referenced ID and organization, so a corrupt cross-tenant foreign key cannot disclose names, email, or review URLs.

## Reads

The list accepts optional platform, one-to-five rating, status, sentiment, and literal reviewer-name/review-text search filters. `all` means no platform/status/sentiment filter for compatibility with the existing client. Pages are bounded to 100 rows, count and rows share one read-only repeatable-read snapshot, and ordering is `review_date DESC, id DESC`. Detail returns the same canonical projection plus platform and contact display fields. IDs, pages, choices, and a 200-character search bound fail with `BAD_USER_INPUT` before SQL.

## Manual create

Manual create accepts a known platform or defaults to `custom`, a required integer rating from one through five, bounded nullable content and reviewer identity, an optional organization-owned platform/contact, and an optional ISO timestamp. A supplied platform connection is locked and determines the authoritative platform; an explicit conflicting platform fails closed. Sentiment derives deterministically from rating (`4-5 positive`, `3 neutral`, `1-2 negative`), source is server-owned `manual`, and the insert plus reference validation is one transaction.

## Update and response state

Updates are partial, reject an empty patch, and lock the organization-owned review before merging. Concurrent disjoint patches therefore compose. Status choices are `new`, `read`, `responded`, `flagged`, and `hidden`; a linked contact must belong to the same organization and explicit null clears it.

A non-empty response atomically sets status `responded`, the response timestamp, and the authenticated responder. Contradictory explicit status fails validation. Clearing the response also clears responder metadata and changes an otherwise still-responded record to `read`; explicitly requesting `responded` without text fails closed. Internal notes and response text are bounded to 10,000 characters.

## Deletion and rollback

Delete is organization-qualified and returns the exact deleted ID; foreign and repeated deletion are private `NOT_FOUND` results. Every mutation requires double-submit CSRF. The existing REST adapter remains available as a data-neutral rollback path while the single frontend flag is false.

## Evidence and exit gate

Fresh PostgreSQL proves verified tenant context, CSRF, tenant-qualified platform/contact joins, manual create and sentiment, REST readback, bounded compound filtering, private foreign detail, concurrent partial-update composition, coherent response clearing, foreign platform/contact rejection, stable delete identity, and final private miss. Focused frontend tests prove the default-off switch, filter/page/organization variables, casing and nullable mapping, mutation CSRF/input mapping, and delete identity. Production requires explicit GraphQL deployment, flag enablement, and an authenticated Reputation page smoke before these ledger rows become `consumer-cutover-complete`.
