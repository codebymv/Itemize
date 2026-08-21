import type { OnboardingFeatureProgress } from '@/services/onboardingService';

export const shouldShowFeatureOnboarding = (
  featureProgress: OnboardingFeatureProgress | undefined,
  currentVersion: string,
): boolean => {
  if (!featureProgress) return true;
  if (featureProgress.dismissed) return false;
  if (!featureProgress.seen) return true;

  return (featureProgress.version ?? '1.0') !== currentVersion;
};
