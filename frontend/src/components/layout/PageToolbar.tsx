import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageToolbarProps {
  label: string;
  search?: ReactNode;
  filters?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Query and result controls that belong to a page surface instead of its
 * identity header. The regions wrap independently as the content column
 * narrows, including when the application sidebar is open.
 */
export function PageToolbar({
  label,
  search,
  filters,
  meta,
  actions,
  className,
}: PageToolbarProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border bg-muted/10 p-3',
        className,
      )}
    >
      {search ? <div className="min-w-[14rem] flex-1">{search}</div> : null}
      {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
      {meta || actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {meta}
          {actions}
        </div>
      ) : null}
    </section>
  );
}

export default PageToolbar;
