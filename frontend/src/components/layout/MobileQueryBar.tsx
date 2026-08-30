import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MobileQueryBarProps {
  search: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * A single-line mobile command lane for list pages. Search owns the flexible
 * space while filters and primary actions remain reachable at touch size.
 */
export function MobileQueryBar({
  search,
  filters,
  actions,
  className,
}: MobileQueryBarProps) {
  return (
    <div
      data-mobile-query-bar
      className={cn(
        'flex w-full min-w-0 flex-nowrap items-center gap-2 [&_button]:min-h-11 [&_input]:min-h-11',
        className,
      )}
    >
      <div className="min-w-0 flex-1">{search}</div>
      {filters ? <div className="flex shrink-0 items-center gap-2">{filters}</div> : null}
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export default MobileQueryBar;
