import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, UserPlus, List, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const FIRST_RUN_DISMISSED_KEY = 'itemize_first_run_dismissed';

export interface FirstRunBannerProps {
  /** Show when user has zero content (e.g. 0 contacts, 0 invoices) */
  show: boolean;
  /** Optional class name for the container */
  className?: string;
}

const quickStarts = [
  {
    title: 'Add your first contact',
    description: 'Start building your CRM',
    icon: UserPlus,
    path: '/contacts',
    cta: 'Add contact',
  },
  {
    title: 'Create a list',
    description: 'Organize tasks or ideas on the canvas',
    icon: List,
    path: '/canvas',
    cta: 'Go to Canvas',
  },
  {
    title: 'Send an invoice',
    description: 'Get paid faster',
    icon: FileText,
    path: '/invoices/new',
    cta: 'Create invoice',
  },
];

export function FirstRunBanner({ show, className }: FirstRunBannerProps) {
  const navigate = useNavigate();
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

  if (!show || dismissed) return null;

  return (
    <div className={cn('mb-8', className)}>
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-foreground mb-1">Get started with Itemize</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Choose an action below to create your first piece of content.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {quickStarts.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Card
                      key={item.path}
                      className="cursor-pointer transition-colors hover:bg-muted/50 border-border"
                      onClick={() => navigate(item.path)}
                    >
                      <CardContent className="p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span className="font-medium text-sm">{item.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                        <Button size="sm" variant="secondary" className="w-fit mt-1">
                          {item.cta}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
              aria-label="Dismiss get started banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
