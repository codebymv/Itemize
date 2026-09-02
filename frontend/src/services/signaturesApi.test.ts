import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  cancelSignatureDocument,
  createSignatureDocument,
  createSignatureTemplate,
  declinePublicSignature,
  deleteSignatureDocument,
  deleteSignatureDocumentFile,
  deleteSignatureTemplate,
  downloadSignedDocument,
  getPublicSigningData,
  getSignatureAudit,
  getSignatureDocument,
  getSignatureEmailPreview,
  getSignatureTemplate,
  getSignatures,
  instantiateSignatureTemplate,
  listSignatureDocuments,
  listSignatureTemplates,
  remindSignatureDocument,
  sendSignatureDocument,
  submitPublicSignature,
  updateSignatureDocument,
  updateSignatureTemplate,
  uploadSignatureDocument,
  uploadSignatureTemplate,
} from './signaturesApi';
import * as graphql from './signaturesGraphql';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  getApiUrl: vi.fn(() => 'https://api.test'),
}));
vi.mock('./signaturesGraphql', () => ({
  cancelSignatureDocumentViaGraphql: vi.fn(),
  createSignatureDocumentViaGraphql: vi.fn(),
  createSignatureTemplateViaGraphql: vi.fn(),
  deleteSignatureDocumentViaGraphql: vi.fn(),
  deleteSignatureTemplateViaGraphql: vi.fn(),
  getSignatureAuditViaGraphql: vi.fn(),
  getSignatureDocumentViaGraphql: vi.fn(),
  getSignatureEmailPreviewViaGraphql: vi.fn(),
  getSignatureTemplateViaGraphql: vi.fn(),
  instantiateSignatureTemplateViaGraphql: vi.fn(),
  listSignatureDocumentsViaGraphql: vi.fn(),
  listSignatureTemplatesViaGraphql: vi.fn(),
  remindSignatureDocumentViaGraphql: vi.fn(),
  removeSignatureDocumentFileViaGraphql: vi.fn(),
  sendSignatureDocumentViaGraphql: vi.fn(),
  updateSignatureDocumentViaGraphql: vi.fn(),
  updateSignatureTemplateViaGraphql: vi.fn(),
}));

describe('signature API transport boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(graphql.listSignatureDocumentsViaGraphql).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      stats: { total: 0, invalid: 0, draft: 0, active: 0, completed: 0 },
    });
  });

  it('routes authenticated signature reads and mutations through GraphQL', async () => {
    const document = { title: 'NDA' };
    const update = { message: 'Please sign' };
    const template = { title: 'Agreement' };
    const templateUpdate = { description: 'Reusable' };

    await listSignatureDocuments({ status: 'draft', page: 2, limit: 10 });
    await getSignatures({ search: 'nda' });
    await getSignatureDocument(7);
    await getSignatureAudit(7);
    await createSignatureDocument(document);
    await updateSignatureDocument(7, update);
    await deleteSignatureDocument(7);
    await deleteSignatureDocumentFile(7);
    await sendSignatureDocument(7);
    await cancelSignatureDocument(7);
    await remindSignatureDocument(7);
    await getSignatureEmailPreview({ message: 'Sign this' });
    await listSignatureTemplates();
    await getSignatureTemplate(5);
    await createSignatureTemplate(template);
    await updateSignatureTemplate(5, templateUpdate);
    await instantiateSignatureTemplate(5, { title: 'Generated' });
    await deleteSignatureTemplate(5);

    expect(graphql.listSignatureDocumentsViaGraphql).toHaveBeenNthCalledWith(
      1, { status: 'draft', page: 2, limit: 10 },
    );
    expect(graphql.listSignatureDocumentsViaGraphql).toHaveBeenNthCalledWith(
      2, { search: 'nda' },
    );
    expect(graphql.getSignatureDocumentViaGraphql).toHaveBeenCalledWith(7);
    expect(graphql.getSignatureAuditViaGraphql).toHaveBeenCalledWith(7);
    expect(graphql.createSignatureDocumentViaGraphql).toHaveBeenCalledWith(document);
    expect(graphql.updateSignatureDocumentViaGraphql).toHaveBeenCalledWith(7, update);
    expect(graphql.deleteSignatureDocumentViaGraphql).toHaveBeenCalledWith(7);
    expect(graphql.removeSignatureDocumentFileViaGraphql).toHaveBeenCalledWith(7);
    expect(graphql.sendSignatureDocumentViaGraphql).toHaveBeenCalledWith(7);
    expect(graphql.cancelSignatureDocumentViaGraphql).toHaveBeenCalledWith(7);
    expect(graphql.remindSignatureDocumentViaGraphql).toHaveBeenCalledWith(7);
    expect(graphql.getSignatureEmailPreviewViaGraphql).toHaveBeenCalledWith({
      message: 'Sign this',
    });
    expect(graphql.listSignatureTemplatesViaGraphql).toHaveBeenCalledOnce();
    expect(graphql.getSignatureTemplateViaGraphql).toHaveBeenCalledWith(5);
    expect(graphql.createSignatureTemplateViaGraphql).toHaveBeenCalledWith(template);
    expect(graphql.updateSignatureTemplateViaGraphql).toHaveBeenCalledWith(
      5, templateUpdate,
    );
    expect(graphql.instantiateSignatureTemplateViaGraphql).toHaveBeenCalledWith(
      5, { title: 'Generated' },
    );
    expect(graphql.deleteSignatureTemplateViaGraphql).toHaveBeenCalledWith(5);
  });

  it('retains HTTP only for multipart files, streams, and public capabilities', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: {} } });
    vi.mocked(api.get).mockResolvedValue({ data: { data: {} } });
    const file = new File(['%PDF'], 'source.pdf', { type: 'application/pdf' });

    await uploadSignatureDocument(7, file);
    await uploadSignatureTemplate(5, file);
    await getPublicSigningData('public-token');
    const publicSignaturePayload = {
      fields: [{ id: 1, value: 'signed' }],
      consent: { agreed: true as const, version: 'test-consent-v1' },
    };
    await submitPublicSignature('public-token', publicSignaturePayload);
    await declinePublicSignature('public-token', 'Declined');

    expect(api.post).toHaveBeenCalledWith(
      '/api/signatures/documents/upload',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    expect(api.post).toHaveBeenCalledWith(
      '/api/signatures/templates/upload',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    expect(api.get).toHaveBeenCalledWith('/api/public/sign/public-token', {
      publicRequest: true,
      withCredentials: false,
    });
    expect(api.post).toHaveBeenCalledWith(
      '/api/public/sign/public-token',
      publicSignaturePayload,
      {
        publicRequest: true,
        retryOnNetworkError: true,
        withCredentials: false,
      },
    );
    expect(api.post).toHaveBeenCalledWith(
      '/api/public/sign/public-token/decline',
      { reason: 'Declined' },
      {
        publicRequest: true,
        retryOnNetworkError: true,
        withCredentials: false,
      },
    );
    expect(downloadSignedDocument(7)).toEqual({
      url: 'https://api.test/api/signatures/documents/7/download',
    });
  });
});
