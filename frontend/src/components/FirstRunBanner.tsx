import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const FIRST_RUN_DISMISSED_KEY = 'itemize_first_run_dismissed';

export interface FirstRunBannerProps {
  show: boolean;
  className?: string;
  onNavigate?: (path: string) => void;
}

export function FirstRunBanner({ show, className, onNavigate }: FirstRunBannerProps) {
  const [dismissed, setDismissed] = React.useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(FIRST_RUN_DISMISSED_KEY) === '1';
  });

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FIRST_RUN_DISMISSED_KEY, '1');
    }
  };

  const handleClick = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    }
  };

  if (!show || dismissed) return null;

  return (
    <Card className={cn('bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-100 dark:border-blue-900 mb-6', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-base">Get started with Itemize</CardTitle>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Add your first{' '}
          <button
            onClick={() => handleClick('/contacts')}
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            contact
          </button>
          {', '}
          create a{' '}
          <button
            onClick={() => handleClick('/canvas')}
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            list
          </button>
          {', or send an '}
          <button
            onClick={() => handleClick('/invoices/new')}
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            invoice
          </button>
          {' to get up and running.'}
        </p>
      </CardContent>
    </Card>
  );
}