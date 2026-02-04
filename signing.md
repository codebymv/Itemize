# Signing / E-Signature Feature Plan (DocuSign-style)

This document captures a comprehensive plan for adding a “Signatures / Documents / Envelopes” feature that mirrors DocuSign-style flows. It reuses existing invoice sending, PDF, file upload, and public-access patterns already in the codebase.

## Goals (DocuSign-aligned)
- Upload a document (PDF initially) and preserve exact layout fidelity.
- Place signature/initials fields (plus core field types) via drag-and-drop.
- Send signing links to recipients with optional identity verification.
- Allow recipients to sign without an account while preserving audit integrity.
- Track status and produce a final signed PDF with a complete audit trail.
- Protect document integrity with tamper-evident metadata and hashing.

## Existing patterns to reuse
- **Invoice send flow**: `backend/src/routes/invoices.routes.js` uses email delivery and status updates.
- **Email service**: `backend/src/services/email.service.js` (Resend + branded templates).
- **PDF service**: `backend/src/services/pdf.service.js` (Puppeteer-based PDF generation).
- **File uploads**: Multer + S3 in `backend/src/routes/invoices.routes.js` and `backend/src/services/s3.service.js`.
- **Public access token patterns**: sharing endpoints in `backend/src/routes/sharing.routes.js` and booking public endpoints in `backend/src/routes/bookings.routes.js`.
- **Subscription gating**: `backend/src/middleware/subscription.js`, `backend/src/config/features.js`, and frontend feature gating in `frontend/src/lib/subscription.ts`.

## Additional implementation context from the codebase
- **Public endpoints pattern**: The app already exposes unauthenticated endpoints under `/api/public/*` with `publicRateLimit` middleware for safety, as seen in [backend/src/routes/bookings.routes.js](backend/src/routes/bookings.routes.js) and [backend/src/routes/forms.routes.js](backend/src/routes/forms.routes.js). The signing flow should follow the same structure (`GET /api/public/sign/:token`, `POST /api/public/sign/:token`).
- **Token creation and sharing flow**: The sharing routes generate tokens with `crypto.randomUUID()` and store them in the database, then construct a frontend URL for the recipient. This is a direct pattern to copy for signing links. See [backend/src/routes/sharing.routes.js](backend/src/routes/sharing.routes.js).
- **Sanitization for public content**: Shared content is sanitized using server-side DOMPurify to prevent XSS for public views. The signing public responses should use the same approach for any user-provided content shown to recipients. See [backend/src/routes/sharing.routes.js](backend/src/routes/sharing.routes.js).
- **Email delivery + branded templates**: The email service uses Resend and wraps content in a branded template system with inline styles for client compatibility. Signature request and completion emails should reuse this flow. See [backend/src/services/email.service.js](backend/src/services/email.service.js) and [backend/src/services/email-template.service.js](backend/src/services/email-template.service.js).
- **Invoice send flow details**: Invoice sending validates status, generates a PDF attachment (Puppeteer), and updates status/timestamps in a single transaction-like flow. This is a good baseline for signature sending (send + status + timestamps). See [backend/src/routes/invoices.routes.js](backend/src/routes/invoices.routes.js).
- **PDF generation capabilities**: The PDF service already includes image normalization and data URL conversion for embedding assets. This can be reused for applying signature images and stamping signer data into the final PDF. See [backend/src/services/pdf.service.js](backend/src/services/pdf.service.js).
- **File upload strategy**: The invoice routes set up Multer to use in-memory storage when S3 is available, and disk storage as a fallback. The same strategy should be applied to uploaded documents for signing. See [backend/src/routes/invoices.routes.js](backend/src/routes/invoices.routes.js) and [backend/src/services/s3.service.js](backend/src/services/s3.service.js).
- **Frontend modal + preview patterns**: The invoice editor uses a Send modal, preview toggles, and “compose then send” workflow. This UI pattern can be reused for the “Send for Signature” step. See [frontend/src/pages/invoices/InvoiceEditorPage.tsx](frontend/src/pages/invoices/InvoiceEditorPage.tsx).
- **Public UI structure**: Public pages already follow a lightweight layout with minimal auth dependencies. The signing page should follow the same “public page” architecture style used by shared pages and booking pages.

## Proposed feature name + navigation
- Sidebar item: **Documents** or **Signatures**.
- Routes:
  - `/signatures` list page (authenticated).
  - `/signatures/new` create flow (upload + field placement + recipients).
  - `/sign/:token` public signing page.

