import { useState, useEffect } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';

export const useOnboardingTrigger = (featureKey: string) => {
  const { shouldShowOnboarding, markAsSeen, dismissOnboarding, loading } = useOnboarding();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Wait for loading to complete before checking
    if (loading) return;
    
    if (shouldShowOnboarding(featureKey)) {
      // Small delay to let page render first
      const timer = setTimeout(() => {
        setShowModal(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [featureKey, shouldShowOnboarding, loading]);

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
