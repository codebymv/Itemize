import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from './api';
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
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('./graphqlClient', () => ({
  isCategoryGraphqlMutationsEnabled: vi.fn(),
  isCategoryGraphqlReadsEnabled: vi.fn(),
}));

vi.mock('./categoriesGraphql', () => ({
  createCategoryViaGraphql: vi.fn(),
  deleteCategoryViaGraphql: vi.fn(),
  getCategoriesViaGraphql: vi.fn(),
  updateCategoryViaGraphql: vi.fn(),
}));

const category = {
  id: 4,
  name: 'Projects',
  color_value: '#3B82F6',
  created_at: '2026-07-18T12:00:00.000Z',
  updated_at: '2026-07-18T12:01:00.000Z',
};

describe('category API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCategoryGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isCategoryGraphqlMutationsEnabled).mockReturnValue(false);
  });

  it('keeps every operation on REST by default', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [category] });
    vi.mocked(api.post).mockResolvedValue({ data: category });
    vi.mocked(api.put).mockResolvedValue({ data: category });
    vi.mocked(api.delete).mockResolvedValue({ data: { message: 'deleted' } });

    await getCategories('legacy-token');
    await createCategory({ name: 'Projects' }, 'legacy-token');
    await updateCategory(4, { name: 'Projects' }, 'legacy-token');
    await deleteCategory(4, 'legacy-token');

    expect(api.get).toHaveBeenCalledWith('/api/categories', { headers: {} });
    expect(api.post).toHaveBeenCalledWith(
      '/api/categories',
      { name: 'Projects' },
      { headers: {} },
    );
    expect(api.put).toHaveBeenCalledWith(
      '/api/categories/4',
      { name: 'Projects' },
      { headers: {} },
    );
    expect(api.delete).toHaveBeenCalledWith('/api/categories/4', {
      headers: {},
    });
    expect(getCategoriesViaGraphql).not.toHaveBeenCalled();
  });

  it('routes reads and mutations independently when enabled', async () => {
    vi.mocked(isCategoryGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(isCategoryGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(getCategoriesViaGraphql).mockResolvedValue([category]);
    vi.mocked(createCategoryViaGraphql).mockResolvedValue(category);
    vi.mocked(updateCategoryViaGraphql).mockResolvedValue(category);
    vi.mocked(deleteCategoryViaGraphql).mockResolvedValue({ deletedId: 4 });

    await getCategories();
    await createCategory({ name: 'Projects' });
    await updateCategory(4, { name: 'Projects' });
    await deleteCategory(4);

    expect(getCategoriesViaGraphql).toHaveBeenCalled();
    expect(createCategoryViaGraphql).toHaveBeenCalledWith({
      name: 'Projects',
    });
    expect(updateCategoryViaGraphql).toHaveBeenCalledWith(4, {
      name: 'Projects',
    });
    expect(deleteCategoryViaGraphql).toHaveBeenCalledWith(4);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
