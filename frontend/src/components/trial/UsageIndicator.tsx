/**
 * UsageIndicator Component
 * 
 * Displays resource consumption (emails, SMS, API calls) against plan limits.
 * Features visual progress bars with four states:
 * - Normal (<70%): Blue colors
 * - Warning (70-90%): Amber colors
 * - Critical (>90%): Red colors
 * - Unlimited: Green badge, no progress bar
 */

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export interface UsageIndicatorProps {
  /** Type of resource being tracked */
  resourceType: 'emails' | 'sms' | 'apiCalls';
  /** Current usage amount */
  used: number;
  /** Maximum limit (-1 or 0 for unlimited) */
  limit: number;
  /** Display label for the resource */
  label: string;
  /** Optional icon component */
  icon?: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

type UsageState = 'normal' | 'warning' | 'critical' | 'unlimited';

// ============================================
// Styling Configuration
// ============================================

const stateStyles = {
  normal: {
    container: 'bg-blue-100 dark:bg-blue-900',
    text: 'text-blue-800 dark:text-blue-300',
    progress: 'bg-blue-600',
  },
  warning: {
    container: 'bg-amber-100 dark:bg-amber-900',
    text: 'text-amber-800 dark:text-amber-300',
    progress: 'bg-amber-600',
  },
  critical: {
    container: 'bg-red-100 dark:bg-red-900',
    text: 'text-red-800 dark:text-red-300',
    progress: 'bg-red-600',
  },
  unlimited: {
    container: 'bg-green-100 dark:bg-green-900',
    text: 'text-green-800 dark:text-green-300',
    progress: 'bg-green-600',
  },
};

// ============================================
// Component
// ============================================

export function UsageIndicator({
  resourceType,
  used,
  limit,
  label,
  icon,
  className,
}: UsageIndicatorProps) {
  // Calculate percentage and determine state
  const isUnlimited = limit === -1 || limit === 0;
  const percentage = isUnlimited ? null : Math.round((used / limit) * 100);
  
  const state: UsageState = isUnlimited
    ? 'unlimited'
    : percentage! < 70
    ? 'normal'
    : percentage! < 90
    ? 'warning'
    : 'critical';

  const styles = stateStyles[state];
  const labelId = `usage-${resourceType}-label`;

  return (
    <div
      className={cn(
        'rounded-lg p-4 space-y-2',
        styles.container,
        className
      )}
    >
      {/* Header with icon and label */}
      <div className="flex items-center gap-2">
        {icon && (
          <div className={cn('flex-shrink-0', styles.text)} aria-hidden="true">
            {icon}
          </div>
        )}
        <h3
          id={labelId}
          className={cn('text-sm font-medium', styles.text)}
        >
          {label}
        </h3>
      </div>

      {/* Usage stats */}
      {isUnlimited ? (
        <div className={cn('text-xs font-semibold', styles.text)}>
          Unlimited
        </div>
      ) : (
        <>
          <div className={cn('text-xs', styles.text)}>
            {used.toLocaleString()} / {limit.toLocaleString()} ({percentage}%)
          </div>

          {/* Progress bar */}
          <div
            className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden"
            role="progressbar"
            aria-valuenow={used}
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-labelledby={labelId}
          >
            <div
              className={cn('h-full rounded-full transition-all duration-300', styles.progress)}
              style={{ width: `${Math.min(percentage!, 100)}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Responsive Grid Container
// ============================================

/**
 * Container component for usage indicators with responsive grid layout
 * - Desktop: 3-column grid
 * - Tablet: 2-column grid
 * - Mobile: Single column
 */
export function UsageIndicatorGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-4',
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  );
}
