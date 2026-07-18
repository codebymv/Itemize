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

// Note: The api interceptor already unwraps { success, data } responses,
// so response.data is already the unwrapped data

export const onboardingService = {
  /**
   * Get user's complete onboarding progress
   */
  async getProgress(): Promise<OnboardingProgress> {
    if (isOnboardingGraphqlReadsEnabled()) {
      return getOnboardingProgressViaGraphql();
    }
    const response = await api.get('/api/onboarding/progress');
    return response.data || {};
  },

  /**
   * Get specific feature's onboarding status
   */
  async getFeatureProgress(feature: string): Promise<OnboardingFeatureProgress> {
    if (isOnboardingGraphqlReadsEnabled()) {
      return getOnboardingFeatureProgressViaGraphql(feature);
    }
    const response = await api.get(`/api/onboarding/progress/${feature}`);
    return response.data;
  },

  /**
   * Mark a feature as seen
   */
  async markSeen(feature: string, version: string = '1.0'): Promise<OnboardingProgress> {
    if (isOnboardingGraphqlMutationsEnabled()) {
      return markOnboardingSeenViaGraphql(feature, version);
    }
    const response = await api.post('/api/onboarding/mark-seen', { feature, version });
    return response.data || {};
  },

  /**
   * Dismiss a feature's onboarding
   */
  async dismiss(feature: string): Promise<OnboardingProgress> {
    if (isOnboardingGraphqlMutationsEnabled()) {
      return dismissOnboardingViaGraphql(feature);
    }
    const response = await api.post('/api/onboarding/dismiss', { feature });
    return response.data || {};
  },

  /**
   * Mark a specific step as completed
   */
  async completeStep(feature: string, step: number): Promise<OnboardingProgress> {
    if (isOnboardingGraphqlMutationsEnabled()) {
      return completeOnboardingStepViaGraphql(feature, step);
    }
    const response = await api.post('/api/onboarding/complete-step', { feature, step });
    return response.data || {};
  },

  /**
   * Reset onboarding progress
   */
  async reset(feature?: string): Promise<OnboardingProgress> {
    if (isOnboardingGraphqlMutationsEnabled()) {
      return resetOnboardingViaGraphql(feature);
    }
    const response = await api.delete('/api/onboarding/reset', {
      params: feature ? { feature } : undefined,
    });
    return response.data || {};
  },
};
