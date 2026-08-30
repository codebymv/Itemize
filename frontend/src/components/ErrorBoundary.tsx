import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FatalErrorState } from '@/components/FatalErrorState';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onGoHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the
 * child component tree and displays a fallback UI instead of crashing.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Keep Sentry off the marketing critical path (dynamic import only on error).
    void import('@sentry/react').then((Sentry) => {
      Sentry.captureException(error, {
        captureContext: {
          extra: { componentStack: errorInfo.componentStack },
        },
      });
    }).catch(() => {});

    // Log the error to console (always, even in production)
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleGoHome = (): void => {
    if (this.props.onGoHome) {
      this.props.onGoHome();
    } else {
      window.location.href = '/';
    }
  };

  handleRetry = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const details = import.meta.env.DEV && this.state.error ? (
        <div className="max-h-48 overflow-auto rounded-lg bg-muted p-4 text-left">
          <p className="break-words font-mono text-sm text-destructive">{this.state.error.toString()}</p>
          {this.state.errorInfo ? (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
              {this.state.errorInfo.componentStack}
            </pre>
          ) : null}
        </div>
      ) : undefined;

      return <FatalErrorState details={details} onRetry={this.handleRetry} onGoHome={this.handleGoHome} />;
    }

    return this.props.children;
  }
}

const ErrorBoundaryWithNavigate = ({ children, fallback }: Props) => {
  const navigate = useNavigate();
  return (
    <ErrorBoundary onGoHome={() => navigate('/')} fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
};

export { ErrorBoundary };
export default ErrorBoundaryWithNavigate;
