import {
  completeOnboardingStepViaGraphql,
  dismissOnboardingViaGraphql,
  getOnboardingFeatureProgressViaGraphql,
  getOnboardingProgressViaGraphql,
  markOnboardingSeenViaGraphql,
  resetOnboardingViaGraphql,
} from './onboardingGraphql';

export interface OnboardingFeatureProgress {
  seen: boolean;
  timestamp?: string;
  version?: string;
  dismissed?: boolean;
  step_completed?: number;
}

export interface OnboardingProgress {
  [featureKey: string]: OnboardingFeatureProgress;
}

export const onboardingService = {
  /**
   * Get user's complete onboarding progress
   */
  async getProgress(): Promise<OnboardingProgress> {
    return getOnboardingProgressViaGraphql();
  },

  /**
   * Get specific feature's onboarding status
   */
  async getFeatureProgress(feature: string): Promise<OnboardingFeatureProgress> {
    return getOnboardingFeatureProgressViaGraphql(feature);
  },

  /**
   * Mark a feature as seen
   */
  async markSeen(feature: string, version: string = '1.0'): Promise<OnboardingProgress> {
    return markOnboardingSeenViaGraphql(feature, version);
  },

  /**
   * Dismiss a feature's onboarding
   */
  async dismiss(feature: string): Promise<OnboardingProgress> {
    return dismissOnboardingViaGraphql(feature);
  },

  /**
   * Mark a specific step as completed
   */
  async completeStep(feature: string, step: number): Promise<OnboardingProgress> {
    return completeOnboardingStepViaGraphql(feature, step);
  },

  /**
   * Reset onboarding progress
   */
  async reset(feature?: string): Promise<OnboardingProgress> {
    return resetOnboardingViaGraphql(feature);
  },
};
