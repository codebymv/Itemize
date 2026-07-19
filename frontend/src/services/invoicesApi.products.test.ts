import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
} from './invoicesApi';
import {
  isProductGraphqlMutationsEnabled,
  isProductGraphqlReadsEnabled,
} from './graphqlClient';
import {
  createProductViaGraphql,
  deleteProductViaGraphql,
  getProductsViaGraphql,
  updateProductViaGraphql,
} from './productsGraphql';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));
vi.mock('./graphqlClient', () => ({
  isProductGraphqlMutationsEnabled: vi.fn(),
  isProductGraphqlReadsEnabled: vi.fn(),
}));
vi.mock('./productsGraphql', () => ({
  createProductViaGraphql: vi.fn(),
  deleteProductViaGraphql: vi.fn(),
  getProductsViaGraphql: vi.fn(),
  updateProductViaGraphql: vi.fn(),
}));

const product = {
  id: 9,
  organization_id: 4,
  name: 'Retainer',
  price: 1200.5,
  currency: 'USD',
  product_type: 'recurring' as const,
  billing_period: 'monthly' as const,
  tax_rate: 8.25,
  taxable: true,
  is_active: true,
  created_at: '2026-07-18T12:00:00.000Z',
  updated_at: '2026-07-18T12:01:00.000Z',
};

describe('product API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isProductGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isProductGraphqlMutationsEnabled).mockReturnValue(false);
  });

  it('keeps all product operations on REST by default', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [product] } });
    vi.mocked(api.post).mockResolvedValue({ data: { data: product } });
    vi.mocked(api.put).mockResolvedValue({ data: { data: product } });
    vi.mocked(api.delete).mockResolvedValue({
      data: { data: { success: true } },
    });
    await getProducts({ is_active: true }, 4);
    await createProduct(product, 4);
    await updateProduct(9, { name: 'Retainer' }, 4);
    await deleteProduct(9, 4);
    const headers = { 'x-organization-id': '4' };
    expect(api.get).toHaveBeenCalledWith('/api/invoices/products', {
      params: { is_active: true },
      headers,
    });
    expect(api.post).toHaveBeenCalled();
    expect(api.put).toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalled();
    expect(getProductsViaGraphql).not.toHaveBeenCalled();
  });

  it('routes reads and mutations independently when enabled', async () => {
    vi.mocked(isProductGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(isProductGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(getProductsViaGraphql).mockResolvedValue([product]);
    vi.mocked(createProductViaGraphql).mockResolvedValue(product);
    vi.mocked(updateProductViaGraphql).mockResolvedValue(product);
    vi.mocked(deleteProductViaGraphql).mockResolvedValue({ success: true });
    await getProducts({}, 4);
    await createProduct(product, 4);
    await updateProduct(9, { name: 'Retainer' }, 4);
    await deleteProduct(9, 4);
    expect(getProductsViaGraphql).toHaveBeenCalledWith({}, 4);
    expect(createProductViaGraphql).toHaveBeenCalledWith(product, 4);
    expect(updateProductViaGraphql).toHaveBeenCalledWith(
      9,
      { name: 'Retainer' },
      4,
    );
    expect(deleteProductViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(api.get).not.toHaveBeenCalled();
  });
});
