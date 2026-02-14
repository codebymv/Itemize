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
  className?: string;
}

export const EmptyState = memo(({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) => {
  return (
    <div className={cn('text-center py-12', className)}>
      {Icon ? (
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : null}
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      {description ? <p className="text-muted-foreground mb-4">{description}</p> : null}
      {onAction && actionLabel ? (
        <Button onClick={onAction} className="bg-blue-600 hover:bg-blue-700 text-white">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
});
