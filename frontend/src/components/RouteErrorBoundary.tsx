import React from 'react';
import { FatalErrorState } from '@/components/FatalErrorState';

interface RouteErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export function RouteErrorBoundary({
  children,
  fallback,
  onError
}: RouteErrorBoundaryProps) {
  return (
    <ErrorBoundaryComponent
      fallback={fallback}
      onError={onError}
    >
      {children}
    </ErrorBoundaryComponent>
  );
}

class ErrorBoundaryComponent extends React.Component<
  RouteErrorBoundaryProps,
  { hasError: boolean; error: Error | null }
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<{ hasError: boolean; error: Error | null }> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[RouteErrorBoundary] Error caught:', error, errorInfo);
    
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Report error to tracking service (if configured)
    const sentryWindow = window as Window & {
      Sentry?: { captureException: (error: Error) => void };
    };

    if (typeof window !== 'undefined' && sentryWindow.Sentry) {
      sentryWindow.Sentry.captureException(error);
    }
  }

  handleRetry = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const details = import.meta.env.DEV && this.state.error ? (
        <div className="max-h-48 overflow-auto rounded-lg bg-muted p-4 text-left">
          <p className="break-words font-mono text-sm text-destructive">{this.state.error.toString()}</p>
        </div>
      ) : undefined;

      return <FatalErrorState details={details} onRetry={this.handleRetry} onGoHome={this.handleGoHome} />;
    }

    return this.props.children;
  }
}