## Data model (proposed)
### `signature_documents`
- `id`, `organization_id`, `title`, `document_number`
- `description`, `file_url`, `file_name`, `file_size`, `file_type`
- `status`: `draft | sent | in_progress | completed | cancelled | expired`
- `message`, `expiration_days`, `expires_at`
- `sender_name`, `sender_email`, `created_by`
- `sent_at`, `completed_at`
- `signed_file_url`
- `original_sha256`, `signed_sha256`
- `timezone`, `locale`

### `signature_recipients`
- `id`, `document_id`, `organization_id`, `contact_id`
- `name`, `email`, `signing_order`
- `signing_token` (public access token)
- `status`: `pending | sent | viewed | signed | declined`
- `sent_at`, `viewed_at`, `signed_at`, `declined_at`, `decline_reason`
- `ip_address`, `user_agent`
- `identity_method`: `none | email_otp | sms_otp`
- `identity_verified_at`

### `signature_fields`
- `id`, `document_id`, `recipient_id`
- `field_type`: `signature | initials | text | date | checkbox`
- `page_number`, `x_position`, `y_position`, `width`, `height` (percent-based)
- `label`, `is_required`, `value` (filled after signing)
- `font_size`, `font_family`, `text_align`, `locked`

### `signature_audit_log`
- `id`, `document_id`, `recipient_id`
- `event_type`, `description`
- `ip_address`, `user_agent`, `created_at`
- `metadata` (JSON, e.g. hash, geo, device)

### `signature_documents_versions` (optional, hardened)
- `id`, `document_id`, `version_number`
- `file_url`, `file_name`, `file_size`, `file_type`
- `original_sha256`
- `created_at`, `created_by`

## API (proposed)
### Authenticated
- `POST /api/signatures/documents` create draft
- `POST /api/signatures/documents/upload` upload PDF (S3/local)
- `GET /api/signatures/documents` list with filters
- `GET /api/signatures/documents/:id` details + recipients + fields + audit
# E-Signatures (Signatures) — Implementation Review, Gaps, and Follow‑ups

This document captures the current state of the implemented signatures feature, highlights gaps, and lists concrete follow‑ups to make the feature production‑robust.

## Implemented scope (current)

### Backend
- **Routes**: Full signatures API and public signing endpoints in [backend/src/routes/signatures.routes.js](backend/src/routes/signatures.routes.js).
- **Core logic**: Token generation, document lifecycle, recipients, fields, audit in [backend/src/services/signature.service.js](backend/src/services/signature.service.js).
- **PDF signing**: Final signed PDF + certificate page via pdf-lib in [backend/src/services/pdf-signature.service.js](backend/src/services/pdf-signature.service.js).
- **Email**: Request, reminder, completion, decline in [backend/src/services/signature-email.service.js](backend/src/services/signature-email.service.js).
- **DB schema**: Documents, recipients, fields, audit logs, templates, reminders, versions in [backend/src/db_esignature_migrations.js](backend/src/db_esignature_migrations.js).
- **Reminders**: Scheduled reminder job in [backend/src/jobs/signature-jobs.js](backend/src/jobs/signature-jobs.js), invoked in scheduler.
- **Feature gating**: SIGNATURE_DOCUMENTS feature + limits in [backend/src/lib/subscription.constants.js](backend/src/lib/subscription.constants.js).

### Frontend (authenticated)
- **Documents list**: [frontend/src/pages/signatures/SignaturesPage.tsx](frontend/src/pages/signatures/SignaturesPage.tsx).
- **Document editor**: [frontend/src/pages/signatures/SignatureEditorPage.tsx](frontend/src/pages/signatures/SignatureEditorPage.tsx).
- **Templates**: [frontend/src/pages/signatures/SignatureTemplatesPage.tsx](frontend/src/pages/signatures/SignatureTemplatesPage.tsx) and [frontend/src/pages/signatures/SignatureTemplateEditorPage.tsx](frontend/src/pages/signatures/SignatureTemplateEditorPage.tsx).
- **Field placement**: [frontend/src/pages/signatures/components/FieldPlacementCanvas.tsx](frontend/src/pages/signatures/components/FieldPlacementCanvas.tsx).
- **Routing**: [frontend/src/App.tsx](frontend/src/App.tsx) registers /signatures routes.

