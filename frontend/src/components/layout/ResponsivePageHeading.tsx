import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PAGE_TITLE_CLASS } from './pageHeaderLayout';

interface ResponsivePageHeadingProps {
  title?: string;
  icon?: ReactNode;
  leading?: ReactNode;
  compactNavigation?: ReactNode;
  compactNavigationBreakpoint?: 'md' | 'wide';
  className?: string;
}

export function ResponsivePageHeading({
  title,
  icon,
  leading,
  compactNavigation,
  compactNavigationBreakpoint = 'md',
  className,
}: ResponsivePageHeadingProps) {
  const identity = (
    <>
      {leading ? (
        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center"
          data-page-header-leading
        >
          {leading}
        </span>
      ) : null}
      {icon ? (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0"
          data-page-header-icon
        >
          {icon}
        </span>
      ) : null}
      {title ? (
        <h1 className={cn(PAGE_TITLE_CLASS, 'min-w-0')}>
          {title}
        </h1>
      ) : null}
    </>
  );

  if (compactNavigation) {
    const compactClassName = compactNavigationBreakpoint === 'wide' ? 'lg:hidden' : 'md:hidden';
    const identityClassName = compactNavigationBreakpoint === 'wide' ? 'hidden lg:flex' : 'hidden md:flex';

    return (
      <div className={cn('flex w-full min-w-0 items-center md:ml-2 md:w-auto', className)}>
        <div className={cn('min-w-0', compactClassName)} data-page-header-compact-navigation>
          {compactNavigation}
        </div>
        <div className={cn('min-w-0 items-center gap-2', identityClassName)}>
          {identity}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex w-full min-w-0 items-center gap-2 md:ml-2 md:w-auto', className)}>
      {identity}
    </div>
  );
}
