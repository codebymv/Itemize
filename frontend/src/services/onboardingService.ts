import api from '@/lib/api';

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
    const response = await api.get('/onboarding/progress');
    return response.data.data; // Unwrap { success: true, data: {...} }
  },

  /**
   * Get specific feature's onboarding status
   */
  async getFeatureProgress(feature: string): Promise<OnboardingFeatureProgress> {
    const response = await api.get(`/onboarding/progress/${feature}`);
    return response.data.data;
  },

  /**
   * Mark a feature as seen
   */
  async markSeen(feature: string, version: string = '1.0'): Promise<OnboardingProgress> {
    const response = await api.post('/onboarding/mark-seen', { feature, version });
    return response.data.data;
  },

  /**
   * Dismiss a feature's onboarding
   */
  async dismiss(feature: string): Promise<OnboardingProgress> {
    const response = await api.post('/onboarding/dismiss', { feature });
    return response.data.data;
  },

  /**
   * Mark a specific step as completed
   */
  async completeStep(feature: string, step: number): Promise<OnboardingProgress> {
    const response = await api.post('/onboarding/complete-step', { feature, step });
    return response.data.data;
  },

  /**
   * Reset onboarding progress
   */
  async reset(feature?: string): Promise<OnboardingProgress> {
    const url = feature ? `/onboarding/reset?feature=${feature}` : '/onboarding/reset';
    const response = await api.delete(url);
    return response.data.data;
  },
};
