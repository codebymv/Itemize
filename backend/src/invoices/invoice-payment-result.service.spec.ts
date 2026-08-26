import { InvoicePaymentResultRepository } from './invoice-payment-result.repository';
import { InvoicePaymentResultService } from './invoice-payment-result.service';

describe('InvoicePaymentResultService', () => {
  const repository = {
    findBySessionId: jest.fn(),
  } as unknown as jest.Mocked<InvoicePaymentResultRepository>;
  const service = new InvoicePaymentResultService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('maps a paid capability without exposing internal identifiers', async () => {
    repository.findBySessionId.mockResolvedValue({
      invoice_number: 'INV-00003',
      business_name: 'Itemize Studio',
      amount: '125.00',
      currency: 'USD',
      status: 'paid',
      updated_at: new Date('2026-08-26T12:00:00.000Z'),
    });

    await expect(service.get('cs_test_Receipt123')).resolves.toEqual({
      invoiceNumber: 'INV-00003',
      businessName: 'Itemize Studio',
      amount: '125.00',
      currency: 'USD',
      status: 'paid',
      updatedAt: new Date('2026-08-26T12:00:00.000Z'),
    });
  });

  it('rejects malformed public session capabilities before database access', async () => {
    await expect(service.get('../invoice/3')).resolves.toBeNull();
    expect(repository.findBySessionId).not.toHaveBeenCalled();
  });
});
