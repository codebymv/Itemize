import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { recordPayment } from './invoicesApi';
import { isPaymentGraphqlMutationsEnabled } from './graphqlClient';
import { recordInvoicePaymentViaGraphql } from './invoicePaymentsApi';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));
vi.mock('./graphqlClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('./graphqlClient')>();
  return {
    ...original,
    isPaymentGraphqlMutationsEnabled: vi.fn(),
  };
});
vi.mock('./invoicePaymentsApi', () => ({
  recordInvoicePaymentViaGraphql: vi.fn(),
}));

describe('invoice payment action transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPaymentGraphqlMutationsEnabled).mockReturnValue(false);
  });

  it('retains the locked REST action by default', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        payment: { id: 7 },
        invoice: { amount_paid: 20, amount_due: 80, status: 'partial' },
      },
    });
    await recordPayment(8, { amount: 20, payment_method: 'cash' }, 4);
    expect(api.post).toHaveBeenCalledWith(
      '/api/invoices/8/record-payment',
      { amount: 20, payment_method: 'cash' },
      { headers: { 'x-organization-id': '4' } },
    );
    expect(recordInvoicePaymentViaGraphql).not.toHaveBeenCalled();
  });

  it('routes only the payment action through GraphQL when enabled', async () => {
    vi.mocked(isPaymentGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(recordInvoicePaymentViaGraphql).mockResolvedValue({
      payment: { id: 7 } as never,
      invoice: { amount_paid: 20, amount_due: 80, status: 'partial' },
    });
    await recordPayment(8, { amount: 20, payment_method: 'cash' }, 4);
    expect(recordInvoicePaymentViaGraphql).toHaveBeenCalledWith(
      8,
      { amount: 20, payment_method: 'cash' },
      4,
    );
    expect(api.post).not.toHaveBeenCalled();
  });
});
