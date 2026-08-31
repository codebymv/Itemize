import { InvoiceBusinessesService } from '../invoice-businesses/invoice-businesses.service';
import { RecurringInvoicesService } from '../recurring-invoices/recurring-invoices.service';
import { RecurringInvoicePreviewService } from './recurring-invoice-preview.service';

describe('RecurringInvoicePreviewService', () => {
  const recurringInvoices = {
    get: jest.fn(),
    previewInvoiceNumber: jest.fn(),
  } as unknown as jest.Mocked<RecurringInvoicesService>;
  const businesses = {
    list: jest.fn(),
  } as unknown as jest.Mocked<InvoiceBusinessesService>;
  const service = new RecurringInvoicePreviewService(
    recurringInvoices,
    businesses,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns the complete expanded preview through one route read model', async () => {
    const recurringInvoice = { id: 8, templateName: 'Retainer' } as never;
    const business = { id: 3, name: 'Itemize' } as never;
    recurringInvoices.get.mockResolvedValue(recurringInvoice);
    recurringInvoices.previewInvoiceNumber.mockResolvedValue('INV-00042');
    businesses.list.mockResolvedValue({
      nodes: [business],
      pageInfo: {} as never,
    });

    await expect(service.bootstrap(4, 8)).resolves.toEqual({
      recurringInvoice,
      previewInvoiceNumber: 'INV-00042',
      business,
    });
    expect(recurringInvoices.get).toHaveBeenCalledWith(4, 8);
    expect(recurringInvoices.previewInvoiceNumber).toHaveBeenCalledWith(4);
    expect(businesses.list).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ page: 1, pageSize: 1 }),
    );
  });

  it('keeps preview rendering valid when no business profile exists', async () => {
    recurringInvoices.get.mockResolvedValue({ id: 8 } as never);
    recurringInvoices.previewInvoiceNumber.mockResolvedValue('INV-00042');
    businesses.list.mockResolvedValue({ nodes: [], pageInfo: {} as never });

    await expect(service.bootstrap(4, 8)).resolves.toMatchObject({
      business: null,
    });
  });
});
