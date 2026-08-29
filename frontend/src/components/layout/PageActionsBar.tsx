import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageActionsBarProps {
  children: ReactNode;
  label?: string;
  className?: string;
}

/**
 * Complex or additional desktop commands live here when they do not fit the
 * shell's named search/filter/secondary/primary grammar.
 */
export function PageActionsBar({
  children,
  label = 'Page actions',
  className,
}: PageActionsBarProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        'mb-4 hidden min-w-0 flex-wrap items-center justify-end gap-2 rounded-lg border bg-muted/10 p-3 md:flex [&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11 [&_[role=combobox]]:min-h-11',
        className,
      )}
    >
      {children}
    </section>
  );
}

export default PageActionsBar;
