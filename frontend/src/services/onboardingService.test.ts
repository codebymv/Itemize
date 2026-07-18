import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  isOnboardingGraphqlMutationsEnabled,
  isOnboardingGraphqlReadsEnabled,
} from './graphqlClient';
import {
  completeOnboardingStepViaGraphql,
  dismissOnboardingViaGraphql,
  getOnboardingFeatureProgressViaGraphql,
  getOnboardingProgressViaGraphql,
  markOnboardingSeenViaGraphql,
  resetOnboardingViaGraphql,
} from './onboardingGraphql';
import { onboardingService } from './onboardingService';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('./graphqlClient', () => ({
  isOnboardingGraphqlMutationsEnabled: vi.fn(),
  isOnboardingGraphqlReadsEnabled: vi.fn(),
}));

vi.mock('./onboardingGraphql', () => ({
  completeOnboardingStepViaGraphql: vi.fn(),
  dismissOnboardingViaGraphql: vi.fn(),
  getOnboardingFeatureProgressViaGraphql: vi.fn(),
  getOnboardingProgressViaGraphql: vi.fn(),
  markOnboardingSeenViaGraphql: vi.fn(),
  resetOnboardingViaGraphql: vi.fn(),
}));

describe('onboarding service transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOnboardingGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isOnboardingGraphqlMutationsEnabled).mockReturnValue(false);
  });

  it('keeps all operations on REST by default', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { dashboard: { seen: true } } })
      .mockResolvedValueOnce({ data: { seen: true } });
    vi.mocked(api.post).mockResolvedValue({
      data: { dashboard: { seen: true } },
    });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });

    await onboardingService.getProgress();
    await onboardingService.getFeatureProgress('dashboard');
    await onboardingService.markSeen('dashboard', '2.0');
    await onboardingService.dismiss('dashboard');
    await onboardingService.completeStep('dashboard', 2);
    await onboardingService.reset('dashboard');

    expect(api.get).toHaveBeenNthCalledWith(1, '/api/onboarding/progress');
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      '/api/onboarding/progress/dashboard',
    );
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      '/api/onboarding/mark-seen',
      { feature: 'dashboard', version: '2.0' },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/api/onboarding/dismiss',
      { feature: 'dashboard' },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      3,
      '/api/onboarding/complete-step',
      { feature: 'dashboard', step: 2 },
    );
    expect(api.delete).toHaveBeenCalledWith('/api/onboarding/reset', {
      params: { feature: 'dashboard' },
    });
    expect(getOnboardingProgressViaGraphql).not.toHaveBeenCalled();
  });

  it('routes reads and mutations independently when enabled', async () => {
    vi.mocked(isOnboardingGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(isOnboardingGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(getOnboardingProgressViaGraphql).mockResolvedValue({});
    vi.mocked(getOnboardingFeatureProgressViaGraphql).mockResolvedValue({
      seen: false,
    });
    vi.mocked(markOnboardingSeenViaGraphql).mockResolvedValue({});
    vi.mocked(dismissOnboardingViaGraphql).mockResolvedValue({});
    vi.mocked(completeOnboardingStepViaGraphql).mockResolvedValue({});
    vi.mocked(resetOnboardingViaGraphql).mockResolvedValue({});

    await onboardingService.getProgress();
    await onboardingService.getFeatureProgress('dashboard');
    await onboardingService.markSeen('dashboard', '2.0');
    await onboardingService.dismiss('dashboard');
    await onboardingService.completeStep('dashboard', 2);
    await onboardingService.reset();

    expect(getOnboardingProgressViaGraphql).toHaveBeenCalled();
    expect(getOnboardingFeatureProgressViaGraphql).toHaveBeenCalledWith(
      'dashboard',
    );
    expect(markOnboardingSeenViaGraphql).toHaveBeenCalledWith(
      'dashboard',
      '2.0',
    );
    expect(dismissOnboardingViaGraphql).toHaveBeenCalledWith('dashboard');
    expect(completeOnboardingStepViaGraphql).toHaveBeenCalledWith(
      'dashboard',
      2,
    );
    expect(resetOnboardingViaGraphql).toHaveBeenCalledWith(undefined);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
