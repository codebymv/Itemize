import { describe, expect, it } from 'vitest';
import type { SignatureDocument, SignatureTemplate } from '@/services/signaturesApi';
import {
  filterDocuments,
  filterTemplates,
  getDocumentStats,
  getTemplateStats,
} from './signatureCatalog';

const documents = [
  { id: 1, title: 'Proposal', status: 'draft', created_at: '', updated_at: '' },
  { id: 2, title: 'Service agreement', status: 'sent', created_at: '', updated_at: '' },
  { id: 3, title: 'NDA', status: 'in_progress', created_at: '', updated_at: '' },
  { id: 4, title: 'Completed agreement', status: 'completed', created_at: '', updated_at: '' },
  { id: 5, title: 'Cancelled NDA', status: 'cancelled', created_at: '', updated_at: '' },
  { id: 6, title: 'Expired proposal', status: 'expired', created_at: '', updated_at: '' },
] as SignatureDocument[];

const templates = [
  { id: 1, title: 'Ready NDA', file_url: '/nda.pdf', is_ready: true, created_at: '' },
  { id: 2, title: 'Proposal shell', file_url: '/proposal.pdf', is_ready: false, created_at: '' },
] as SignatureTemplate[];

describe('signature catalogs', () => {
  it('groups sent and in-progress documents as active', () => {
    expect(getDocumentStats(documents)).toEqual({
      invalid: 2,
      draft: 1,
      active: 2,
      completed: 1,
    });
    expect(filterDocuments(documents, { search: '', status: 'active' }).map((item) => item.id))
      .toEqual([2, 3]);
    expect(filterDocuments(documents, { search: '', status: 'invalid' }).map((item) => item.id))
      .toEqual([5, 6]);
  });

  it('searches document identity and descriptive fields', () => {
    expect(filterDocuments(documents, { search: 'agreement', status: 'all' }).map((item) => item.id))
      .toEqual([2, 4]);
  });

  it('separates send-ready templates from incomplete setups even when a PDF exists', () => {
    expect(getTemplateStats(templates)).toEqual({ total: 2, ready: 1, needsFile: 1 });
    expect(filterTemplates(templates, { search: '', readiness: 'needs_file' }).map((item) => item.id))
      .toEqual([2]);
  });
});
