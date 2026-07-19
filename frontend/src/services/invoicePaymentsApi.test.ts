import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  graphqlRequest,
  isPaymentGraphqlReadsEnabled,
} from './graphqlClient';
import {
  createInvoicePayment,
  getInvoicePayments,
} from './invoicePaymentsApi';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('./graphqlClient', () => ({
  graphqlRequest: vi.fn(),
  isPaymentGraphqlReadsEnabled: vi.fn(),
}));

describe('invoice payment transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPaymentGraphqlReadsEnabled).mockReturnValue(false);
  });

  it('retains payment reads and writes on REST by default', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { payments: [{ id: 2, amount: '10.00' }] },
    });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    await expect(
      getInvoicePayments(4, { status: 'succeeded' }),
    ).resolves.toHaveLength(1);
    await createInvoicePayment(4, { amount: 10 });
    expect(api.get).toHaveBeenCalledWith(
      '/api/invoices/payments',
      expect.objectContaining({
        params: { status: 'succeeded' },
        headers: { 'x-organization-id': '4' },
      }),
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(graphqlRequest).not.toHaveBeenCalled();
  });

  it('switches filtered history to GraphQL while retaining writes on REST', async () => {
    vi.mocked(isPaymentGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(graphqlRequest).mockResolvedValue({
      payments: {
        nodes: [{
          id: 2,
          organizationId: 4,
          invoiceId: 8,
          invoiceNumber: 'INV-00008',
          contactId: null,
          contactName: 'Ada Lovelace',
          amount: '10.50',
          currency: 'USD',
          paymentMethod: 'bank_transfer',
          status: 'succeeded',
          stripePaymentIntentId: null,
          cardLast4: null,
          cardBrand: null,
          description: null,
          notes: null,
          receiptUrl: null,
          paidAt: '2026-07-18T12:00:00.000Z',
          createdAt: '2026-07-18T12:00:00.000Z',
          updatedAt: '2026-07-18T12:00:00.000Z',
        }],
      },
    });
    await expect(
      getInvoicePayments(4, {
        status: 'succeeded',
        payment_method: 'bank_transfer',
      }),
    ).resolves.toMatchObject([{
      amount: 10.5,
      payment_method: 'bank_transfer',
      invoice_number: 'INV-00008',
    }]);
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query Payments'),
      expect.objectContaining({
        status: 'SUCCEEDED',
        paymentMethod: 'BANK_TRANSFER',
      }),
      4,
    );
    expect(api.get).not.toHaveBeenCalled();
  });
});
