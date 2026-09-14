# Populated whiteboard and shared-page journey

## Scope and findings

Local QA workspace on localhost:5173 with a local PostgreSQL database. Production was not modified. Created a clearly named QA whiteboard and drew strokes through the UI.

Drawing on the desktop canvas reproduced a maximum-update-depth failure. The parent optimistically updates the whiteboard and creates a new save callback on each render. WhiteboardCanvas's persistence effect depended on that callback: its cleanup flushed the still-pending drawing again, triggering another parent update. The correction retains the latest save handler in a ref while keeping the persistence callback and cleanup subscription stable.

The phone palette also overflowed its card. It now wraps within the available width. The brush-size control has an accessible group label.

## Verification

- Drawing, autosave, then changing from 1024px to 375px completed without the original update loop after the correction; saved strokes remained visible in Contents.
- At 375px, all ten palette buttons fit inside the whiteboard, wrapping onto two rows. No document horizontal overflow.
- Created a local share link. The populated drawing and long title rendered at 375px and 768px; the public view showed read-only controls. At 768px the drawing surface was 650px wide and document scrollWidth was 758px.
- Revoked the local link and reopened it: the page showed "Shared item unavailable" and no drawing.
- Five focused frontend suites passed, 115 tests: autosave regression, canvas-data normalization, whiteboard GraphQL mutations, ShareModal, and visual-language contracts.
- Frontend production build and bundle budgets passed.

The autosave regression holds a request open while the parent replaces onSave and verifies that no duplicate save is started, the saved state appears after completion, and unmount does not resend the drawing.

The local API stopped during the session. Restarted it with the explicit local environment file and delivery jobs disabled. A stale Vite module fetch also required reload; neither is counted as the original autosave regression. No dependency change was required for the fix.

## Remaining evidence

- Production verification completed below.
- Actual Gmail mobile, Apple Mail, and Outlook rendering needs those clients or a connected email-rendering service. Available browser controls expose Chrome only. Browser responsive previews are not native mail-client evidence.
- Check long titles, buttons, logo, footer, dark mode, and long unbroken values in each actual client; record client/version and screenshots before marking the email-client matrix complete.

The disposable local drawing remains available; its share link is revoked. SMS and backup/PITR remain outside this pass.

## Production verification — 2026-09-14 07:51–07:54 UTC

CI run 34817434279 passed on 245dfbbc. Railway frontend deployment 3737aff6-ada1-4e82-95e2-5c6a45867986 and API deployment 54ef03e5-e02a-4de1-be6a-f5979d16b016 both report SUCCESS on that commit. API readiness, frontend HTML and its current entry asset returned 200; an unsigned billing webhook returned 400.

Created "QA launch verification 2026-09-14 — whiteboard save and sharing" in the existing Itemize Account Features QA account. Drew a stroke at 1024px, observed autosave settle, reloaded, and compared the rendered SVG path: identical. Switched to 375px, where Contents showed the saved stroke without an error. Document scrollWidth was 375px; all ten palette buttons wrapped inside the card in two rows.

Generated a temporary share link. The public page visibly displayed the QA drawing, long title, creator, Live status and Read only label. At 375px document scrollWidth was 365px; at 768px it was 758px and the drawing surface was 650px wide. These are browser viewport checks, not physical touch-device tests.

Revoked sharing from the owner dialog. The already-open public page immediately removed the drawing and displayed "Shared item unavailable". Reloading still showed unavailable. The QA drawing remains private for follow-up; the temporary share link is revoked. No email, SMS, payment, signature or customer-facing business document was sent. QA tabs were closed after testing.
