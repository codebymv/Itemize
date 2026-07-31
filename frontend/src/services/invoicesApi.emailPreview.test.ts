import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInvoiceEmailPreview } from './invoicesApi';
import { previewInvoiceEmailViaGraphql } from './invoiceEmailPreviewGraphql';

vi.mock('./graphqlClient', () => ({
  isInvoiceGraphqlMutationsEnabled: vi.fn(() => false),
  isInvoiceGraphqlReadsEnabled: vi.fn(() => false),
  isPaymentGraphqlMutationsEnabled: vi.fn(() => false),
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

describe('invoice email preview transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses GraphQL unconditionally', async () => {
    vi.mocked(previewInvoiceEmailViaGraphql).mockResolvedValue({ html: 'graphql' });
    await expect(getInvoiceEmailPreview(input, 7)).resolves.toEqual({
      html: 'graphql',
    });
    expect(previewInvoiceEmailViaGraphql).toHaveBeenCalledWith(input, 7);
  });
});
