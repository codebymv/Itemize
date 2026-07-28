import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeOnboardingStepViaGraphql,
  dismissOnboardingViaGraphql,
  getOnboardingFeatureProgressViaGraphql,
  getOnboardingProgressViaGraphql,
  markOnboardingSeenViaGraphql,
  resetOnboardingViaGraphql,
} from './onboardingGraphql';
import { onboardingService } from './onboardingService';

vi.mock('./onboardingGraphql', () => ({
  completeOnboardingStepViaGraphql: vi.fn(),
  dismissOnboardingViaGraphql: vi.fn(),
  getOnboardingFeatureProgressViaGraphql: vi.fn(),
  getOnboardingProgressViaGraphql: vi.fn(),
  markOnboardingSeenViaGraphql: vi.fn(),
  resetOnboardingViaGraphql: vi.fn(),
}));

describe('onboarding GraphQL service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates all operations to GraphQL', async () => {
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
    await onboardingService.reset('dashboard');

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
    expect(resetOnboardingViaGraphql).toHaveBeenCalledWith('dashboard');
  });
});