### Frontend (public signing)
- **Signing page**: [frontend/src/pages/sign/SignPage.tsx](frontend/src/pages/sign/SignPage.tsx) handles public signing and decline flows.

## Gaps observed (needs follow‑up)

### UX gaps
1. **No WYSIWYG PDF overlay**
  - Field placement canvas is a placeholder and does not render the actual PDF; placement is approximate. See [frontend/src/pages/signatures/components/FieldPlacementCanvas.tsx](frontend/src/pages/signatures/components/FieldPlacementCanvas.tsx).
2. **Public signer experience is form-based**
  - Signers fill fields in a list rather than directly on the PDF. See [frontend/src/pages/sign/SignPage.tsx](frontend/src/pages/sign/SignPage.tsx).
3. **Mobile signature capture**
  - Signature canvas is mouse‑only; touch and pressure handling are not implemented.
4. **No visual routing hints**
  - Sequential routing status is not surfaced in the UI for recipients or document owners.

### Product gaps
1. **Identity verification is a placeholder**
  - `/public/sign/:token/verify` returns a stub response; OTP flows aren’t implemented. See [backend/src/routes/signatures.routes.js](backend/src/routes/signatures.routes.js).
2. **Token lifecycle and expiry UX**
  - Expiration handling is enforced server‑side, but recipient UI doesn’t display timers or states like “expired”.
3. **No signer re‑assignment**
  - There’s no admin workflow to reassign or resend to a new recipient email.
4. **Limited bulk / CSV workflows**
  - No bulk send or import/export for signature recipients.

### Technical gaps
1. **PDF overlay accuracy and scaling**
  - Percent‑based coordinates are used, but no PDF page rendering is used to validate placement accuracy.
2. **Signed PDF download UX**
  - Download is URL‑based; there’s no inline viewer or embedded download experience.
3. **Audit log completeness**
  - Audit log exists, but there’s limited front‑end visualization for compliance review.
4. **Rate limit tuning for large signing payloads**
  - Payload size check exists, but limits may need tuning for large signatures and multi‑page docs.

## Follow‑ups to make the feature robust

### 1) PDF WYSIWYG placement
- Integrate a PDF viewer (e.g., react‑pdf or pdf.js) for **actual page rendering** in FieldPlacementCanvas.
- Use the viewer’s page dimensions to compute accurate percent‑based coordinates.
- Enable drag‑resize and move on the overlay so fields can be adjusted after placement.

### 2) Public signer overlay mode
- Replace the field list in [frontend/src/pages/sign/SignPage.tsx](frontend/src/pages/sign/SignPage.tsx) with a PDF overlay UI.
- Only show fields assigned to the current signer.
- Provide contextual “Sign Here” callouts and navigation between required fields.

### 3) Identity verification (OTP)
- Implement OTP issuance and validation flows (email or SMS):
  - Create OTP tables and endpoints.
  - Lock signing until OTP verified.
  - Store `identity_verified_at` for audit.

### 4) Sequential routing UX + enforcement
- In sequential mode, lock fields for non‑active recipients and show “Waiting for previous signer” states.
- Send signing email only when recipient becomes active.
- Update UI to display routing status (e.g., “Signer 2 waiting”).

### 5) Robust audit trail and certificates
- Extend audit log with additional events (viewed, signed, declined, email sent).
- Add a front‑end audit log viewer with filters and exports.
- Include audit data in the certificate page and signed PDF metadata.

### 6) Resend, reassign, and reminders
- Add UI for manual resend and recipient reassignment.
- Add scheduled reminders UI (admin can set cadence in editor).

### 7) Document templates
- Add full PDF preview in template editor.
- Support role‑based placement with role‑specific colors.

### 8) UX polish
- Better empty states and onboarding help for first document.
- Inline error messaging for missing required fields.
- Mobile signature pad with touch support and smaller screen layout.

## Suggested prioritized roadmap
1. **WYSIWYG PDF overlay** (placement + public signing)
2. **Identity verification (OTP)**
3. **Sequential routing UX**
4. **Audit log UI**
5. **Resend/reassign & reminder UI**
6. **Templates with PDF preview**

## Notes
- Backend already includes reminders, audit, and PDF signing; the main gaps are UI fidelity and identity verification.
- Field placement currently uses percentages, which is correct for scaling; accuracy improves once PDF rendering is integrated.
- Reusable templates
