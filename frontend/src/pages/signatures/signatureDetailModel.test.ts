import { describe, expect, it } from 'vitest';
import type { SignatureDocument, SignatureField, SignatureRecipient } from '@/services/signaturesApi';
import {
  getSignatureDraftReadiness,
  getSignatureRecipientSummary,
  hasSignatureProcessingFailure,
  isSignatureDocumentEditable,
} from './signatureDetailModel';

const document = (overrides: Partial<SignatureDocument> = {}): SignatureDocument => ({
  id: 1,
  organization_id: 1,
  title: 'Agreement',
  status: 'draft',
  created_at: '2026-08-29T00:00:00.000Z',
  updated_at: '2026-08-29T00:00:00.000Z',
  ...overrides,
});
const recipient = (overrides: Partial<SignatureRecipient> = {}): SignatureRecipient => ({
  id: 1,
  document_id: 1,
  organization_id: 1,
  name: 'Avery Morgan',
  email: 'avery@example.com',
  role_name: 'Signer',
  status: 'pending',
  ...overrides,
});

const field = (): SignatureField => ({
  id: 1,
  document_id: 1,
  field_type: 'signature',
  page_number: 1,
  x_position: 10,
  y_position: 10,
  width: 20,
  height: 5,
});

describe('signature detail model', () => {
  it('only allows unsaved and draft documents to use the editor', () => {
    expect(isSignatureDocumentEditable(null)).toBe(true);
    expect(isSignatureDocumentEditable(document())).toBe(true);
    expect(isSignatureDocumentEditable(document({ status: 'sent' }))).toBe(false);
    expect(isSignatureDocumentEditable(document({ status: 'completed' }))).toBe(false);
  });

  it('requires a complete, saved-sendable draft setup', () => {
    expect(getSignatureDraftReadiness({
      title: 'Agreement',
      hasFile: true,
      recipients: [recipient()],
      fields: [field()],
    }).ready).toBe(true);

    const incomplete = getSignatureDraftReadiness({
      title: 'Agreement',
      hasFile: true,
      recipients: [recipient({ email: '' })],
      fields: [field()],
    });
    expect(incomplete.recipientsComplete).toBe(false);
    expect(incomplete.ready).toBe(false);
  });

  it('groups recipient outcomes into waiting, signed, and attention states', () => {
    expect(getSignatureRecipientSummary([
      recipient({ id: 1, status: 'viewed' }),
      recipient({ id: 2, status: 'signed' }),
      recipient({ id: 3, status: 'declined' }),
      recipient({ id: 4, status: 'sent', delivery_state: 'dead_letter' }),
    ])).toEqual({ total: 4, waiting: 1, signed: 1, attention: 2 });
  });

  it('promotes delivery and completion dead letters to retryable failures', () => {
    expect(hasSignatureProcessingFailure(document({ delivery_state: 'failed' }))).toBe(true);
    expect(hasSignatureProcessingFailure(document({ completion_state: 'dead_letter' }))).toBe(true);
    expect(hasSignatureProcessingFailure(document({ status: 'in_progress', delivery_state: 'delivered' }))).toBe(false);
  });
});
