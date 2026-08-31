import React, { memo } from 'react';
import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type EmptyStateKind = 'collection' | 'results' | 'passive' | 'inline';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  action?: React.ReactNode;
  className?: string;
  size?: 'default' | 'compact';
  kind?: EmptyStateKind;
}

export const EmptyState = memo(({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  action,
  className,
  size = 'default',
  kind = 'collection',
}: EmptyStateProps) => {
  const compact = size === 'compact' || kind === 'inline';
  const isResultsState = kind === 'results';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        compact ? 'py-6' : 'py-12',
        className,
      )}
      data-empty-state={kind}
      role={isResultsState ? 'status' : undefined}
      aria-live={isResultsState ? 'polite' : undefined}
      aria-atomic={isResultsState ? 'true' : undefined}
    >
      {Icon ? (
        <div className={cn(
          'flex shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40',
          compact ? 'mb-2 h-8 w-8' : 'mb-4 h-12 w-12',
        )}>
          <Icon
            aria-hidden="true"
            className={cn('text-blue-600 dark:text-blue-400', compact ? 'h-4 w-4' : 'h-6 w-6')}
          />
        </div>
      ) : null}
      <h3 className={cn('font-medium', compact ? 'text-sm' : 'text-lg')}>{title}</h3>
      {description ? (
        <p className={cn('mx-auto mt-2 max-w-md text-sm leading-5 text-muted-foreground', compact && 'mt-1')}>
          {description}
        </p>
      ) : null}
      {action ? (
        <div className={cn('mt-4', compact && 'mt-3')}>
          {action}
        </div>
      ) : onAction && actionLabel ? (
        <Button
          type="button"
          variant={isResultsState ? 'outline' : 'default'}
          onClick={onAction}
          className={cn(
            'mt-4 h-11',
            !isResultsState && 'bg-blue-600 text-white interaction-button--primary',
            compact && 'mt-3',
          )}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
});

EmptyState.displayName = 'EmptyState';
