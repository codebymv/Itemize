import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { getSharedVault, shareVault, unshareVault } from './api';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('vault sharing API consumer contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unwraps the share response envelope', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { success: true, data: { shareToken: 'token', shareUrl: 'https://itemize.cloud/shared/vault/token' } },
    });

    await expect(shareVault(7, 'session')).resolves.toEqual({
      shareToken: 'token',
      shareUrl: 'https://itemize.cloud/shared/vault/token',
    });
  });

  it('unwraps the public vault response envelope', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: { id: 7, title: 'Shared vault', items: [] } },
    });

    await expect(getSharedVault('token')).resolves.toEqual({ id: 7, title: 'Shared vault', items: [] });
  });

  it('unwraps the unshare response envelope', async () => {
    vi.mocked(api.delete).mockResolvedValue({
      data: { success: true, data: { message: 'Vault sharing disabled' } },
    });

    await expect(unshareVault(7, 'session')).resolves.toEqual({ message: 'Vault sharing disabled' });
  });
});
