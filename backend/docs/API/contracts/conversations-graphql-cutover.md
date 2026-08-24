# Unified inbox conversations GraphQL cutover

**Status:** Implemented and consumer-cutover complete

**Evidence date:** 2026-07-24

## Decision

The authenticated unified inbox is owned by `ConversationsModule` in NestJS and consumed directly through GraphQL. Its seven former Express operations are removed:

| Former HTTP operation | GraphQL operation |
| --- | --- |
| `GET /api/conversations` | `conversations` |
| `GET /api/conversations/:id` | `conversation` |
| `POST /api/conversations` | `createConversation` |
| `PATCH /api/conversations/:id` | `updateConversation` |
| `POST /api/conversations/:id/assign` | `assignConversation` |
| `POST /api/conversations/:id/messages` | `sendConversationMessage` |
| `PATCH /api/conversations/:id/read` | `markConversationRead` |

This slice owns the internal conversation and message records used by the authenticated Inbox page. It does not claim provider delivery. Email, SMS, social-provider, and public chat-widget protocols keep their independently documented boundaries.

## Authorization and tenancy

Every operation requires an authenticated, current organization membership selected through the canonical GraphQL organization context. Client body fields are never tenant authority.

- Conversation list, detail, update, assignment, send, and read state are qualified by `organization_id`.
- Create accepts only a contact from the active organization.
- Assignment accepts only a current member of the active organization; null explicitly unassigns.
- Foreign and absent conversation/contact identifiers return tenant-private `NOT_FOUND`.
- Detail message joins and mark-read writes include the organization predicate, preventing a guessed foreign conversation ID from exposing or mutating messages.
- Every mutation requires the shared GraphQL CSRF contract.

## State and concurrency

Statuses are `open`, `closed`, and `snoozed`. Snoozing requires an explicit timestamp. Moving to another status clears the snooze timestamp. A new internal message reopens a snoozed conversation and clears its snooze timestamp.

Creation locks the organization-owned contact before checking for an existing open conversation. Concurrent create requests for the same contact therefore return one authoritative open conversation rather than creating duplicate threads. An optional initial message is inserted in the same transaction.

Message persistence, conversation preview/timestamp updates, assignment, state updates, and mark-read behavior are transactional. Mark-read locks and verifies the tenant-owned conversation before changing message rows or the aggregate unread count.

Paging is bounded to 100 rows and ordered deterministically by latest message, creation time, and ID. Filters support status, assignee, and contact. User-authored text and JSON metadata have explicit size and shape bounds.

## Consumer contract

`frontend/src/services/conversationsApi.ts` is a direct GraphQL adapter with no REST flag or fallback. GraphQL aliases retain the existing snake-case service shapes so the Inbox page needs no transport-aware changes. Organization selection remains the `x-organization-id` header supplied by the shared GraphQL client.

The former Express router and its column helper are deleted. Retained-backend integration coverage asserts all seven former paths return `404`.

## Evidence

- Nest and frontend production builds pass.
- Focused frontend adapter coverage passes 3/3.
- The disposable clean-schema gate passes 484/484 retained Express integration tests and 248/248 NestJS PostgreSQL tests across 62 suites.
- Conversation PostgreSQL coverage proves the full lifecycle, stable paging and joins, concurrent single-open creation, organization-owned contact and assignee validation, and fail-closed foreign mark-read behavior.
- The generated ledger has no unmatched or unresolved frontend calls after regeneration.

## Remaining adjacent work

The following are separate slices and remain outside this cutover:

- public and operator chat-widget configuration, sessions, and messages;
- social channel OAuth, provider conversations, messages, and analytics;
- provider-backed email/SMS delivery and callbacks;
- Socket.IO chat capability transport.
