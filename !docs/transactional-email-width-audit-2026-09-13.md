# Transactional email width audit - September 13, 2026

The shared email layout allowed long, unbroken organization names, calendar names and document references to determine the width of its presentation tables. In Chrome previews, the long booking fixtures expanded to 878 px and the long heading/reference fixture to 1,433 px, including at a 320 px viewport. Normal booking and CTA fixtures fit.

The shared renderer now uses fixed table layout for its outer and card tables and allows long text to wrap. Wrapping is also set on the card itself so it survives removal of body-level styles. Brand colors, typography, spacing, content and link destinations are preserved. This affects future rendered messages; existing queued snapshots and delivered messages are unchanged.

## Reproduce

From the repository root:

```sh
npm run build:graphql
node backend/scripts/preview-transactional-emails.cjs
```

Open http://127.0.0.1:5188 in a browser. Stop the server with Ctrl+C. The server binds only to loopback, uses synthetic fixtures with stubbed database calls, and never sends email. Logo images use the normal public asset origin.

The harness renders eight fixtures (three booking lifecycle messages with normal and long data, plus normal and long shared CTA cards) at 320, 375, 390 and 600 px. It repeats those fixtures after stripping the outer body and head to exercise loss of body styles. All 64 frames must load before reading the result. The result measures document horizontal overflow; visual inspection remains necessary for clipping and appearance.

## Results

- Before the fix: 16 of the initial 32 full-document cases overflowed.
- After the fix: zero horizontal-overflow failures across 64 full-document/body-stripped cases.
- Chrome screenshots confirmed normal cards retained the shared branded design and long names/contact addresses wrapped without truncation.
- Seven existing tests passed across booking notifications and the shared renderer; backend build and environment contract check passed.
- Preview script syntax and changed-file whitespace checks passed.

## Coverage boundary

These are local Chromium rendering checks using the actual compiled renderers. They do not establish Gmail iOS/Android, Apple Mail, classic Outlook or forced-dark-mode compatibility. Prior production Gmail desktop evidence is recorded in estimate-booking-email-hardening-2026-09-13.md. Actual mobile/other-client checks remain outstanding. No production data was changed or QA mail sent during this pass. The wrapping fix has not been deployed by this pass.
