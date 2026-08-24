# Core consumer wave GraphQL cutover contract

**Status:** Production consumer cutover complete

**Evidence date:** 2026-07-22

## Scope

This wave records the already-enabled production consumers for authentication, onboarding, organization selection, contacts, pipelines and deals, workspace categories/lists/notes/whiteboards, and the six approved analytics queries. It promotes 68 legacy-route ledger rows to `consumer-cutover-complete` without changing runtime flags or data.

The three unresolved analytics definitions remain outside this wave: conversion rates require a canonical contact lifecycle, revenue trends require an approved booked-versus-collected and currency policy, and pipeline velocity requires either transition history or an explicitly renamed open-deal-age contract. Organization CRUD, membership administration, sharing, canvas positioning, CSV transfer, and other retained protocol boundaries also remain outside this status promotion.

## Production evidence

Railway confirms every associated frontend switch is `true`. The active deployments are legacy backend `ca7cbc74-3fa3-4201-8653-9759949b612f`, GraphQL `352bc5f6-bdf9-4a1b-b18c-51768342c9a3`, and frontend `b37a87c5-a28e-4981-885f-40401f679fc2`.

An authenticated production Chrome session loaded `/dashboard`, `/contacts`, `/pipelines`, and `/canvas`. Each surface rendered its authoritative empty state without console errors. Nest observability recorded successful zero-error `RefreshSession`, `CurrentUser`, `OnboardingProgress`, `Organizations`, `DashboardAnalytics`, `CommunicationStats`, `ContactReads`, `PipelineReads`, `WorkspaceLists`, `WorkspaceNotes`, and `WorkspaceWhiteboards` operations from those navigations. No create, update, delete, provider-delivery, or other side-effecting production operation was invoked.

The same checkpoint passes 338 frontend tests and 352 Nest unit tests; both production builds compile. Existing fresh PostgreSQL suites remain the mutation, tenancy, CSRF, rollback, and retained-REST interoperability evidence because this status-only wave does not alter executable code.

## Rollback

Rollback remains data-neutral and domain-scoped: set only the affected `VITE_*_GRAPHQL` switch to `false` and rebuild the frontend. Authentication session operations move as one unit. The retained HTTP protocols and Express handlers remain deployed until the final traffic-observation and retirement phase.
