import {
  InvoiceBusinessRow,
  InvoiceBusinessesRepository,
} from './invoice-businesses.repository';
import { InvoiceBusinessesService } from './invoice-businesses.service';

const row = (values: Partial<InvoiceBusinessRow> = {}): InvoiceBusinessRow => ({
  id: 6,
  organization_id: 3,
  name: 'Itemize Studio',
  email: 'billing@itemize.test',
  phone: null,
  address: 'Phoenix, AZ',
  tax_id: null,
  logo_url: '/uploads/logos/safe.png',
  is_active: true,
  last_used_at: new Date('2026-07-18T12:00:00.000Z'),
  created_at: new Date('2026-07-17T12:00:00.000Z'),
  updated_at: new Date('2026-07-18T12:00:00.000Z'),
  ...values,
});

describe('InvoiceBusinessesService', () => {
  let repository: jest.Mocked<InvoiceBusinessesRepository>;
  let service: InvoiceBusinessesService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<InvoiceBusinessesRepository>;
    service = new InvoiceBusinessesService(repository);
  });

  it('pages active business reads and maps timestamps', async () => {
    repository.findPage.mockResolvedValue({ rows: [row()], total: 1 });
    await expect(
      service.list(3, { page: 2, pageSize: 10 }),
    ).resolves.toMatchObject({
      nodes: [{
        id: 6,
        organizationId: 3,
        taxId: null,
        logoUrl: '/uploads/logos/safe.png',
      }],
      pageInfo: { page: 2, pageSize: 10, total: 1 },
    });
    expect(repository.findPage).toHaveBeenCalledWith(3, 10, 10);
  });

  it('normalizes create fields without accepting logo ownership', async () => {
    repository.create.mockResolvedValue(row());
    await service.create(3, {
      name: ' Itemize Studio ',
      email: ' billing@itemize.test ',
      phone: ' ',
      address: ' Phoenix, AZ ',
      taxId: null,
    });
    expect(repository.create).toHaveBeenCalledWith(3, {
      name: 'Itemize Studio',
      email: 'billing@itemize.test',
      phone: null,
      address: 'Phoenix, AZ',
      taxId: null,
    });
  });

  it('preserves omissions and clears explicitly blank optional fields', async () => {
    repository.update.mockResolvedValue(
      row({ email: null, address: null, is_active: false }),
    );
    await service.update(3, 6, {
      email: '',
      address: null,
      isActive: false,
    });
    expect(repository.update).toHaveBeenCalledWith(3, 6, {
      email: null,
      address: null,
      isActive: false,
    });
  });

  it('rejects malformed inputs and tenant-hidden rows', async () => {
    await expect(service.find(3, 0)).rejects.toMatchObject({
      extensions: { reason: 'INVALID_INVOICE_BUSINESS_ID' },
    });
    await expect(service.create(3, { name: ' ' })).rejects.toMatchObject({
      extensions: { reason: 'INVALID_INVOICE_BUSINESS_NAME' },
    });
    await expect(
      service.update(3, 6, { name: null }),
    ).rejects.toMatchObject({
      extensions: { reason: 'NULL_INVOICE_BUSINESS_FIELD' },
    });
    repository.findById.mockResolvedValue(null);
    await expect(service.find(3, 999)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });

  it('soft-deletes inside the organization boundary', async () => {
    repository.deactivate.mockResolvedValue(true);
    await expect(service.delete(3, 6)).resolves.toEqual({
      deletedId: 6,
      success: true,
    });
    repository.deactivate.mockResolvedValue(false);
    await expect(service.delete(3, 999)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });
});
