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
}

export const EmptyState = memo(({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  action,
  className,
}: EmptyStateProps) => {
  return (
    <div className={cn('text-center py-12', className)}>
      {Icon ? (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40">
          <Icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
      ) : null}
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      {description ? <p className="text-muted-foreground mb-4">{description}</p> : null}
      {action ?? (onAction && actionLabel ? (
        <Button onClick={onAction} className="bg-blue-600 hover:bg-blue-700 text-white">
          {actionLabel}
        </Button>
      ) : null)}
    </div>
  );
});

EmptyState.displayName = 'EmptyState';
