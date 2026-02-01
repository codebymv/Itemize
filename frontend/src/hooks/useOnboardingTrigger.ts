import { useState, useEffect } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';

export const useOnboardingTrigger = (featureKey: string) => {
  const { shouldShowOnboarding, markAsSeen, dismissOnboarding } = useOnboarding();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (shouldShowOnboarding(featureKey)) {
      // Small delay to let page render first
      const timer = setTimeout(() => {
        setShowModal(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [featureKey, shouldShowOnboarding]);

  const handleComplete = async () => {
    await markAsSeen(featureKey);
    setShowModal(false);
  };

  const handleDismiss = async () => {
    await dismissOnboarding(featureKey);
    setShowModal(false);
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
