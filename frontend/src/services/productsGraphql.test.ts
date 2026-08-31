import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createProductViaGraphql,
  deleteProductViaGraphql,
  getProductPageViaGraphql,
  getProductsViaGraphql,
  resetProductListCapability,
  updateProductViaGraphql,
} from './productsGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const product = {
  id: 9,
  organizationId: 4,
  name: 'Retainer',
  description: null,
  sku: 'RET',
  price: '1200.50',
  currency: 'USD',
  productType: 'recurring',
  billingPeriod: 'monthly',
  taxRate: '8.25',
  taxable: true,
  isActive: true,
  createdById: 7,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:01:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('product GraphQL consumer', () => {
  beforeEach(() => {
    resetProductListCapability();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('product-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('loads one bounded product page with global catalog statistics', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: { products: {
      nodes: [product],
      pageInfo: { page: 2, pageSize: 20, total: 21, totalPages: 2, hasNextPage: false },
      stats: { total: 40, active: 32, inactive: 8, oneTime: 25, recurring: 15 },
    } } }));
    const result = await getProductPageViaGraphql({
      is_active: true,
      product_type: 'recurring',
      search: ' ret ',
      page: 2,
      limit: 20,
    }, 4, controller.signal);
    expect(result).toMatchObject({
      pagination: { page: 2, limit: 20, total: 21, totalPages: 2 },
      stats: { total: 40, active: 32, inactive: 8, oneTime: 25, recurring: 15 },
    });
    expect(result.products[0]).toMatchObject({
      id: 9,
      organization_id: 4,
      price: 1200.5,
      product_type: 'recurring',
      billing_period: 'monthly',
      tax_rate: 8.25,
    });
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.variables.page).toEqual({ page: 2, pageSize: 20 });
    expect(body.variables.filter).toEqual({
      isActive: true,
      productType: 'recurring',
      search: 'ret',
    });
    expect((vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  it('preserves the explicit all-products adapter for editor rollout compatibility', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { products: {
        nodes: [product],
        pageInfo: { page: 1, pageSize: 100, total: 101, totalPages: 2, hasNextPage: true },
        stats: { total: 101, active: 101, inactive: 0, oneTime: 0, recurring: 101 },
      } } }))
      .mockResolvedValueOnce(response({ data: { products: {
        nodes: [{ ...product, id: 10 }],
        pageInfo: { page: 2, pageSize: 100, total: 101, totalPages: 2, hasNextPage: false },
        stats: { total: 101, active: 101, inactive: 0, oneTime: 0, recurring: 101 },
      } } }));
    await expect(getProductsViaGraphql({}, 4)).resolves.toHaveLength(2);
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies.map((body) => body.variables.page.page)).toEqual([1, 2]);
  });

  it('maps mutation casing, supplies recurring defaults, and verifies delete', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createProduct: product } }))
      .mockResolvedValueOnce(response({ data: { updateProduct: product } }))
      .mockResolvedValueOnce(
        response({
          data: { deleteProduct: { deletedId: 9, success: true } },
        }),
      );

    await createProductViaGraphql({
      name: 'Retainer',
      price: 1200.5,
      product_type: 'recurring',
    });
    await updateProductViaGraphql(9, {
      description: '',
      tax_rate: 8.25,
      is_active: false,
    });
    await expect(deleteProductViaGraphql(9)).resolves.toEqual({
      success: true,
    });

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables.input).toMatchObject({
      name: 'Retainer',
      price: '1200.5',
      productType: 'recurring',
      billingPeriod: 'monthly',
    });
    expect(bodies[1].variables).toEqual({
      id: 9,
      input: { description: null, taxRate: '8.25', isActive: false },
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(3);
  });
});
