import React, { memo } from 'react';
import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  action?: React.ReactNode;
  className?: string;
  size?: 'default' | 'compact';
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
}: EmptyStateProps) => {
  const compact = size === 'compact';

  return (
    <div className={cn(compact ? 'text-center py-6' : 'text-center py-12', className)}>
      {Icon ? (
        <div className={cn(
          'mx-auto mb-4 flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40',
          compact ? 'h-8 w-8 mb-2' : 'h-12 w-12',
        )}>
          <Icon className={cn('text-blue-600 dark:text-blue-400', compact ? 'h-4 w-4' : 'h-6 w-6')} />
        </div>
      ) : null}
      <h3 className={cn('font-medium mb-2', compact ? 'text-sm' : 'text-lg')}>{title}</h3>
      {description ? <p className={cn('text-muted-foreground mb-4', compact && 'text-sm mb-2')}>{description}</p> : null}
      {action ?? (onAction && actionLabel ? (
        <Button onClick={onAction} className="bg-blue-600 hover:bg-blue-700 text-white">
          {actionLabel}
        </Button>
      ) : null)}
    </div>
  );
});

EmptyState.displayName = 'EmptyState';
