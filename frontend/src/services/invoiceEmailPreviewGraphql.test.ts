import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import { isInvoiceEmailPreviewGraphqlEnabled } from './graphqlClient';
import { previewInvoiceEmailViaGraphql } from './invoiceEmailPreviewGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const response = (payload: unknown): Response => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('invoice email preview GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('preview-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps the preview mutation disabled by default', () => {
    vi.stubEnv('VITE_INVOICE_EMAIL_PREVIEW_GRAPHQL', 'false');
    expect(isInvoiceEmailPreviewGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_INVOICE_EMAIL_PREVIEW_GRAPHQL', 'true');
    expect(isInvoiceEmailPreviewGraphqlEnabled()).toBe(true);
  });

  it('sends the protected preview input without a client-selected base URL', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { previewInvoiceEmail: { html: '<html>safe</html>' } } }),
    );
    await expect(previewInvoiceEmailViaGraphql({
      message: 'Invoice attached',
      subject: 'Invoice INV-1',
      includePaymentLink: true,
      baseUrl: 'https://attacker.invalid',
    }, 7)).resolves.toEqual({ html: '<html>safe</html>' });

    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.variables).toEqual({
      input: {
        message: 'Invoice attached',
        subject: 'Invoice INV-1',
        includePaymentLink: true,
      },
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(1);
  });
});
