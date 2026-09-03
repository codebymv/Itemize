import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  graphqlMutationRequest,
  graphqlRequest,
} from './graphqlClient';
import {
  createInvoicePayment,
  getInvoicePaymentLedger,
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
        pageInfo: {
          page: 1,
          pageSize: 50,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
      revenueFlow: {
        period: 'ALL_TIME',
        startAt: null,
        endAt: '2026-07-19T00:00:00.000Z',
        timeZone: 'America/Phoenix',
        bucketUnit: 'month',
        currencies: [{
          currency: 'USD',
          summary: {
            bookedSales: '0.00', bookedDeals: 0,
            failedAmount: '0.00', failedCount: 0,
            grossReceived: '10.50', settledPayments: 1,
            inProgressAmount: '0.00', inProgressCount: 0,
            refunds: '0.00', refundedPayments: 0, netReceived: '10.50',
          },
          buckets: [],
          methods: [],
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
      expect.stringContaining('query PaymentLedger'),
      expect.objectContaining({
        period: 'ALL_TIME',
        status: 'SUCCEEDED',
        paymentMethod: 'BANK_TRANSFER',
      }),
      4,
    );
  });

  it('maps a scoped ledger page and authoritative overview', async () => {
    vi.mocked(graphqlRequest).mockResolvedValue({
      payments: {
        nodes: [],
        pageInfo: {
          page: 2,
          pageSize: 25,
          total: 30,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      },
      revenueFlow: {
        period: 'LAST_7_DAYS',
        startAt: '2026-07-12T07:00:00.000Z',
        endAt: '2026-07-19T00:00:00.000Z',
        timeZone: 'America/Phoenix',
        bucketUnit: 'day',
        currencies: [{
          currency: 'USD',
          summary: {
            bookedSales: '150.00', bookedDeals: 1,
            failedAmount: '5.00', failedCount: 1,
            grossReceived: '100.00', settledPayments: 2,
            inProgressAmount: '20.00', inProgressCount: 1,
            refunds: '25.00', refundedPayments: 1, netReceived: '75.00',
          },
          buckets: [{
            startAt: '2026-07-12T07:00:00.000Z',
            bookedSales: '150.00', bookedDeals: 1,
            grossReceived: '100.00', settledPayments: 2,
            refunds: '25.00', refundedPayments: 1, netReceived: '75.00',
          }],
          methods: [{
            paymentMethod: 'CARD', grossReceived: '100.00', settledPayments: 2,
            refunds: '25.00', refundedPayments: 1, netReceived: '75.00',
          }],
        }],
      },
    });

    await expect(getInvoicePaymentLedger(4, {
      period: '7days',
      page: 2,
      search: 'Ada',
    })).resolves.toMatchObject({
      payments: { pageInfo: { page: 2, total: 30 } },
      overview: {
        period: '7days',
        timeZone: 'America/Phoenix',
        currencies: [{ grossAmount: 100, refundedAmount: 25, netAmount: 75 }],
      },
      revenueFlow: {
        bucketUnit: 'day',
        currencies: [{
          summary: { bookedSales: 150, netReceived: 75 },
          buckets: [{ refunds: 25 }],
          methods: [{ paymentMethod: 'card' }],
        }],
      },
    });
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('revenueFlow(period: $period)'),
      expect.objectContaining({ period: 'LAST_7_DAYS', page: { page: 2, pageSize: 25 }, search: 'Ada' }),
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
    }, 'payment-record-0001');
    await expect(recordInvoicePaymentViaGraphql(
      8,
      { amount: 20, payment_method: 'cash', payment_date: '2026-07-18' },
      4,
      'invoice-payment-record-0001',
    )).resolves.toMatchObject({
      payment: {
        amount: 20,
        payment_method: 'cash',
        paid_at: '2026-07-18T12:00:00.000Z',
      },
      invoice: { amount_paid: 20, amount_due: 80, status: 'partial' },
    });
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('mutation RecordPayment'),
      {
        idempotencyKey: 'payment-record-0001',
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
        idempotencyKey: 'invoice-payment-record-0001',
        input: expect.objectContaining({
          amount: '20',
          paymentMethod: 'CASH',
          paymentDate: '2026-07-18',
        }),
      }),
      4,
    );
  });
});
