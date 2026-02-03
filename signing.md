# Signing / E-Signature Feature Plan (DocuSign-style)

This document captures a comprehensive plan for adding a “Signatures / Documents / Envelopes” feature that mirrors DocuSign-style flows. It reuses existing invoice sending, PDF, file upload, and public-access patterns already in the codebase.

## Goals
- Upload a document (PDF initially).
- Place signature/initials fields via drag-and-drop on the document.
- Send a signing link to recipients.
- Allow recipients to sign without an account.
- Track status and produce a final signed PDF with an audit trail.

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

### `signature_recipients`
- `id`, `document_id`, `organization_id`, `contact_id`
- `name`, `email`, `signing_order`
- `signing_token` (public access token)
- `status`: `pending | sent | viewed | signed | declined`
- `sent_at`, `viewed_at`, `signed_at`, `declined_at`, `decline_reason`
- `ip_address`, `user_agent`

### `signature_fields`
- `id`, `document_id`, `recipient_id`
- `field_type`: `signature | initials | text | date | checkbox`
- `page_number`, `x_position`, `y_position`, `width`, `height` (percent-based)
- `label`, `is_required`, `value` (filled after signing)

### `signature_audit_log`
- `id`, `document_id`, `recipient_id`
- `event_type`, `description`
- `ip_address`, `user_agent`, `created_at`

## API (proposed)
### Authenticated
- `POST /api/signatures/documents` create draft
- `POST /api/signatures/documents/upload` upload PDF (S3/local)
- `GET /api/signatures/documents` list with filters
- `GET /api/signatures/documents/:id` details + recipients + fields + audit
- `POST /api/signatures/documents/:id/send` send signing emails
- `POST /api/signatures/documents/:id/cancel` cancel request
- `GET /api/signatures/documents/:id/download` signed PDF

### Public
- `GET /api/public/sign/:token` fetch doc + fields for recipient
- `POST /api/public/sign/:token` submit signature payload
- `POST /api/public/sign/:token/decline` decline with reason
- `GET /api/public/sign/:token/download` download original PDF

## Email flow (reuse invoices)
- Use `backend/src/services/email.service.js` to send signing request emails.
- Email includes CTA button to `/sign/:token` and optional PDF attachment.
- On completion: send notifications to sender + all recipients.

## PDF handling
- Use `backend/src/services/pdf.service.js` to generate a final signed PDF by overlaying signature images on the original document.
- Append a certificate/audit page with signer name, email, timestamp, and IP.

## Frontend UX (proposed)
### Internal (authenticated)
1. **Upload**: upload document, show PDF preview.
2. **Field placement**: drag-and-drop fields on pages; assign each field to recipient.
3. **Recipients**: add multiple signers with signing order (sequential or parallel).
4. **Send**: compose message and send for signature.
5. **Status tracking**: list view for sent/in-progress/completed.

### Public (recipient)
1. Open `/sign/:token`.
2. Review doc with fields highlighted.
3. Draw/typed signature + initials.
4. Submit and finalize.
5. Show completion + download signed PDF.

## Security & compliance considerations
- Signing tokens must be random and unique; support expiration (`expires_at`).
- Rate-limit all public endpoints.
- Capture IP and user agent for audit logs.
- Ensure CORS allows public signing endpoints.
- Add optional reminder emails via scheduler (future).

## Subscription gating (suggested)
- Feature flag: `signature_documents`.
- Starter: limited documents/month.
- Unlimited/Pro: higher limits/unlimited.

## Open questions / decisions
1. **Sequential vs parallel signing**: Should signing order be enforced?
2. **Field types**: Start with signature + initials, or include text/date/checkbox?
3. **PDF tooling**: Use Puppeteer only (consistent), or add `pdf-lib` for higher-fidelity overlays?
4. **Template support**: Allow reusable field placements for repeat documents?
5. **Recipient identity**: Require email verification or OTP before signing?
6. **Mobile signature**: Define UX for mobile signature capture.

## First implementation slice (MVP)
- PDF upload
- One recipient
- Signature + initials only
- Public signing page
- Signed PDF output
- Basic audit trail

## Suggested future enhancements
- Multiple recipients with sequential signing
- Automated reminders
- Field validation + required fields
- Reusable templates
- Bulk send + CSV recipient imports
- Advanced compliance: tamper-evident seals and document hashing
