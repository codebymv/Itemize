/**
 * TrialBadge Component
 * 
 * Compact trial indicator for navigation headers and settings pages.
 * Displays days remaining in trial with two display modes:
 * - Compact: "Trial: Xd" format for tight spaces
 * - Full: "X days left in trial" with clock icon
 */

import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTrialStatus } from '@/hooks/useTrialStatus';

// ============================================
// Types
// ============================================

export interface TrialBadgeProps {
  /** ISO 8601 timestamp or Date object for trial end date */
  trialEndsAt: string | Date | null;
  /** Use compact format ("Trial: Xd") instead of full format */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// Component
// ============================================

export function TrialBadge({
  trialEndsAt,
  compact = false,
  className,
}: TrialBadgeProps) {
  const trialStatus = useTrialStatus(trialEndsAt);

  // Don't render if trial is not active
  if (!trialStatus.isInTrial) {
    return null;
  }

  const days = trialStatus.daysRemaining;
  const daysText = days === 1 ? 'day' : 'days';

  if (compact) {
    // Compact mode: "Trial: Xd"
    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
          'bg-amber-100 text-amber-800',
          'dark:bg-amber-900 dark:text-amber-300',
          className
        )}
        aria-label={`${days} ${daysText} remaining in trial period`}
      >
        Trial: {days}d
      </span>
    );
  }

  // Full mode: "X days left in trial" with icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
        'bg-amber-50 text-amber-800 border border-amber-200',
        'dark:bg-amber-900 dark:text-amber-300 dark:border-amber-800',
        'text-sm font-medium',
        className
      )}
      aria-label={`${days} ${daysText} remaining in trial period`}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{days} {daysText} left in trial</span>
    </span>
  );
}
