import { ProductRow, ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

const row = (values: Partial<ProductRow> = {}): ProductRow => ({
  id: 11,
  organization_id: 4,
  name: 'Consultation',
  description: null,
  sku: 'CONSULT',
  price: '125.50',
  currency: 'USD',
  product_type: 'one_time',
  billing_period: null,
  tax_rate: '8.25',
  taxable: true,
  is_active: true,
  created_by: 7,
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  updated_at: new Date('2026-07-18T12:00:00.000Z'),
  ...values,
});

describe('ProductsService', () => {
  let repository: jest.Mocked<ProductsRepository>;
  let service: ProductsService;

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      findPage: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ProductsRepository>;
    service = new ProductsService(repository);
  });

  it('scopes, escapes, pages, and maps product reads', async () => {
    repository.findPage.mockResolvedValue({ rows: [row()], total: 1 });
    await expect(
      service.list(
        4,
        { isActive: true, search: ' 50%_off ' },
        { page: 2, pageSize: 10 },
      ),
    ).resolves.toMatchObject({
      nodes: [{
        id: 11,
        organizationId: 4,
        price: '125.50',
        taxRate: '8.25',
      }],
      pageInfo: { page: 2, pageSize: 10, total: 1 },
    });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 4,
      isActive: true,
      searchPattern: '%50\\%\\_off%',
      pageSize: 10,
      offset: 10,
    });
  });

  it('normalizes one-time creates and preserves decimal strings', async () => {
    repository.create.mockResolvedValue(row());
    await service.create(4, 7, {
      name: ' Consultation ',
      description: ' ',
      sku: ' CONSULT ',
      price: '125.50',
      currency: 'usd',
      productType: 'one_time',
      billingPeriod: 'monthly',
      taxRate: '8.25',
      taxable: true,
      isActive: true,
    });
    expect(repository.create).toHaveBeenCalledWith(4, 7, {
      name: 'Consultation',
      description: null,
      sku: 'CONSULT',
      price: '125.50',
      currency: 'USD',
      productType: 'one_time',
      billingPeriod: null,
      taxRate: '8.25',
      taxable: true,
      isActive: true,
    });
  });

  it('requires a valid billing period for recurring products', async () => {
    await expect(
      service.create(4, 7, {
        name: 'Retainer',
        price: '100',
        currency: 'USD',
        productType: 'recurring',
        taxRate: '0',
        taxable: true,
        isActive: true,
      }),
    ).rejects.toMatchObject({
      extensions: { reason: 'PRODUCT_BILLING_PERIOD_REQUIRED' },
    });
  });

  it('uses the stored type when validating partial updates', async () => {
    repository.findById.mockResolvedValue(row());
    repository.update.mockResolvedValue(row());
    await expect(
      service.update(4, 11, { billingPeriod: 'monthly' }),
    ).resolves.toMatchObject({ id: 11, billingPeriod: null });
    expect(repository.update).toHaveBeenCalledWith(4, 11, {
      billingPeriod: null,
    });

    repository.findById.mockResolvedValue(
      row({ product_type: 'recurring', billing_period: 'monthly' }),
    );
    await expect(
      service.update(4, 11, { billingPeriod: null }),
    ).rejects.toMatchObject({
      extensions: { reason: 'PRODUCT_BILLING_PERIOD_REQUIRED' },
    });
  });

  it('rejects malformed values and tenant-hidden products', async () => {
    await expect(
      service.create(4, 7, {
        name: 'Taxed',
        price: '10',
        currency: 'USD',
        productType: 'one_time',
        taxRate: '100.01',
        taxable: true,
        isActive: true,
      }),
    ).rejects.toMatchObject({
      extensions: { reason: 'INVALID_PRODUCT_TAXRATE' },
    });

    repository.findById.mockResolvedValue(null);
    await expect(
      service.update(4, 999, { name: 'Hidden' }),
    ).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    repository.delete.mockResolvedValue(false);
    await expect(service.delete(4, 999)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });
});
