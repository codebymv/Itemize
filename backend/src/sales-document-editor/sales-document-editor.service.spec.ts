import { ContactsService } from '../contacts/contacts.service';
import { EstimatesService } from '../estimates/estimates.service';
import { InvoiceBusinessesService } from '../invoice-businesses/invoice-businesses.service';
import { InvoiceSettingsService } from '../invoice-settings/invoice-settings.service';
import { InvoicesService } from '../invoices/invoices.service';
import { ProductsService } from '../products/products.service';
import { SalesDocumentEditorService } from './sales-document-editor.service';

describe('SalesDocumentEditorService', () => {
  const contacts = { list: jest.fn(), get: jest.fn() };
  const products = { list: jest.fn() };
  const businesses = { list: jest.fn() };
  const settings = { get: jest.fn() };
  const invoices = { get: jest.fn() };
  const estimates = { get: jest.fn() };
  const service = new SalesDocumentEditorService(
    contacts as unknown as ContactsService,
    products as unknown as ProductsService,
    businesses as unknown as InvoiceBusinessesService,
    settings as unknown as InvoiceSettingsService,
    invoices as unknown as InvoicesService,
    estimates as unknown as EstimatesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    contacts.list.mockResolvedValue({
      nodes: [{ id: 11 }],
      pageInfo: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    products.list.mockResolvedValue({
      nodes: [{ id: 21 }],
      pageInfo: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      stats: { total: 1, active: 1, inactive: 0, oneTime: 1, recurring: 0 },
    });
    businesses.list.mockResolvedValue({
      nodes: [{ id: 31 }],
      pageInfo: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    });
    settings.get.mockResolvedValue({ organizationId: 42 });
    invoices.get.mockResolvedValue({ id: 41 });
    estimates.get.mockResolvedValue({ id: 51 });
  });

  it('returns the complete invoice editor bootstrap in one service operation', async () => {
    await expect(service.invoiceBootstrap(42, 41, true)).resolves.toMatchObject({
      contacts: [{ id: 11 }],
      products: [{ id: 21 }],
      businesses: [{ id: 31 }],
      settings: { organizationId: 42 },
      invoice: { id: 41 },
    });

    expect(invoices.get).toHaveBeenCalledWith(42, 41);
    expect(products.list).toHaveBeenCalledWith(
      42,
      { isActive: true },
      expect.objectContaining({ page: 1, pageSize: 100 }),
    );
  });

  it('bounds compatibility product and business catalogs to one page', async () => {
    products.list.mockResolvedValueOnce({
      nodes: [{ id: 21 }],
      pageInfo: { page: 1, pageSize: 100, total: 101, totalPages: 2 },
      stats: { total: 101, active: 101, inactive: 0, oneTime: 101, recurring: 0 },
    });
    businesses.list.mockResolvedValueOnce({
      nodes: [{ id: 31 }],
      pageInfo: { page: 1, pageSize: 100, total: 101, totalPages: 2 },
    });

    const result = await service.invoiceBootstrap(42, null, true);

    expect(result.products).toEqual([{ id: 21 }]);
    expect(result.businesses).toEqual([{ id: 31 }]);
    expect(result.invoice).toBeNull();
    expect(invoices.get).not.toHaveBeenCalled();
    expect(products.list).toHaveBeenCalledTimes(1);
    expect(businesses.list).toHaveBeenCalledTimes(1);
  });

  it('does not query the legacy product catalog when the field is omitted', async () => {
    const invoice = await service.invoiceBootstrap(42);
    const estimate = await service.estimateBootstrap(42);

    expect(invoice.products).toEqual([]);
    expect(estimate.products).toEqual([]);
    expect(products.list).not.toHaveBeenCalled();
  });

  it('reuses a listed initial contact and fetches only an unlisted one', async () => {
    const listed = await service.estimateBootstrap(42, null, 11);
    expect(listed.initialContact).toEqual({ id: 11 });
    expect(contacts.get).not.toHaveBeenCalled();

    contacts.get.mockResolvedValue({ id: 99 });
    const unlisted = await service.estimateBootstrap(42, 51, 99);
    expect(unlisted.initialContact).toEqual({ id: 99 });
    expect(contacts.get).toHaveBeenCalledWith(42, 99);
    expect(estimates.get).toHaveBeenCalledWith(42, 51);
  });
});
