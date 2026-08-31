import type { ReactNode } from 'react';
import { Home, RefreshCw } from 'lucide-react';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/button';

interface FatalErrorStateProps {
  details?: ReactNode;
  onRetry: () => void;
  onGoHome: () => void;
}

export function FatalErrorState({ details, onRetry, onGoHome }: FatalErrorStateProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <ErrorState
          kind="page"
          title="Something went wrong"
          description="This view stopped responding. Refresh it or return to the dashboard."
          action={(
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button type="button" onClick={onRetry} className="h-11 gap-2 bg-blue-600 text-white interaction-button--primary">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Refresh page
              </Button>
              <Button type="button" onClick={onGoHome} variant="outline" className="h-11 gap-2">
                <Home className="h-4 w-4" aria-hidden="true" />
                Dashboard
              </Button>
            </div>
          )}
        />
        {details}
      </div>
    </main>
  );
}
