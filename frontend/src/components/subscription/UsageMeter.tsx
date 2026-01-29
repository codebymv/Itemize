/**
 * Usage Meter Component
 * Displays usage progress for a specific resource
 */

import React from 'react';
import { useSubscriptionFeatures, UsageType } from '../../contexts/SubscriptionContext';
import { AlertTriangle, CheckCircle, Infinity, TrendingUp } from 'lucide-react';

interface UsageMeterProps {
  /**
   * The resource type to display
   */
  resource: UsageType;
  
  /**
   * Display label (defaults to resource name)
   */
  label?: string;
  
  /**
   * Show as compact inline meter
   */
  compact?: boolean;
  
  /**
   * Show the actual numbers
   */
  showNumbers?: boolean;
  
  /**
   * Custom class names
   */
  className?: string;
}

const RESOURCE_LABELS: Record<UsageType, string> = {
  organizations: 'Organizations',
  contacts_per_org: 'Contacts',
  users_per_org: 'Team Members',
  workflows: 'Workflows',
  emails_per_month: 'Emails (Monthly)',
  sms_per_month: 'SMS (Monthly)',
  landing_pages: 'Landing Pages',
  api_calls_per_day: 'API Calls (Daily)',
  forms: 'Forms'
};

export function UsageMeter({
  resource,
  label,
  compact = false,
  showNumbers = true,
  className = ''
}: UsageMeterProps) {
  const { getUsageInfo } = useSubscriptionFeatures();
  
  const usage = getUsageInfo(resource);
  const displayLabel = label || RESOURCE_LABELS[resource] || resource;

  if (!usage) {
    return null;
  }

  const { current, limit, percentage, remaining, unlimited, isApproaching, isExceeded } = usage;

  // Get color based on usage percentage
  const getColorClass = () => {
    if (unlimited) return 'bg-green-500';
    if (isExceeded) return 'bg-red-500';
    if (isApproaching) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const getTextColorClass = () => {
    if (unlimited) return 'text-green-600';
    if (isExceeded) return 'text-red-600';
    if (isApproaching) return 'text-yellow-600';
    return 'text-muted-foreground';
  };

  // Compact display
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${getColorClass()}`}
            style={{ width: unlimited ? '0%' : `${Math.min(percentage, 100)}%` }}
          />
        </div>
        {unlimited ? (
          <Infinity className="w-4 h-4 text-green-600" />
        ) : (
          <span className={`text-xs ${getTextColorClass()}`}>
            {current}/{limit}
          </span>
        )}
      </div>
    );
  }

  // Full display
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{displayLabel}</span>
        <div className="flex items-center gap-2">
          {unlimited ? (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Infinity className="w-4 h-4" />
              Unlimited
            </span>
          ) : isExceeded ? (
            <span className="flex items-center gap-1 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4" />
              Limit Reached
            </span>
          ) : isApproaching ? (
            <span className="flex items-center gap-1 text-sm text-yellow-600">
              <TrendingUp className="w-4 h-4" />
              {remaining} remaining
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              Good
            </span>
          )}
        </div>
      </div>
      
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all ${getColorClass()}`}
          style={{ width: unlimited ? '0%' : `${Math.min(percentage, 100)}%` }}
        />
      </div>
      
      {showNumbers && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {current.toLocaleString()} used
          </span>
          <span>
            {unlimited ? 'No limit' : `${typeof limit === 'number' ? limit.toLocaleString() : limit} total`}
          </span>
        </div>
      )}
    </div>
  );
}

export default UsageMeter;
