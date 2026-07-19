import { PaymentRow, PaymentsRepository } from './payments.repository';
import { PaymentMethod, PaymentStatus } from './payment.types';
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
  paid_at: new Date('2026-07-18T12:00:00.000Z'),
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  updated_at: new Date('2026-07-18T12:00:00.000Z'),
};

describe('PaymentsService', () => {
  let repository: jest.Mocked<PaymentsRepository>;
  let service: PaymentsService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn(),
      record: jest.fn(),
    } as unknown as jest.Mocked<PaymentsRepository>;
    service = new PaymentsService(repository);
  });

  it('maps decimal strings and tenant-scoped payment context', async () => {
    repository.findPage.mockResolvedValue({ rows: [payment], total: 1 });
    await expect(
      service.list(
        3,
        { page: 2, pageSize: 10 },
        PaymentStatus.SUCCEEDED,
        PaymentMethod.CARD,
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
      10,
      10,
      PaymentStatus.SUCCEEDED,
      PaymentMethod.CARD,
    );
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
    });
    await expect(service.record(3, {
      amount: '25.00',
      currency: 'usd',
      paymentMethod: PaymentMethod.CASH,
      status: PaymentStatus.PENDING,
      paymentDate: '2026-07-18',
      notes: ' Check 42 ',
    })).resolves.toMatchObject({
      payment: { amount: '25.00', status: PaymentStatus.PENDING },
      invoice: null,
    });
    expect(repository.record).toHaveBeenCalledWith(3, {
      invoiceId: null,
      contactId: null,
      amount: '25.00',
      currency: 'USD',
      paymentMethod: PaymentMethod.CASH,
      status: PaymentStatus.PENDING,
      paymentDate: '2026-07-18',
      notes: 'Check 42',
    });
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
    });
    await expect(service.recordInvoice(3, 9, {
      amount: '125.50',
      paymentMethod: PaymentMethod.CARD,
      notes: null,
    })).resolves.toMatchObject({
      payment: { id: 7 },
      invoice: {
        amountPaid: '125.50',
        amountDue: '0.00',
        status: 'paid',
      },
    });
  });

  it('rejects malformed writes and tenant-hidden references', async () => {
    await expect(service.record(3, {
      amount: '0',
      currency: 'USD',
      paymentMethod: PaymentMethod.OTHER,
      status: PaymentStatus.SUCCEEDED,
    })).rejects.toMatchObject({
      extensions: { reason: 'INVALID_PAYMENT_AMOUNT' },
    });
    await expect(service.record(3, {
      amount: '1.00',
      currency: 'USD',
      paymentMethod: PaymentMethod.STRIPE,
      status: PaymentStatus.SUCCEEDED,
    })).rejects.toMatchObject({
      extensions: { reason: 'INVALID_PAYMENT_METHOD' },
    });
    repository.record.mockResolvedValue({ kind: 'invoice-not-found' });
    await expect(service.recordInvoice(3, 999, {
      amount: '1.00',
      paymentMethod: PaymentMethod.OTHER,
    })).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });
});
