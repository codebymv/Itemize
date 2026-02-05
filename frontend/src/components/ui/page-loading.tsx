import { Spinner } from './Spinner';
import { cn } from '@/lib/utils';

interface PageLoadingProps {
  message?: string;
  className?: string;
}

/**
 * Standardized full-page loading component.
 * Use for route transitions, initial data loads, and protected route checks.
 */
export function PageLoading({ message, className }: PageLoadingProps) {
  return (
    <div className={cn('flex-1 flex items-center justify-center min-h-[50vh]', className)}>
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" variant="brand" />
        {message && (
          <span 
            className="text-lg text-muted-foreground"
            style={{ fontFamily: '"Raleway", sans-serif' }}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

export default PageLoading;
