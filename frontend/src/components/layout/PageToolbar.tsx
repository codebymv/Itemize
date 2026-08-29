import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageToolbarProps {
  label: string;
  search?: ReactNode;
  filters?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  singleLine?: boolean;
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
  singleLine = false,
}: PageToolbarProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border bg-muted/10 p-3',
        singleLine && 'flex-nowrap',
        className,
      )}
    >
      {search ? <div className={cn('flex-1', singleLine ? 'min-w-0' : 'min-w-[14rem]')}>{search}</div> : null}
      {filters ? <div className={cn('flex items-center gap-2', singleLine ? 'shrink-0 flex-nowrap' : 'flex-wrap')}>{filters}</div> : null}
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
