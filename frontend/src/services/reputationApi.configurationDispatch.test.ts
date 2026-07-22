import api from '@/lib/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deletePlatformViaGraphql } from './reputationConfigurationGraphql';
import { deleteReviewViaGraphql } from './reputationReviewsGraphql';
import {
  isReputationPlatformsGraphqlEnabled,
  isReputationReviewsGraphqlEnabled,
} from './graphqlClient';
import { deleteReview, removePlatform } from './reputationApi';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./graphqlClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./graphqlClient')>(),
  isReputationPlatformsGraphqlEnabled: vi.fn(),
  isReputationReviewsGraphqlEnabled: vi.fn(),
}));

vi.mock('./reputationConfigurationGraphql', async (importOriginal) => ({
  ...await importOriginal<typeof import('./reputationConfigurationGraphql')>(),
  deletePlatformViaGraphql: vi.fn(),
}));

vi.mock('./reputationReviewsGraphql', async (importOriginal) => ({
  ...await importOriginal<typeof import('./reputationReviewsGraphql')>(),
  deleteReviewViaGraphql: vi.fn(),
}));

describe('reputation API configuration transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isReputationPlatformsGraphqlEnabled).mockReturnValue(false);
    vi.mocked(isReputationReviewsGraphqlEnabled).mockReturnValue(false);
  });

  it('routes platform deletion through its independent GraphQL boundary', async () => {
    vi.mocked(isReputationPlatformsGraphqlEnabled).mockReturnValue(true);
    vi.mocked(deletePlatformViaGraphql).mockResolvedValue({ success: true });

    await expect(removePlatform(17, 3)).resolves.toEqual({ success: true });

    expect(deletePlatformViaGraphql).toHaveBeenCalledWith(17, 3);
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('never lets the platform flag intercept review deletion', async () => {
    vi.mocked(isReputationPlatformsGraphqlEnabled).mockReturnValue(true);
    vi.mocked(isReputationReviewsGraphqlEnabled).mockReturnValue(true);
    vi.mocked(deleteReviewViaGraphql).mockResolvedValue({ success: true });

    await expect(deleteReview(29, 3)).resolves.toEqual({ success: true });

    expect(deleteReviewViaGraphql).toHaveBeenCalledWith(29, 3);
    expect(deletePlatformViaGraphql).not.toHaveBeenCalled();
  });

  it('retains REST platform deletion while the platform flag is disabled', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });

    await expect(removePlatform(17, 3)).resolves.toEqual({ success: true });

    expect(api.delete).toHaveBeenCalledWith(
      '/api/reputation/platforms/17',
      { headers: { 'x-organization-id': '3' } },
    );
    expect(deletePlatformViaGraphql).not.toHaveBeenCalled();
  });
});
