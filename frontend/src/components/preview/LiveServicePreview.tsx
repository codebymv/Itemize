import type { ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionCardTitle } from '@/components/ui/section-card-title';
import { cn } from '@/lib/utils';

export function LiveServicePreview({
  controls,
  children,
  className,
  contentClassName,
  title = 'Live Preview',
}: {
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  title?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <SectionCardTitle icon={Eye}>{title}</SectionCardTitle>
        {controls ? <div className="min-w-0 shrink-0">{controls}</div> : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

export function ServicePreviewBrowser({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn('flex h-[34rem] flex-col overflow-hidden rounded-xl border bg-slate-50 dark:bg-slate-950/35', className)}>
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b bg-white px-3 dark:bg-slate-900">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span className="h-2 w-2 rounded-full bg-green-400" />
        <span className="ml-3 h-4 flex-1 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className={cn('relative min-h-0 flex-1 overflow-hidden', contentClassName)}>{children}</div>
    </div>
  );
}
