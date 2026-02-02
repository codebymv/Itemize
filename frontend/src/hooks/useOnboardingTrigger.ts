import { useState, useEffect } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';

export const useOnboardingTrigger = (featureKey: string) => {
  const { shouldShowOnboarding, markAsSeen, dismissOnboarding, loading } = useOnboarding();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Wait for loading to complete before checking
    if (loading) return;
    
    if (shouldShowOnboarding(featureKey)) {
      // Longer delay to allow auth verification to complete
      // This prevents showing modal right before session-expired redirect
      const timer = setTimeout(() => {
        // Double-check we're still on the same page and not redirecting
        if (document.visibilityState === 'visible') {
          setShowModal(true);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [featureKey, shouldShowOnboarding, loading]);

  // Listen for session expiration and close modal immediately
  useEffect(() => {
    const handleSessionExpired = () => {
      setShowModal(false);
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
    };
  }, []);

  const handleComplete = async () => {
    console.log('[OnboardingTrigger] handleComplete called for:', featureKey);
    try {
      await markAsSeen(featureKey);
      console.log('[OnboardingTrigger] markAsSeen succeeded');
      setShowModal(false);
    } catch (error) {
      console.error(`[OnboardingTrigger] Failed to mark onboarding as seen for ${featureKey}`, error);
      // Still close the modal even if saving fails
      setShowModal(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await dismissOnboarding(featureKey);
      setShowModal(false);
    } catch (error) {
      console.error(`Failed to dismiss onboarding for ${featureKey}`, error);
      // Still close the modal even if saving fails
      setShowModal(false);
    }
  };

  const handleClose = () => {
    setShowModal(false);
  };

  return {
    showModal,
    handleComplete,
    handleDismiss,
    handleClose,
  };
};
