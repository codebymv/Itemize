import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { getSharedVault } from './api';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('retained public vault sharing HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the public vault data already unwrapped by the shared API client', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { id: 7, title: 'Shared vault', items: [] },
    });

    await expect(getSharedVault('token')).resolves.toEqual({ id: 7, title: 'Shared vault', items: [] });
  });
});
