import React, { memo, type ReactNode } from 'react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ErrorStateKind = 'page' | 'section' | 'inline';

interface ErrorStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
  kind?: ErrorStateKind;
}

export const ErrorState = memo(({
  title = 'Unable to load content',
  description = "We couldn't load this content. Try again.",
  icon: Icon = AlertTriangle,
  actionLabel = 'Try again',
  onAction,
  onRetry,
  action,
  className,
  kind = 'section',
}: ErrorStateProps) => {
  const compact = kind === 'inline';
  const actionHandler = onRetry ?? onAction;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        compact ? 'py-6' : 'py-12',
        className,
      )}
      data-error-state={kind}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className={cn(
        'flex shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
        compact ? 'mb-2 h-8 w-8' : 'mb-4 h-12 w-12',
      )}>
        <Icon
          aria-hidden="true"
          className={cn('text-destructive', compact ? 'h-4 w-4' : 'h-6 w-6')}
        />
      </div>
      <h3 className={cn('font-medium', compact ? 'text-sm' : 'text-lg')}>{title}</h3>
      {description ? (
        <p className={cn('mx-auto mt-2 max-w-md text-sm leading-5 text-muted-foreground', compact && 'mt-1')}>
          {description}
        </p>
      ) : null}
      {action ? (
        <div className={cn('mt-4', compact && 'mt-3')}>{action}</div>
      ) : actionHandler ? (
        <Button
          type="button"
          onClick={actionHandler}
          className={cn('mt-4 h-11 bg-blue-600 text-white hover:bg-blue-700', compact && 'mt-3')}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
});

ErrorState.displayName = 'ErrorState';
