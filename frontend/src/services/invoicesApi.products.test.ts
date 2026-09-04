import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
} from './invoicesApi';
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
  });

  it('routes all product reads and mutations through GraphQL', async () => {
    vi.mocked(getProductsViaGraphql).mockResolvedValue([product]);
    vi.mocked(createProductViaGraphql).mockResolvedValue(product);
    vi.mocked(updateProductViaGraphql).mockResolvedValue(product);
    vi.mocked(deleteProductViaGraphql).mockResolvedValue({ success: true });
    await getProducts({}, 4);
    await createProduct(product, 4, 'product-create-key');
    await updateProduct(9, { name: 'Retainer' }, 4);
    await deleteProduct(9, 4);
    expect(getProductsViaGraphql).toHaveBeenCalledWith({}, 4);
    expect(createProductViaGraphql).toHaveBeenCalledWith(
      product,
      4,
      'product-create-key',
    );
    expect(updateProductViaGraphql).toHaveBeenCalledWith(
      9,
      { name: 'Retainer' },
      4,
    );
    expect(deleteProductViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
