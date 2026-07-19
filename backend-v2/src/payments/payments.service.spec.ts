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
});
