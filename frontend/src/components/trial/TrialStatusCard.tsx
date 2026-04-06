/**
 * TrialStatusCard Component
 * 
 * Displays detailed trial information on the billing page.
 * Shows trial start/end dates, plan name, countdown, and Subscribe Now CTA.
 */

import { useState } from 'react';
import { Calendar, Clock, CreditCard, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { useBillingStatus } from '@/hooks/useBillingStatus';
import { redirectToCheckout } from '@/services/billingApi';

// ============================================
// Types
// ============================================

export interface TrialStatusCardProps {
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// Component
// ============================================

export function TrialStatusCard({ className }: TrialStatusCardProps) {
  const { data: billingStatus, isLoading, error } = useBillingStatus();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const trialStatus = useTrialStatus(billingStatus?.trial_ends_at || null);

  // Don't render if not in trial
  if (!billingStatus || !trialStatus.isInTrial) {
    return null;
  }

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  // Determine urgency styling
  const urgencyState = trialStatus.isUrgent
    ? 'urgent'
    : trialStatus.isActive
    ? 'warning'
    : 'informational';

  const urgencyStyles = {
    informational: 'text-blue-600 dark:text-blue-400',
    warning: 'text-amber-600 dark:text-amber-400',
    urgent: 'text-red-600 dark:text-red-400',
  };

  const handleSubscribe = async () => {
    try {
      setIsRedirecting(true);
      await redirectToCheckout({
        planId: billingStatus.plan,
        billingPeriod: billingStatus.billing_period || 'monthly',
      });
    } catch (error) {
      console.error('Failed to redirect to checkout:', error);
      setIsRedirecting(false);
      // Error will be shown by the redirectToCheckout function
    }
  };

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 p-6', className)}>
        <p className="text-sm text-red-800 dark:text-red-300">
          Failed to load trial status. Please refresh the page.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-gradient-to-br from-blue-50 to-indigo-50',
        'dark:from-blue-950 dark:to-indigo-950',
        'border-blue-200 dark:border-blue-800',
        'p-6 space-y-4',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Trial Status
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            You're currently on a {billingStatus.plan} trial
          </p>
        </div>
        <div className={cn('text-3xl font-bold', urgencyStyles[urgencyState])}>
          {trialStatus.daysRemaining}
          <span className="text-sm font-normal ml-1">
            {trialStatus.daysRemaining === 1 ? 'day' : 'days'}
          </span>
        </div>
      </div>

      {/* Trial Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 text-gray-500 dark:text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Trial Started
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
              {formatDate(billingStatus.billing_period_start)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-gray-500 dark:text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Trial Ends
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
              {formatDate(billingStatus.trial_ends_at)}
            </p>
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <div className="pt-2">
        <button
          onClick={handleSubscribe}
          disabled={isRedirecting}
          className={cn(
            'w-full sm:w-auto px-6 py-3 rounded-lg font-semibold text-white',
            'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
            'transition-colors duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center gap-2'
          )}
          aria-label="Subscribe now to continue service"
        >
          {isRedirecting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Redirecting...</span>
            </>
          ) : (
            <>
              <CreditCard className="h-5 w-5" />
              <span>Subscribe Now</span>
            </>
          )}
        </button>
      </div>

      {/* Info Text */}
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Subscribe before your trial ends to continue using all features without interruption.
      </p>
    </div>
  );
}
