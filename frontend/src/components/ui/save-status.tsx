import { AlertCircle, Check, Clock3, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface SaveStatusProps {
  state: SaveState;
  onRetry?: () => void;
  className?: string;
}

export function SaveStatus({ state, onRetry, className }: SaveStatusProps) {
  if (state === 'idle') return null;

  const content = {
    dirty: {
      icon: <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />,
      label: 'Unsaved changes',
      className: 'text-amber-700 dark:text-amber-300',
    },
    saving: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />,
      label: 'Saving…',
      className: 'text-muted-foreground',
    },
    saved: {
      icon: <Check className="h-3.5 w-3.5" aria-hidden="true" />,
      label: 'Saved',
      className: 'text-emerald-700 dark:text-emerald-300',
    },
    error: {
      icon: <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />,
      label: 'Save failed',
      className: 'text-destructive',
    },
  }[state];

  return (
    <div
      className={cn('flex min-w-0 items-center gap-1.5 text-xs', content.className, className)}
      data-save-state={state}
      role={state === 'error' ? 'alert' : 'status'}
      aria-live={state === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      aria-busy={state === 'saving' ? 'true' : undefined}
    >
      {content.icon}
      <span className="truncate">{content.label}</span>
      {state === 'error' && onRetry && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-1 py-0 text-xs text-destructive underline-offset-2"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
