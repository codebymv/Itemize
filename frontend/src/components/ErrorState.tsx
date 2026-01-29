import React, { memo } from 'react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const ErrorState = memo(({
  title = 'Something went wrong',
  description = 'Please try again in a moment.',
  icon: Icon = AlertTriangle,
  actionLabel = 'Retry',
  onAction,
  className,
}: ErrorStateProps) => {
  return (
    <div className={cn('text-center py-12', className)}>
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4">{description}</p>
      {onAction ? (
        <Button onClick={onAction} className="bg-blue-600 hover:bg-blue-700 text-white">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
});
