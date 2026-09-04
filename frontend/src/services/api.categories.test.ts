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

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
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

describe('category API GraphQL transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes every operation through GraphQL', async () => {
    vi.mocked(getCategoriesViaGraphql).mockResolvedValue([category]);
    vi.mocked(createCategoryViaGraphql).mockResolvedValue(category);
    vi.mocked(updateCategoryViaGraphql).mockResolvedValue(category);
    vi.mocked(deleteCategoryViaGraphql).mockResolvedValue({ deletedId: 4 });

    await getCategories('ignored-token');
    await createCategory(
      { name: 'Projects' },
      'category-create-key',
      'ignored-token',
    );
    await updateCategory(4, { name: 'Projects' }, 'ignored-token');
    await deleteCategory(4, 'ignored-token');

    expect(getCategoriesViaGraphql).toHaveBeenCalled();
    expect(createCategoryViaGraphql).toHaveBeenCalledWith(
      { name: 'Projects' },
      'category-create-key',
    );
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
