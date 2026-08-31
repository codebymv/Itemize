import { LoadingState } from '@/components/LoadingState';

interface PageLoadingProps {
  message?: string;
  className?: string;
}

/**
 * Standardized full-page loading component.
 * Use for route transitions, initial data loads, and protected route checks.
 */
export function PageLoading({ message, className }: PageLoadingProps) {
  return <LoadingState kind="page" message={message} className={className} />;
}

export default PageLoading;
