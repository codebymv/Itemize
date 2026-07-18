import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createCategoryViaGraphql,
  deleteCategoryViaGraphql,
  getCategoriesViaGraphql,
  updateCategoryViaGraphql,
} from './categoriesGraphql';
import {
  isCategoryGraphqlMutationsEnabled,
  isCategoryGraphqlReadsEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const category = {
  id: 4,
  name: 'Projects',
  colorValue: '#3B82F6',
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:01:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('category GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('category-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps read and mutation rollback flags independent and default-off', () => {
    vi.stubEnv('VITE_CATEGORY_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_CATEGORY_MUTATIONS_GRAPHQL', 'false');
    expect(isCategoryGraphqlReadsEnabled()).toBe(false);
    expect(isCategoryGraphqlMutationsEnabled()).toBe(false);

    vi.stubEnv('VITE_CATEGORY_READS_GRAPHQL', 'true');
    expect(isCategoryGraphqlReadsEnabled()).toBe(true);
    expect(isCategoryGraphqlMutationsEnabled()).toBe(false);

    vi.stubEnv('VITE_CATEGORY_MUTATIONS_GRAPHQL', 'true');
    expect(isCategoryGraphqlMutationsEnabled()).toBe(true);
  });

  it('maps GraphQL casing into the existing category contract', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: { categories: [category] } }),
    );
    await expect(getCategoriesViaGraphql()).resolves.toEqual([
      {
        id: 4,
        name: 'Projects',
        color_value: '#3B82F6',
        created_at: category.createdAt,
        updated_at: category.updatedAt,
      },
    ]);
  });

  it('maps mutation inputs, obtains CSRF, and verifies delete identity', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createCategory: category } }))
      .mockResolvedValueOnce(response({ data: { updateCategory: category } }))
      .mockResolvedValueOnce(
        response({ data: { deleteCategory: { deletedId: 4 } } }),
      );

    await createCategoryViaGraphql({
      name: 'Projects',
      color_value: '#3B82F6',
    });
    await updateCategoryViaGraphql(4, {
      name: 'Projects',
      color_value: '#ABC',
    });
    await expect(deleteCategoryViaGraphql(4)).resolves.toEqual({
      deletedId: 4,
    });

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables).toEqual({
      input: { name: 'Projects', colorValue: '#3B82F6' },
    });
    expect(bodies[1].variables).toEqual({
      id: 4,
      input: { name: 'Projects', colorValue: '#ABC' },
    });
    expect(bodies[2].variables).toEqual({ id: 4 });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(3);
  });
});
