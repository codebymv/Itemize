import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FailureNoticeProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function FailureNotice({
  title,
  description,
  icon: Icon = AlertTriangle,
  onRetry,
  retryLabel = 'Try again',
  className,
}: FailureNoticeProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
      data-failure-notice
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="flex min-w-0 gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" className="h-11 shrink-0" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
