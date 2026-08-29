import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Breakpoint at which the shell command lane takes over showing entity status.
 * Pages whose lane stays crowded until a wider viewport hand off later.
 */
export type EntityStatusHandoff = 'md' | 'xl';

const STATUS_HANDOFF_CLASSES: Record<EntityStatusHandoff, string> = {
  md: 'md:hidden',
  xl: 'xl:hidden',
};

interface EntityDetailHeaderProps {
  icon: ReactNode;
  iconClassName?: string;
  title: ReactNode;
  mobileStatus?: ReactNode;
  /** Where `mobileStatus` yields to `PageLayout`'s `desktopTools.status`. Defaults to `md`. */
  statusHandoff?: EntityStatusHandoff;
  descriptor?: ReactNode;
  metadata?: ReactNode;
  className?: string;
}

/** Shared identity block for routed entity detail and editor pages. */
export function EntityDetailHeader({
  icon,
  iconClassName,
  title,
  mobileStatus,
  statusHandoff = 'md',
  descriptor,
  metadata,
  className,
}: EntityDetailHeaderProps) {
  return (
    <header className={cn('mb-6 flex items-start gap-4', className)}>
      <div
        aria-hidden="true"
        className={cn(
          'flex h-14 w-14 shrink-0 items-center justify-center rounded-full',
          iconClassName,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 text-xl font-medium">{title}</h2>
            {mobileStatus ? (
              <div className={cn('shrink-0', STATUS_HANDOFF_CLASSES[statusHandoff])}>{mobileStatus}</div>
            ) : null}
          </div>
          {descriptor ? (
            <div className="min-w-0 text-sm text-muted-foreground sm:ml-auto sm:text-right">
              {descriptor}
            </div>
          ) : null}
        </div>
        {metadata ? (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {metadata}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export default EntityDetailHeader;
