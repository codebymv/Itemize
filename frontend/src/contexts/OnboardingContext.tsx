import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { onboardingService, OnboardingProgress } from '@/services/onboardingService';
import { useAuthState } from './AuthContext';
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
  const [progress, setProgress] = useState<OnboardingProgress>({});
  const [loading, setLoading] = useState(true);

  // Load progress when user authenticates
  const loadProgress = useCallback(async () => {
    if (!isAuthenticated || !currentUser) {
      setProgress({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await onboardingService.getProgress();
      setProgress(data);
    } catch (error) {
      logger.error('Failed to load onboarding progress', error);
      setProgress({});
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, currentUser]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const shouldShowOnboarding = useCallback((featureKey: string): boolean => {
    // Don't show during loading or when not authenticated
    if (loading || !isAuthenticated) return false;
    
    const featureProgress = progress?.[featureKey];
    
    // Show if never seen or explicitly not dismissed
    if (!featureProgress) return true;
    if (!featureProgress.seen) return true;
    if (featureProgress.dismissed) return false;
    
    return false;
  }, [progress, loading, isAuthenticated]);

  const markAsSeen = useCallback(async (featureKey: string, version: string = '1.0') => {
    try {
      console.log('[Onboarding] Calling markSeen API for:', featureKey);
      const updatedProgress = await onboardingService.markSeen(featureKey, version);
      console.log('[Onboarding] markSeen response:', updatedProgress);
      setProgress(updatedProgress);
      console.log('[Onboarding] Progress updated successfully');
    } catch (error) {
      console.error('[Onboarding] Failed to mark as seen:', error);
      logger.error('Failed to mark onboarding as seen', error);
      throw error;
    }
  }, []);

  const dismissOnboarding = useCallback(async (featureKey: string) => {
    try {
      const updatedProgress = await onboardingService.dismiss(featureKey);
      setProgress(updatedProgress);
    } catch (error) {
      logger.error('Failed to dismiss onboarding', error);
      throw error;
    }
  }, []);

  const completeStep = useCallback(async (featureKey: string, step: number) => {
    try {
      const updatedProgress = await onboardingService.completeStep(featureKey, step);
      setProgress(updatedProgress);
    } catch (error) {
      logger.error('Failed to complete onboarding step', error);
      throw error;
    }
  }, []);

  const resetOnboarding = useCallback(async (featureKey?: string) => {
    try {
      const updatedProgress = await onboardingService.reset(featureKey);
      setProgress(updatedProgress);
    } catch (error) {
      logger.error('Failed to reset onboarding', error);
      throw error;
    }
  }, []);

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
