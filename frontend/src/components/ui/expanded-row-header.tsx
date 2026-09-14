import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ExpandedRowHeaderProps {
  /** Status disc or checkbox at the row's leading edge. */
  leading?: ReactNode;
  /** The record's identity. Wraps; never truncates. */
  title: ReactNode;
  /** Persisted status badge. Sits in the command lane when the row is wide enough, otherwise leads the meta row. */
  status?: ReactNode;
  /** Right-aligned figure (amount, count). Sits in the command lane when the row is wide enough, otherwise leads the footer row. */
  value?: ReactNode;
  /** Compact inline form of `value` for narrow rows; defaults to `value`. */
  valueInline?: ReactNode;
  /** Chevron, overflow menu, and any other always-visible controls. */
  trailing?: ReactNode;
  /** Secondary facts (contact, due date, links). */
  meta?: ReactNode;
  /** Tertiary facts (age, balance). */
  footer?: ReactNode;
  className?: string;
  titleClassName?: string;
}

/**
 * The shared anatomy of an expandable list row: identity on the left, a
 * command lane on the right, then meta and footer rows. Status and value
 * hand off from the lane to the meta/footer rows on the row's own width
 * (`expanded-row-header` container in index.css), so every list collapses
 * at the same content width whatever the sidebar is doing.
 */
export function ExpandedRowHeader({
  leading,
  title,
  status,
  value,
  valueInline = value,
  trailing,
  meta,
  footer,
  className,
  titleClassName,
}: ExpandedRowHeaderProps) {
  const hasMeta = Boolean(meta) || Boolean(status);
  const hasFooter = Boolean(footer) || Boolean(valueInline);
  return (
    <div className={cn('expanded-row-header', className)} data-expanded-row-header>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {leading}
          <p className={cn('min-w-0 flex-1 text-sm font-medium @[40rem]:text-base', titleClassName)}>{title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status ? (
            <div className="expanded-row-header__status-lane" data-expanded-row-status-lane>
              {status}
            </div>
          ) : null}
          {value ? (
            <div
              className="expanded-row-header__value-lane flex-col items-end text-right"
              data-expanded-row-value-lane
            >
              {value}
            </div>
          ) : null}
          {trailing}
        </div>
      </div>
      {hasMeta ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-6">
          {status ? (
            <span className="expanded-row-header__status-inline" data-expanded-row-status-inline>
              {status}
            </span>
          ) : null}
          {meta}
        </div>
      ) : null}
      {hasFooter ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-6 text-xs text-muted-foreground">
          {valueInline ? (
            <span
              className="expanded-row-header__value-inline font-semibold text-foreground"
              data-expanded-row-value-inline
            >
              {valueInline}
            </span>
          ) : null}
          {footer}
        </div>
      ) : null}
    </div>
  );
}
