import {
  InvoiceSettingsRepository,
  InvoiceSettingsRow,
} from './invoice-settings.repository';
import { InvoiceSettingsService } from './invoice-settings.service';

const row = (values: Partial<InvoiceSettingsRow> = {}): InvoiceSettingsRow => ({
  id: 7,
  organization_id: 3,
  stripe_account_id: null,
  stripe_publishable_key: null,
  stripe_connected: false,
  stripe_connected_at: null,
  invoice_prefix: 'INV-',
  next_invoice_number: 12,
  default_payment_terms: 30,
  default_notes: null,
  default_terms: null,
  default_tax_rate: '10.00',
  tax_id: null,
  business_name: null,
  business_address: null,
  business_phone: null,
  business_email: null,
  logo_url: null,
  default_currency: 'USD',
  created_at: new Date('2026-07-20T12:00:00.000Z'),
  updated_at: new Date('2026-07-20T12:00:00.000Z'),
  ...values,
});

describe('InvoiceSettingsService', () => {
  let repository: jest.Mocked<InvoiceSettingsRepository>;
  let service: InvoiceSettingsService;

  beforeEach(() => {
    repository = {
      find: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<InvoiceSettingsRepository>;
    service = new InvoiceSettingsService(repository);
  });

  it('returns retained defaults without creating a settings row', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get(3)).resolves.toMatchObject({
      id: null,
      organizationId: 3,
      invoicePrefix: 'INV-',
      nextInvoiceNumber: 1,
      defaultPaymentTerms: 30,
      defaultTaxRate: '10.00',
      defaultCurrency: 'USD',
      stripeConnected: false,
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('normalizes writes while preserving omitted and clearing optional fields', async () => {
    repository.update.mockResolvedValue({
      kind: 'saved',
      row: row({
        invoice_prefix: 'BILL-',
        default_notes: null,
        business_email: 'billing@example.com',
      }),
    });
    await service.update(3, {
      invoicePrefix: ' BILL- ',
      defaultNotes: ' ',
      defaultTaxRate: '8.25',
      businessEmail: ' billing@example.com ',
      defaultCurrency: 'usd',
    });
    expect(repository.update).toHaveBeenCalledWith(3, {
      invoicePrefix: 'BILL-',
      defaultNotes: null,
      defaultTaxRate: '8.25',
      businessEmail: 'billing@example.com',
      defaultCurrency: 'USD',
    });
  });

  it('rejects unsafe fields before database work', async () => {
    await expect(service.update(3, { invoicePrefix: 'BAD PREFIX!' }))
      .rejects.toMatchObject({ extensions: { reason: 'INVALID_INVOICE_PREFIX' } });
    await expect(service.update(3, { defaultTaxRate: '100.01' }))
      .rejects.toMatchObject({ extensions: { reason: 'INVALID_DEFAULT_TAX_RATE' } });
    await expect(service.update(3, { defaultCurrency: null }))
      .rejects.toMatchObject({ extensions: { reason: 'NULL_INVOICE_SETTINGS_FIELD' } });
    await expect(service.update(3, { businessEmail: 'invalid' }))
      .rejects.toMatchObject({ extensions: { reason: 'INVALID_BUSINESS_EMAIL' } });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('maps counter and invoice-number conflicts', async () => {
    repository.update.mockResolvedValueOnce({
      kind: 'counter-regression',
      current: 12,
    });
    await expect(service.update(3, { nextInvoiceNumber: 11 }))
      .rejects.toMatchObject({
        extensions: {
          code: 'CONFLICT',
          reason: 'INVOICE_COUNTER_REGRESSION',
          current: 12,
        },
      });
    repository.update.mockResolvedValueOnce({
      kind: 'invoice-number-conflict',
      invoiceNumber: 'INV-00012',
    });
    await expect(service.update(3, { nextInvoiceNumber: 12 }))
      .rejects.toMatchObject({
        extensions: {
          code: 'CONFLICT',
          reason: 'INVOICE_NUMBER_ALREADY_EXISTS',
        },
      });
  });
});
