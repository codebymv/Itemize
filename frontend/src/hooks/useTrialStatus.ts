/**
 * useTrialStatus Hook
 * 
 * Centralized hook for calculating trial status from trial_ends_at timestamp.
 * Provides consistent trial state calculations across all components.
 * 
 * @param trialEndsAt - ISO 8601 timestamp or Date object representing trial end date
 * @returns TrialStatus object with calculated state flags
 */

import { useMemo } from 'react';

export interface TrialStatus {
  /** True if trial is currently active (daysRemaining > 0) */
  isInTrial: boolean;
  /** Number of days remaining until trial expires (ceiling of days) */
  daysRemaining: number;
  /** True if trial has expired (daysRemaining <= 0) */
  hasExpired: boolean;
  /** True if trial is in urgent state (1-3 days remaining) */
  isUrgent: boolean;
  /** True if trial is in active warning state (4-7 days remaining) */
  isActive: boolean;
}

/**
 * Calculate trial status from trial end date
 * 
 * State transitions:
 * - daysRemaining > 7: informational state (isInTrial=true, isActive=false, isUrgent=false)
 * - 4 ≤ daysRemaining ≤ 7: warning state (isInTrial=true, isActive=true, isUrgent=false)
 * - 1 ≤ daysRemaining ≤ 3: urgent state (isInTrial=true, isActive=false, isUrgent=true)
 * - daysRemaining ≤ 0: expired (isInTrial=false, hasExpired=true)
 */
export function useTrialStatus(trialEndsAt: string | Date | null): TrialStatus {
  return useMemo(() => {
    // Handle null/undefined input with safe defaults
    if (!trialEndsAt) {
      return {
        isInTrial: false,
        daysRemaining: 0,
        hasExpired: false,
        isUrgent: false,
        isActive: false,
      };
    }

    try {
      // Parse trial end date
      const trialEnd = new Date(trialEndsAt);
      
      // Validate date
      if (isNaN(trialEnd.getTime())) {
        console.error('Invalid trial date:', trialEndsAt);
        return {
          isInTrial: false,
          daysRemaining: 0,
          hasExpired: false,
          isUrgent: false,
          isActive: false,
        };
      }

      // Calculate days remaining using ceiling to round up partial days
      const now = new Date();
      const diffMs = trialEnd.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Determine state flags based on days remaining
      const isInTrial = daysRemaining > 0;
      const hasExpired = daysRemaining <= 0;
      const isUrgent = daysRemaining > 0 && daysRemaining <= 3;
      const isActive = daysRemaining >= 4 && daysRemaining <= 7;

      return {
        isInTrial,
        daysRemaining: Math.max(0, daysRemaining), // Never return negative days
        hasExpired,
        isUrgent,
        isActive,
      };
    } catch (error) {
      console.error('Error calculating trial status:', error);
      return {
        isInTrial: false,
        daysRemaining: 0,
        hasExpired: false,
        isUrgent: false,
        isActive: false,
      };
    }
  }, [trialEndsAt]); // Recalculate when trialEndsAt changes
}
