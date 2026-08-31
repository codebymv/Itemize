import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

export type LoadingStateKind = 'page' | 'section' | 'inline';

interface LoadingStateProps {
  kind?: LoadingStateKind;
  message?: string;
  className?: string;
}

const kindClasses: Record<LoadingStateKind, string> = {
  page: 'min-h-[50vh] flex-1',
  section: 'min-h-48 w-full',
  inline: 'min-h-20 w-full',
};

const spinnerSizes = {
  page: 'xl',
  section: 'lg',
  inline: 'sm',
} as const;

/**
 * Shared initial-load state. Background refreshes keep trustworthy content in
 * place and expose busy state on the refresh control instead of using this.
 */
export function LoadingState({
  kind = 'page',
  message = 'Loading',
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn('flex items-center justify-center', kindClasses[kind], className)}
      data-loading-state={kind}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
      aria-label={message}
    >
      <div className={cn('flex items-center', kind === 'inline' ? 'gap-2' : 'flex-col gap-4')}>
        <Spinner size={spinnerSizes[kind]} variant="brand" decorative />
        <span
          className={cn(
            'text-muted-foreground',
            kind === 'page' ? 'text-lg' : 'text-sm',
          )}
          style={{ fontFamily: '"Raleway", sans-serif' }}
          aria-hidden="true"
        >
          {message}
        </span>
      </div>
    </div>
  );
}
