import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createProductViaGraphql,
  deleteProductViaGraphql,
  getProductsViaGraphql,
  updateProductViaGraphql,
} from './productsGraphql';
import {
  isProductGraphqlMutationsEnabled,
  isProductGraphqlReadsEnabled,
} from './graphqlClient';

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
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('product-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps read and mutation rollback flags independent and default-off', () => {
    vi.stubEnv('VITE_PRODUCT_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_PRODUCT_MUTATIONS_GRAPHQL', 'false');
    expect(isProductGraphqlReadsEnabled()).toBe(false);
    expect(isProductGraphqlMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_PRODUCT_READS_GRAPHQL', 'true');
    expect(isProductGraphqlReadsEnabled()).toBe(true);
    expect(isProductGraphqlMutationsEnabled()).toBe(false);
  });

  it('pages reads and maps decimal strings into the legacy product shape', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            products: {
              nodes: [product],
              pageInfo: { hasNextPage: true },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            products: {
              nodes: [{ ...product, id: 10, name: 'Support' }],
              pageInfo: { hasNextPage: false },
            },
          },
        }),
      );
    const products = await getProductsViaGraphql(
      { is_active: true, search: 'ret' },
      4,
    );
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      id: 9,
      organization_id: 4,
      price: 1200.5,
      product_type: 'recurring',
      billing_period: 'monthly',
      tax_rate: 8.25,
    });
    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies.map((body) => body.variables.page.page)).toEqual([1, 2]);
    expect(bodies[0].variables.filter).toEqual({
      isActive: true,
      search: 'ret',
    });
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
