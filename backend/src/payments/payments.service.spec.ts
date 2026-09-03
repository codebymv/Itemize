import { PaymentRow, PaymentsRepository } from './payments.repository';
import { PaymentMethod, PaymentPeriod, PaymentStatus } from './payment.types';
import { PaymentsService } from './payments.service';

const payment: PaymentRow = {
  id: 7,
  organization_id: 3,
  invoice_id: 9,
  invoice_number: 'INV-00009',
  contact_id: 11,
  contact_name: 'Ada Lovelace',
  amount: '125.50',
  currency: 'USD',
  payment_method: PaymentMethod.CARD,
  status: PaymentStatus.SUCCEEDED,
  stripe_payment_intent_id: null,
  card_last4: '4242',
  card_brand: 'visa',
  description: null,
  notes: 'Deposit',
  receipt_url: null,
  refund_amount: '0.00',
  refunded_at: null,
  refund_reason: null,
  paid_at: new Date('2026-07-18T12:00:00.000Z'),
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  updated_at: new Date('2026-07-18T12:00:00.000Z'),
};

describe('PaymentsService', () => {
  let repository: jest.Mocked<PaymentsRepository>;
  let service: PaymentsService;
  const stripe = { create: jest.fn() };

  beforeEach(() => {
    repository = {
      periodRange: jest.fn().mockResolvedValue({
        period: PaymentPeriod.LAST_30_DAYS,
        startAt: new Date('2026-07-01T07:00:00.000Z'),
        endAt: new Date('2026-07-31T12:00:00.000Z'),
        timeZone: 'America/Phoenix',
      }),
      overview: jest.fn(),
      revenueFlow: jest.fn(),
      findPage: jest.fn(),
      record: jest.fn(),
      prepareRefund: jest.fn(),
      completeRefund: jest.fn(),
      failRefund: jest.fn(),
    } as unknown as jest.Mocked<PaymentsRepository>;
    stripe.create.mockReset();
    service = new PaymentsService(repository, stripe as never);
  });

  it('maps decimal strings and tenant-scoped payment context', async () => {
    repository.findPage.mockResolvedValue({ rows: [payment], total: 1 });
    await expect(
      service.list(
        3,
        { page: 2, pageSize: 10 },
        PaymentPeriod.LAST_30_DAYS,
        PaymentStatus.SUCCEEDED,
        PaymentMethod.CARD,
        ' Ada ',
      ),
    ).resolves.toMatchObject({
      nodes: [{
        id: 7,
        organizationId: 3,
        invoiceNumber: 'INV-00009',
        contactName: 'Ada Lovelace',
        amount: '125.50',
      }],
      pageInfo: { page: 2, pageSize: 10, total: 1 },
    });
    expect(repository.findPage).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        pageSize: 10,
        offset: 10,
        status: PaymentStatus.SUCCEEDED,
        paymentMethod: PaymentMethod.CARD,
        search: 'Ada',
      }),
    );
  });

  it('returns currency-safe authoritative overview totals', async () => {
    repository.overview.mockResolvedValue([{
      currency: 'USD',
      failed_amount: '15.00',
      failed_count: '1',
      gross_amount: '200.00',
      gross_count: '3',
      in_progress_amount: '25.00',
      in_progress_count: '1',
      refunded_amount: '40.00',
      refunded_count: '1',
      net_amount: '160.00',
    }]);

    await expect(
      service.overview(3, PaymentPeriod.LAST_30_DAYS),
    ).resolves.toMatchObject({
      period: PaymentPeriod.LAST_30_DAYS,
      timeZone: 'America/Phoenix',
      currencies: [{
        currency: 'USD',
        failedAmount: '15.00',
        failedCount: 1,
        netAmount: '160.00',
      }],
    });
  });

  it('zero-fills authoritative revenue buckets and reconciles refunds', async () => {
    repository.revenueFlow.mockResolvedValue({
      startAt: new Date('2026-07-01T07:00:00.000Z'),
      bucketUnit: 'day',
      boundaries: [
        new Date('2026-07-01T07:00:00.000Z'),
        new Date('2026-07-02T07:00:00.000Z'),
      ],
      summaries: [{
        currency: 'USD',
        booked_sales: '300.00',
        booked_deals: '2',
        failed_amount: '15.00',
        failed_count: '1',
        gross_received: '200.00',
        settled_payments: '3',
        in_progress_amount: '25.00',
        in_progress_count: '1',
        refunds: '40.00',
        refunded_payments: '1',
        net_received: '160.00',
      }],
      buckets: [{
        currency: 'USD',
        start_at: new Date('2026-07-01T07:00:00.000Z'),
        booked_sales: '300.00',
        booked_deals: '2',
        gross_received: '200.00',
        settled_payments: '3',
        refunds: '40.00',
        refunded_payments: '1',
        net_received: '160.00',
      }],
      methods: [{
        currency: 'USD',
        payment_method: PaymentMethod.CARD,
        gross_received: '200.00',
        settled_payments: '3',
        refunds: '40.00',
        refunded_payments: '1',
        net_received: '160.00',
      }],
    });

    await expect(
      service.revenueFlow(3, PaymentPeriod.LAST_30_DAYS),
    ).resolves.toMatchObject({
      period: PaymentPeriod.LAST_30_DAYS,
      bucketUnit: 'day',
      currencies: [{
        currency: 'USD',
        summary: { bookedSales: '300.00', netReceived: '160.00' },
        buckets: [
          { grossReceived: '200.00', refunds: '40.00' },
          { grossReceived: '0.00', refunds: '0.00', netReceived: '0.00' },
        ],
        methods: [{ paymentMethod: PaymentMethod.CARD, netReceived: '160.00' }],
      }],
    });
  });

  it('rejects unbounded page input', async () => {
    await expect(
      service.list(3, { page: 1, pageSize: 101 }),
    ).rejects.toMatchObject({
      extensions: { reason: 'INVALID_PAGE' },
    });
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('normalizes an organization payment and preserves a pending invoice', async () => {
    repository.record.mockResolvedValue({
      kind: 'recorded',
      payment: {
        ...payment,
        invoice_id: null,
        invoice_number: null,
        contact_id: null,
        contact_name: null,
        amount: '25.00',
        payment_method: PaymentMethod.CASH,
        status: PaymentStatus.PENDING,
        paid_at: null,
      },
      invoice: null,
      replayed: false,
    });
    await expect(service.record(3, 4, {
      amount: '25.00',
      currency: 'usd',
      paymentMethod: PaymentMethod.CASH,
      status: PaymentStatus.PENDING,
      paymentDate: '2026-07-18',
      notes: ' Check 42 ',
    }, 'payment-record-0001')).resolves.toMatchObject({
      payment: { amount: '25.00', status: PaymentStatus.PENDING },
      invoice: null,
    });
    expect(repository.record).toHaveBeenCalledWith(
      3,
      4,
      {
        invoiceId: null,
        contactId: null,
        amount: '25.00',
        currency: 'USD',
        paymentMethod: PaymentMethod.CASH,
        status: PaymentStatus.PENDING,
        paymentDate: '2026-07-18',
        notes: 'Check 42',
      },
      'payment-record-0001',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('records a successful invoice payment and returns decimal balances', async () => {
    repository.record.mockResolvedValue({
      kind: 'recorded',
      payment,
      invoice: {
        amount_paid: '125.50',
        amount_due: '0.00',
        status: 'paid',
      },
      replayed: false,
    });
    await expect(service.recordInvoice(3, 4, 9, {
      amount: '125.50',
      paymentMethod: PaymentMethod.CARD,
      paymentDate: '2026-07-18',
      notes: null,
    }, 'invoice-payment-record-0001')).resolves.toMatchObject({
      payment: { id: 7 },
      invoice: {
        amountPaid: '125.50',
        amountDue: '0.00',
        status: 'paid',
      },
    });
  });

  it('rejects malformed writes and tenant-hidden references', async () => {
    await expect(service.record(3, 4, {
      amount: '0',
      currency: 'USD',
      paymentMethod: PaymentMethod.OTHER,
      status: PaymentStatus.SUCCEEDED,
    }, 'payment-record-0002')).rejects.toMatchObject({
      extensions: { reason: 'INVALID_PAYMENT_AMOUNT' },
    });
    await expect(service.record(3, 4, {
      amount: '1.00',
      currency: 'USD',
      paymentMethod: PaymentMethod.STRIPE,
      status: PaymentStatus.SUCCEEDED,
    }, 'payment-record-0003')).rejects.toMatchObject({
      extensions: { reason: 'INVALID_PAYMENT_METHOD' },
    });
    repository.record.mockResolvedValue({ kind: 'invoice-not-found' });
    await expect(service.recordInvoice(3, 4, 999, {
      amount: '1.00',
      paymentMethod: PaymentMethod.OTHER,
    }, 'invoice-payment-record-0002')).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });

  it('surfaces reused and unavailable payment recording receipts', async () => {
    repository.record
      .mockResolvedValueOnce({ kind: 'idempotency-conflict' })
      .mockResolvedValueOnce({ kind: 'result-unavailable' });
    const input = {
      amount: '1.00',
      currency: 'USD',
      paymentMethod: PaymentMethod.OTHER,
      status: PaymentStatus.SUCCEEDED,
    };
    await expect(service.record(3, 4, input, 'payment-record-0004'))
      .rejects.toMatchObject({
        extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' },
      });
    await expect(service.record(3, 4, input, 'payment-record-0005'))
      .rejects.toMatchObject({
        extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE' },
      });
  });

  it('submits a bounded Stripe refund and returns recalculated balances', async () => {
    repository.prepareRefund.mockResolvedValue({
      kind: 'prepared',
      refundId: 31,
      paymentId: 7,
      paymentIntentId: 'pi_payment_7',
      stripeAccountId: 'acct_Merchant123',
      amount: '25.50',
      currency: 'USD',
      reason: 'Customer request',
      idempotencyKey: 'refund-request-0001',
    });
    stripe.create.mockResolvedValue({
      kind: 'accepted',
      refundId: 're_Refund31',
      status: 'succeeded',
      failureCode: null,
      failureMessage: null,
    });
    repository.completeRefund.mockResolvedValue({
      payment: {
        ...payment,
        payment_method: PaymentMethod.STRIPE,
        stripe_payment_intent_id: 'pi_payment_7',
        refund_amount: '25.50',
        refunded_at: new Date('2026-08-26T12:00:00.000Z'),
        refund_reason: 'Customer request',
      },
      invoice: { amount_paid: '100.00', amount_due: '25.50', status: 'partial' },
      refundStatus: 'succeeded',
    });

    await expect(service.refund(3, 7, {
      amount: '25.50',
      reason: ' Customer request ',
      idempotencyKey: 'refund-request-0001',
    })).resolves.toMatchObject({
      payment: { refundedAmount: '25.50', refundableAmount: '100.00' },
      invoice: { amountPaid: '100.00', amountDue: '25.50', status: 'partial' },
      refundStatus: 'succeeded',
    });
    expect(stripe.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: '25.50',
      idempotencyKey: 'payment-refund:3:refund-request-0001',
    }));
  });
});
