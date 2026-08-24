import { Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SuggestionActionsProps {
  suggestion?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onAccept: () => void;
  onDismiss: () => void;
  onRegenerate: () => void;
  className?: string;
}

export function SuggestionActions({
  suggestion,
  isLoading = false,
  error,
  onAccept,
  onDismiss,
  onRegenerate,
  className,
}: SuggestionActionsProps) {
  if (!suggestion && !isLoading && !error) return null;

  return (
    <section
      aria-label="AI suggestion"
      className={cn(
        'rounded-md border border-border bg-card/95 p-2 shadow-sm backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2 text-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <p className="text-muted-foreground" role="status">Thinking…</p>
          ) : error ? (
            <p className="text-destructive" role="alert">{error}</p>
          ) : (
            <p className="line-clamp-2 text-foreground" aria-live="polite">{suggestion}</p>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5">
        {suggestion && !isLoading && !error && (
          <>
            <span className="mr-auto hidden text-xs text-muted-foreground md:inline">
              Tab or → to accept
            </span>
            <Button
              type="button"
              size="sm"
              className="h-8 px-2.5"
              onClick={onAccept}
              aria-label={`Accept suggestion: ${suggestion}`}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2.5"
              onClick={onRegenerate}
              aria-label="Generate another suggestion"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Another</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={onDismiss}
              aria-label="Dismiss suggestion"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </>
        )}

        {(isLoading || error) && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2.5"
              onClick={onRegenerate}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} aria-hidden="true" />
              Retry
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={onDismiss}
              aria-label="Dismiss AI suggestion message"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
