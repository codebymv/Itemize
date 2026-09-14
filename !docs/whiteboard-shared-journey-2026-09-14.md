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

- Deploy this correction and repeat a populated production QA journey.
- Actual Gmail mobile, Apple Mail, and Outlook rendering needs those clients or a connected email-rendering service. Available browser controls expose Chrome only. Browser responsive previews are not native mail-client evidence.
- Check long titles, buttons, logo, footer, dark mode, and long unbroken values in each actual client; record client/version and screenshots before marking the email-client matrix complete.

The disposable local drawing remains available; its share link is revoked. SMS and backup/PITR remain outside this pass.
