/**
 * TrialBanner Component
 * 
 * Displays a prominent sticky banner at the top of the application showing trial status.
 * Features three urgency states based on days remaining:
 * - Informational (>7 days): Blue background, calm messaging
 * - Warning (3-7 days): Amber background, warning messaging
 * - Urgent (<3 days): Red background, urgent messaging
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTrialStatus } from '@/hooks/useTrialStatus';

// ============================================
// Types
// ============================================

export interface TrialBannerProps {
  /** ISO 8601 timestamp or Date object for trial end date */
  trialEndsAt: string | Date | null;
  /** Name of the plan being trialed (e.g., "Starter", "Agency Unlimited") */
  trialPlan?: string;
  /** Callback when banner is dismissed */
  onDismiss?: () => void;
  /** Additional CSS classes */
  className?: string;
}

type UrgencyState = 'informational' | 'warning' | 'urgent';

// ============================================
// Styling Configuration
// ============================================

const urgencyStyles = {
  informational: {
    container: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-400',
    button: 'border-blue-600 text-blue-700 hover:bg-blue-100 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-900',
  },
  warning: {
    container: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800',
    text: 'text-amber-800 dark:text-amber-300',
    icon: 'text-amber-600 dark:text-amber-400',
    button: 'border-amber-600 text-amber-700 hover:bg-amber-100 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-900',
  },
  urgent: {
    container: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-300',
    icon: 'text-red-600 dark:text-red-400',
    button: 'bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 border-red-600 text-red-700 dark:border-red-400 dark:text-red-300',
  },
};

// ============================================
// Component
// ============================================

export function TrialBanner({
  trialEndsAt,
  trialPlan = 'trial',
  onDismiss,
  className,
}: TrialBannerProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const trialStatus = useTrialStatus(trialEndsAt);

  // Don't render if trial is not active or has been dismissed
  if (!trialStatus.isInTrial || dismissed) {
    return null;
  }

  // Determine urgency state
  const urgencyState: UrgencyState = trialStatus.isUrgent
    ? 'urgent'
    : trialStatus.isActive
    ? 'warning'
    : 'informational';

  const styles = urgencyStyles[urgencyState];
  const Icon = urgencyState === 'urgent' ? AlertCircle : Clock;

  // Format trial end date
  const formatDate = (dateStr: string | Date | null) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  // Generate message based on urgency
  const getMessage = () => {
    const days = trialStatus.daysRemaining;
    const formattedDate = formatDate(trialEndsAt);

    if (urgencyState === 'urgent') {
      return `Trial Ending Soon! Your ${trialPlan} trial ends in ${days} ${days === 1 ? 'day' : 'days'}`;
    } else if (urgencyState === 'warning') {
      return `You have ${days} days remaining in your ${trialPlan} trial`;
    } else {
      return `Your ${trialPlan} trial ends on ${formattedDate} (${days} ${days === 1 ? 'day' : 'days'})`;
    }
  };

  const handleAddPayment = () => {
    navigate('/settings?tab=billing');
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      className={cn(
        'sticky top-0 z-50 border-b font-sans',
        styles.container,
        className
      )}
      role="banner"
      aria-label="Trial status banner"
      aria-live="polite"
    >
      <div className="container mx-auto px-4 py-4">
        {/* Desktop Layout */}
        <div className="hidden md:flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Icon className={cn('h-5 w-5 flex-shrink-0', styles.icon)} aria-hidden="true" />
            <p className={cn('text-sm font-semibold', styles.text)}>
              {getMessage()}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddPayment}
              className={cn(
                'px-4 py-2 text-sm font-medium border rounded-md transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-offset-2',
                styles.button
              )}
              aria-label="Navigate to billing settings to add payment method"
            >
              Add Payment Method
            </button>
            
            {onDismiss && (
              <button
                onClick={handleDismiss}
                className={cn(
                  'p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2',
                  styles.text
                )}
                aria-label="Dismiss trial banner"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="flex md:hidden flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1">
              <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', styles.icon)} aria-hidden="true" />
              <p className={cn('text-sm font-semibold', styles.text)}>
                {urgencyState === 'urgent'
                  ? `Trial ends in ${trialStatus.daysRemaining} ${trialStatus.daysRemaining === 1 ? 'day' : 'days'}!`
                  : `${trialStatus.daysRemaining} ${trialStatus.daysRemaining === 1 ? 'day' : 'days'} left in trial`}
              </p>
            </div>
            
            {onDismiss && (
              <button
                onClick={handleDismiss}
                className={cn(
                  'p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2',
                  styles.text
                )}
                aria-label="Dismiss trial banner"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          <button
            onClick={handleAddPayment}
            className={cn(
              'w-full px-4 py-2 text-sm font-medium border rounded-md transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              'min-h-[44px]', // Touch-friendly minimum size
              styles.button
            )}
            aria-label="Navigate to billing settings to add payment method"
          >
            Add Payment Method
          </button>
        </div>
      </div>
    </div>
  );
}
