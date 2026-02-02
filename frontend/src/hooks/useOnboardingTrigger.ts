import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useAuthState } from '@/contexts/AuthContext';
import { getOnboardingKeyForRoute } from '@/config/onboardingRouteMap';

/**
 * Hook to trigger onboarding for a specific feature
 * @param featureKey - The explicit feature key to use for onboarding
 */
export const useOnboardingTrigger = (featureKey: string) => {
  const { shouldShowOnboarding, markAsSeen, dismissOnboarding, loading } = useOnboarding();
  const { isAuthenticated } = useAuthState();
  const [showModal, setShowModal] = useState(false);
  const sessionExpiredRef = useRef(false);

  // Listen for session expiration FIRST - set flag and close modal
  useEffect(() => {
    const handleSessionExpired = () => {
      sessionExpiredRef.current = true;
      setShowModal(false);
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    // Don't show if not authenticated
    if (!isAuthenticated) return;
    
    // Wait for loading to complete before checking
    if (loading) return;
    
    if (shouldShowOnboarding(featureKey)) {
      // Short delay to let page settle before showing modal
      const timer = setTimeout(() => {
        // Check if session expired during the delay
        if (sessionExpiredRef.current) return;
        
        // Double-check we're still on the same page and not redirecting
        if (document.visibilityState === 'visible' && isAuthenticated) {
          setShowModal(true);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [featureKey, shouldShowOnboarding, loading, isAuthenticated]);

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
    featureKey, // Expose the key being used
  };
};

/**
 * Route-aware onboarding hook that automatically determines the correct
 * onboarding key based on the current route.
 * 
 * Handles:
 * - Collapsible sidebar groups (e.g., /recurring-invoices shows "invoices" onboarding)
 * - Mobile redirects (e.g., /contents shows "canvas" onboarding)
 * - Direct route mappings
 * 
 * @returns Onboarding trigger controls, or null values if no onboarding for this route
 */
export const useRouteOnboarding = () => {
  const location = useLocation();
  const onboardingKey = getOnboardingKeyForRoute(location.pathname);
  
  const { shouldShowOnboarding, markAsSeen, dismissOnboarding, loading } = useOnboarding();
  const { isAuthenticated } = useAuthState();
  const [showModal, setShowModal] = useState(false);
  const sessionExpiredRef = useRef(false);

  // Listen for session expiration FIRST - set flag and close modal
  useEffect(() => {
    const handleSessionExpired = () => {
      sessionExpiredRef.current = true;
      setShowModal(false);
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    // No onboarding for this route
    if (!onboardingKey) return;
    
    // Don't show if not authenticated
    if (!isAuthenticated) return;
    
    // Wait for loading to complete before checking
    if (loading) return;
    
    if (shouldShowOnboarding(onboardingKey)) {
      // Short delay to let page settle before showing modal
      const timer = setTimeout(() => {
        // Check if session expired during the delay
        if (sessionExpiredRef.current) return;
        
        if (document.visibilityState === 'visible' && isAuthenticated) {
          setShowModal(true);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [onboardingKey, shouldShowOnboarding, loading, isAuthenticated]);

  // Close modal on route change
  useEffect(() => {
    setShowModal(false);
  }, [location.pathname]);

  const handleComplete = async () => {
    if (!onboardingKey) return;
    console.log('[RouteOnboarding] handleComplete called for:', onboardingKey);
    try {
      await markAsSeen(onboardingKey);
      console.log('[RouteOnboarding] markAsSeen succeeded');
      setShowModal(false);
    } catch (error) {
      console.error(`[RouteOnboarding] Failed to mark onboarding as seen for ${onboardingKey}`, error);
      setShowModal(false);
    }
  };

  const handleDismiss = async () => {
    if (!onboardingKey) return;
    try {
      await dismissOnboarding(onboardingKey);
      setShowModal(false);
    } catch (error) {
      console.error(`Failed to dismiss onboarding for ${onboardingKey}`, error);
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
    featureKey: onboardingKey,
    hasOnboarding: !!onboardingKey,
  };
};
