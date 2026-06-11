# Gleam-Inspired Marketing Audit And Gap Analysis

## Executive Summary

Itemize has the underlying product surface to support a stronger public marketing experience: CRM, pipelines, bookings, automations, workspaces, chat widget, invoicing, and documents already exist in the app. The public marketing page currently presents those modules, but it does not yet convert visitors through a live sales/support path, use clear proof points, or frame the product around specific buyer scenarios as directly as `gleamai.dev`.

The most important gap is the missing first-party marketing chat launcher. Gleam implements this as a lightweight public assistant with a bottom-corner launcher, a short-lived ask token, and a scope-limited marketing knowledge prompt. Itemize should mirror that pattern for public education and sales intent, while keeping the existing embeddable chat widget as a separate customer-facing product feature.

## Gleam Patterns Worth Borrowing

- Persistent bottom-corner assistant: Gleam keeps an "Ask about Gleam" entry point available throughout the page.
- Outcome-led hero: Gleam leads with a specific operating outcome, not a generic feature list.
- Multiple conversion paths: Try free, demo, and sales contact all appear near high-intent sections.
- Proof sections: Gleam gives buyers concrete reasons to believe the product works, including telemetry, integrations, and compliance.
- Use-case clarity: The page repeatedly connects capabilities to lead response, inbound handling, CRM sync, and agencies.
- Product surface previews: Screenshots and interface fragments reinforce that the product is real and shipped.

## Itemize Current-State Inventory

Public marketing files:

- `frontend/src/pages/Home.tsx`
- `frontend/src/components/LandingNav.tsx`
- `frontend/src/components/Footer.tsx`

Existing chat widget infrastructure:

- `frontend/public/widget.js`
- `frontend/src/pages/chat-widget/ChatWidgetPage.tsx`
- `frontend/src/services/chatWidgetApi.ts`
- `backend/src/routes/chat-widget.routes.js`
- `backend/src/routes/chat-widget/public.routes.js`
- `backend/src/routes/chat-widget/sessions.routes.js`
- `backend/src/routes/chat-widget/management.routes.js`

Existing public chat endpoints:

- `GET /api/chat-widget/public/config/:widgetKey`
- `POST /api/chat-widget/public/session`
- `GET /api/chat-widget/public/messages/:sessionToken`
- `POST /api/chat-widget/public/messages`
- `POST /api/chat-widget/public/end-session`

New marketing assistant endpoints:

- `GET /api/marketing-chat/token`
- `POST /api/marketing-chat/ask`

## Gap Matrix

| Priority | Gap | Impact | Effort | Affected Files |
| --- | --- | --- | --- | --- |
| P0 | Public marketing chat launcher | Converts high-intent visitors into product education and sales intent | Medium | `frontend/src/components/marketing/MarketingChatLauncher.tsx`, `frontend/src/App.tsx`, `backend/src/routes/marketing-chat.routes.js`, `backend/src/services/marketingChatService.js` |
| P0 | "Talk to Sales" CTA path | Gives buyers a direct non-trial path | Low | `frontend/src/pages/Home.tsx`, `frontend/src/components/LandingNav.tsx` |
| P1 | Visible trust/security section | Helps buyers evaluate risk before starting trial | Low | `frontend/src/pages/Home.tsx` |
| P1 | Use-case/industry section | Makes Itemize feel tailored to agencies, consultants, service businesses, and small teams | Medium | `frontend/src/pages/Home.tsx`, possible new home components |
| P1 | Product proof/metrics section | Replaces generic feature claims with defensible product facts | Medium | `frontend/src/pages/Home.tsx` |
| P2 | Richer interactive product surface | Makes the page feel closer to a working demo | High | `frontend/src/pages/home/components/*` |
| P2 | Footer/contact credibility | Improves trust and support discoverability | Low | `frontend/src/components/Footer.tsx` |

## P0 Roadmap

1. Add a first-party React marketing chat launcher that matches Gleam's bottom-corner assistant pattern.
2. Use `GET /api/marketing-chat/token` and `POST /api/marketing-chat/ask` for a scoped Gemini-backed marketing assistant. Do not require `VITE_MARKETING_CHAT_WIDGET_KEY`.
3. Mount the launcher only on public marketing/support pages: `/home`, `/status`, and `/help/*`.
4. Add `Talk to Sales` CTAs that open the launcher with a preselected prompt.
5. Use `VITE_MARKETING_CHAT_ENABLED=false` only as an explicit kill switch.
6. Keep the assistant scope-limited to Itemize product, pricing direction, setup, trust, and sales handoff questions.

## P1 Roadmap

1. Rebuild the commented-out trust section with real Itemize claims only:
   - Secure authentication
   - Role-aware organization data
   - PostgreSQL persistence
   - Encrypted vaults
   - HTTPS in production
   - Rate limiting and CSRF protection
2. Add a use-case section for:
   - Agencies
   - Consultants
   - Service businesses
   - Small teams
3. Add a product proof strip using defensible facts:
   - CRM, bookings, automations, chat widget, invoices, documents, and workspaces in one app.
   - Public sharing and public chat endpoints already implemented.
   - Existing integrations include Google Calendar, Stripe, Twilio, Resend, and webhook automation where configured.

## P2 Roadmap

1. Add an interactive product surface section with tabs:
   - Dashboard
   - Contacts
   - Pipelines
   - Automations
   - Workspaces
   - Chat Widget
2. Improve footer credibility:
   - Visible support email
   - Terms and privacy links
   - Product links
   - Social links that reflect current brand accounts

## Acceptance Criteria

- The audit document exists and ranks marketing gaps by impact and effort.
- Public marketing pages can show a bottom-corner `Ask about Itemize` launcher.
- A visitor can ask a question directly without creating an embeddable chat-widget session.
- The marketing chat endpoint returns a Gemini-backed, scope-limited Itemize answer when `GEMINI_API_KEY` is configured.
- `Talk to Sales` CTAs open the launcher.
- `VITE_MARKETING_CHAT_ENABLED=false` hides the launcher.
- Auth, shared, signing, and authenticated app routes do not show the marketing launcher.

## Screenshots And Manual QA Checklist

- Desktop `/home`: launcher appears without a widget key.
- Mobile `/home`: launcher panel fits within the viewport and respects safe-area spacing.
- `/status`: launcher appears.
- `/help`: launcher appears.
- `/login`: launcher does not appear.
- `/register`: launcher does not appear.
- `/shared/list/:token`: launcher does not appear.
- `/sign/:token`: launcher does not appear.
- Authenticated `/dashboard`: launcher does not appear.
- Ask a test question and confirm `POST /api/marketing-chat/ask` returns a scoped Itemize answer.
- Temporarily remove or disable `GEMINI_API_KEY` and confirm the launcher shows the fallback assistant reply.

## Implementation Notes

Do not copy Gleam-only claims such as sub-100ms responses, language counts, or specific conversion multipliers unless Itemize has evidence for them. Use Itemize's shipped capabilities and actual integrations as the basis for claims.
