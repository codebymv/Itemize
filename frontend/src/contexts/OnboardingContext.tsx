import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { onboardingService, OnboardingProgress } from '@/services/onboardingService';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { shouldShowFeatureOnboarding } from '@/lib/onboardingVersion';
import { useAuthState, isPublicAuthSkipPath } from './AuthContext';
import { useOrganizationContext } from './organization-context';
import { useOrganizationBootstrap } from '@/hooks/useOrganizationBootstrap';
import {
  organizationBootstrapQueryKey,
  type OrganizationBootstrap,
} from '@/services/organizationBootstrapGraphql';
import logger from '@/lib/logger';

interface OnboardingContextType {
  progress: OnboardingProgress;
  loading: boolean;
  shouldShowOnboarding: (featureKey: string) => boolean;
  markAsSeen: (featureKey: string, version?: string) => Promise<void>;
  dismissOnboarding: (featureKey: string) => Promise<void>;
  completeStep: (featureKey: string, step: number) => Promise<void>;
  resetOnboarding: (featureKey?: string) => Promise<void>;
  refreshProgress: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
};

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentUser } = useAuthState();
  const { organizationId } = useOrganizationContext();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid;
  const { pathname } = useLocation();
  const skipFetch = isPublicAuthSkipPath(pathname);
  const [progress, setProgress] = useState<OnboardingProgress>({});
  const [loading, setLoading] = useState(true);
  const bootstrapEnabled = !skipFetch && isAuthenticated && !!userId && organizationId !== null;
  const bootstrap = useOrganizationBootstrap(bootstrapEnabled);
  const commitProgress = useCallback((nextProgress: OnboardingProgress) => {
    setProgress(nextProgress);
    queryClient.setQueryData<OrganizationBootstrap>(organizationBootstrapQueryKey(organizationId), (current) => (
      current ? { ...current, onboardingProgress: nextProgress } : current
    ));
  }, [organizationId, queryClient]);

  // Explicit refreshes update only onboarding; initial shell hydration is shared.
  const loadProgress = useCallback(async () => {
    if (skipFetch || !isAuthenticated || !userId) {
      setProgress({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await onboardingService.getProgress();
      commitProgress(data);
    } catch (error) {
      logger.error('Failed to load onboarding progress', error);
      setProgress({});
    } finally {
      setLoading(false);
    }
  }, [commitProgress, skipFetch, isAuthenticated, userId]);

  useEffect(() => {
    if (!bootstrapEnabled) {
      setProgress({});
      setLoading(false);
      return;
    }
    if (bootstrap.data) {
      setProgress(bootstrap.data.onboardingProgress);
      setLoading(false);
      return;
    }
    setLoading(bootstrap.isLoading);
    if (bootstrap.error) {
      logger.error('Failed to load onboarding progress', bootstrap.error);
      setProgress({});
    }
  }, [bootstrap.data, bootstrap.error, bootstrap.isLoading, bootstrapEnabled]);

  const shouldShowOnboarding = useCallback((featureKey: string): boolean => {
    // Don't show during loading or when not authenticated
    if (loading || !isAuthenticated) return false;
    
    const featureProgress = progress?.[featureKey];
    const currentVersion = ONBOARDING_CONTENT[featureKey]?.version ?? '1.0';

    return shouldShowFeatureOnboarding(featureProgress, currentVersion);
  }, [progress, loading, isAuthenticated]);

  const markAsSeen = useCallback(async (
    featureKey: string,
    version: string = ONBOARDING_CONTENT[featureKey]?.version ?? '1.0',
  ) => {
    try {
      console.log('[Onboarding] Calling markSeen API for:', featureKey);
      const updatedProgress = await onboardingService.markSeen(featureKey, version);
      console.log('[Onboarding] markSeen response:', updatedProgress);
      commitProgress(updatedProgress);
      console.log('[Onboarding] Progress updated successfully');
    } catch (error) {
      console.error('[Onboarding] Failed to mark as seen:', error);
      logger.error('Failed to mark onboarding as seen', error);
      throw error;
    }
  }, [commitProgress]);

  const dismissOnboarding = useCallback(async (featureKey: string) => {
    try {
      const updatedProgress = await onboardingService.dismiss(featureKey);
      commitProgress(updatedProgress);
    } catch (error) {
      logger.error('Failed to dismiss onboarding', error);
      throw error;
    }
  }, [commitProgress]);

  const completeStep = useCallback(async (featureKey: string, step: number) => {
    try {
      const updatedProgress = await onboardingService.completeStep(featureKey, step);
      commitProgress(updatedProgress);
    } catch (error) {
      logger.error('Failed to complete onboarding step', error);
      throw error;
    }
  }, [commitProgress]);

  const resetOnboarding = useCallback(async (featureKey?: string) => {
    try {
      const updatedProgress = await onboardingService.reset(featureKey);
      commitProgress(updatedProgress);
    } catch (error) {
      logger.error('Failed to reset onboarding', error);
      throw error;
    }
  }, [commitProgress]);

  const refreshProgress = useCallback(async () => {
    await loadProgress();
  }, [loadProgress]);

  const value: OnboardingContextType = {
    progress,
    loading,
    shouldShowOnboarding,
    markAsSeen,
    dismissOnboarding,
    completeStep,
    resetOnboarding,
    refreshProgress,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
};
