import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  graphqlMutationRequest,
  graphqlRequest,
} from './graphqlClient';
import {
  createInvoicePayment,
  getInvoicePayments,
  recordInvoicePaymentViaGraphql,
} from './invoicePaymentsApi';

vi.mock('./graphqlClient', () => ({
  graphqlMutationRequest: vi.fn(),
  graphqlRequest: vi.fn(),
}));

describe('invoice payment GraphQL transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads filtered payment history through GraphQL', async () => {
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
          paymentMethod: 'BANK_TRANSFER',
          status: 'SUCCEEDED',
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
  });

  it('records both manual payment shapes through protected GraphQL mutations', async () => {
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({
        recordPayment: {
          payment: { id: 5 },
          invoice: null,
        },
      })
      .mockResolvedValueOnce({
        recordInvoicePayment: {
          payment: {
            id: 6,
            organizationId: 4,
            invoiceId: 8,
            invoiceNumber: 'INV-00008',
            contactId: null,
            contactName: null,
            amount: '20.00',
            currency: 'USD',
            paymentMethod: 'CASH',
            status: 'SUCCEEDED',
            stripePaymentIntentId: null,
            cardLast4: null,
            cardBrand: null,
            description: null,
            notes: null,
            receiptUrl: null,
            paidAt: '2026-07-18T12:00:00.000Z',
            createdAt: '2026-07-18T12:00:00.000Z',
            updatedAt: '2026-07-18T12:00:00.000Z',
          },
          invoice: {
            amountPaid: '20.00',
            amountDue: '80.00',
            status: 'partial',
          },
        },
      });
    await createInvoicePayment(4, {
      amount: 10,
      payment_method: 'check',
      payment_date: '2026-07-18',
      status: 'succeeded',
    });
    await expect(recordInvoicePaymentViaGraphql(
      8,
      { amount: 20, payment_method: 'cash' },
      4,
    )).resolves.toMatchObject({
      payment: { amount: 20, payment_method: 'cash' },
      invoice: { amount_paid: 20, amount_due: 80, status: 'partial' },
    });
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('mutation RecordPayment'),
      {
        input: expect.objectContaining({
          amount: '10',
          paymentMethod: 'CHECK',
          paymentDate: '2026-07-18',
          status: 'SUCCEEDED',
        }),
      },
      4,
    );
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('mutation RecordInvoicePayment'),
      expect.objectContaining({
        invoiceId: 8,
        input: expect.objectContaining({
          amount: '20',
          paymentMethod: 'CASH',
        }),
      }),
      4,
    );
  });
});
