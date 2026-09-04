import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from '../services/api';
import { useDatabaseCategories } from './useDatabaseCategories';

const toast = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'category-token' }),
}));

vi.mock('./use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('../services/api', () => ({
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  getCategories: vi.fn(),
  updateCategory: vi.fn(),
}));

const category = {
  id: 4,
  name: 'Projects',
  color_value: '#3B82F6',
  created_at: '2026-09-03T12:00:00.000Z',
  updated_at: '2026-09-03T12:00:00.000Z',
};

describe('useDatabaseCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCategories).mockResolvedValue([]);
    vi.mocked(deleteCategory).mockResolvedValue({ deletedId: 4 });
    vi.mocked(updateCategory).mockResolvedValue(category);
  });

  it('retains one creation key across an ambiguous retry', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(createCategory)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(category);
    const { result, unmount } = renderHook(() => useDatabaseCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addCategory({ name: ' Projects ' });
    });
    await act(async () => {
      await result.current.addCategory({ name: ' Projects ' });
    });

    const calls = vi.mocked(createCategory).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toBe(calls[1][1]);
    expect(calls[0][2]).toBe('category-token');
    expect(result.current.categories).toEqual([category]);
    expect(toast).toHaveBeenCalledTimes(1);

    unmount();
    error.mockRestore();
  });
});
