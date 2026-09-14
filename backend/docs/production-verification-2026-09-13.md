# Production verification — September 13, 2026

## Deployment and responsive checks

The initial responsive release (36af07a6) was blocked by a subscription-email test that pinned the previous shared HTML bytes. Commit d367ac86 replaced that assertion with checks for message content, escaping, identity, and the shared responsive layout. All 207 backend suites / 1,021 tests passed. CI and both Railway services subsequently deployed d367ac86 successfully.

Production checks on that release passed for API readiness, frontend and entry asset availability, and rejection of unsigned billing webhooks. The dashboard fit a 375px viewport. The invoice editor stacked at 1024px with an expanded sidebar and split with the sidebar collapsed; it also stacked on a phone. No invoice was changed or sent.

The tablet canvas check exposed a remaining regression: a viewport-wide, viewport-height child extended under the sidebar and below the available content area, clipping zoom controls. The correction makes the shell allocate the remaining height after its header and trial banner, and makes the canvas fill that space.

Local rendered checks with the correction:

- At 768×900, expanded sidebar and trial banner: canvas bounds x=256–768, y=148–900; zoom buttons remain inside the viewport.
- At 768×900 with collapsed sidebar: canvas bounds x=64–768; zoom toolbar ends at y=884.
- At 1024×900, expanded sidebar and trial banner: canvas bounds x=256–1024, y=128–900.
- At 375×812, the dashboard has no document horizontal overflow and its content area scrolls successfully with the trial banner visible.

## Remaining release evidence

- Verify this canvas correction after its production deployment.
- Check actual Gmail mobile, Apple Mail, and Outlook rendering. Browser email previews and desktop delivery do not establish those clients' behavior.
- Exercise populated whiteboards and shared pages at phone/tablet widths; the production QA canvas was empty in this check.
- Consolidate outstanding operational and customer-journey evidence against the launch audit before declaring launch readiness.

SMS and backup/PITR restoration remain outside this pass, as requested.
