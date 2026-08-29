import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function ExpandedRowActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'expanded-row-actions mb-6 flex flex-wrap items-center justify-center border-b pb-4',
        className,
      )}
      {...props}
    />
  );
}

interface ExpandedRowActionLabelProps {
  full: ReactNode;
  compact?: ReactNode;
}

export function ExpandedRowActionLabel({
  full,
  compact = full,
}: ExpandedRowActionLabelProps) {
  return (
    <>
      <span aria-hidden="true" className="expanded-row-action-label--full">
        {full}
      </span>
      <span aria-hidden="true" className="expanded-row-action-label--compact">
        {compact}
      </span>
      <span className="sr-only">{full}</span>
    </>
  );
}
