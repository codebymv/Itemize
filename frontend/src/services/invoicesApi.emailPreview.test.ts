import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { getInvoiceEmailPreview } from './invoicesApi';
import { isInvoiceEmailPreviewGraphqlEnabled } from './graphqlClient';
import { previewInvoiceEmailViaGraphql } from './invoiceEmailPreviewGraphql';

vi.mock('@/lib/api', () => ({
  default: { post: vi.fn() },
}));
vi.mock('./graphqlClient', () => ({
  isInvoiceEmailPreviewGraphqlEnabled: vi.fn(),
  isInvoiceBusinessGraphqlMutationsEnabled: vi.fn(() => false),
  isInvoiceBusinessGraphqlReadsEnabled: vi.fn(() => false),
  isInvoiceGraphqlMutationsEnabled: vi.fn(() => false),
  isInvoiceGraphqlReadsEnabled: vi.fn(() => false),
  isInvoiceSettingsGraphqlMutationsEnabled: vi.fn(() => false),
  isInvoiceSettingsGraphqlReadsEnabled: vi.fn(() => false),
  isPaymentGraphqlMutationsEnabled: vi.fn(() => false),
  isProductGraphqlMutationsEnabled: vi.fn(() => false),
  isProductGraphqlReadsEnabled: vi.fn(() => false),
  isRecurringInvoiceGraphqlCloneEnabled: vi.fn(() => false),
}));
vi.mock('./invoiceEmailPreviewGraphql', () => ({
  previewInvoiceEmailViaGraphql: vi.fn(),
}));

const input = {
  message: 'Invoice attached',
  subject: 'Invoice INV-1',
  includePaymentLink: true,
};

describe('invoice email preview transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isInvoiceEmailPreviewGraphqlEnabled).mockReturnValue(false);
  });

  it('uses retained HTTP by default', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    vi.mocked(api.post).mockResolvedValue({ data: { data: { html: 'rest' } } });
    await expect(getInvoiceEmailPreview(input, 7)).resolves.toEqual({ html: 'rest' });
    expect(api.post).toHaveBeenCalledWith(
      '/api/invoices/email/preview',
      { ...input, baseUrl: 'https://app.example.test' },
      { headers: { 'x-organization-id': '7' } },
    );
    expect(previewInvoiceEmailViaGraphql).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('uses GraphQL only when its independent flag is enabled', async () => {
    vi.mocked(isInvoiceEmailPreviewGraphqlEnabled).mockReturnValue(true);
    vi.mocked(previewInvoiceEmailViaGraphql).mockResolvedValue({ html: 'graphql' });
    await expect(getInvoiceEmailPreview(input, 7)).resolves.toEqual({
      html: 'graphql',
    });
    expect(previewInvoiceEmailViaGraphql).toHaveBeenCalledWith(input, 7);
    expect(api.post).not.toHaveBeenCalled();
  });
});
