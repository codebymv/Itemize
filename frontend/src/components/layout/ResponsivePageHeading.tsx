import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PAGE_TITLE_CLASS } from './pageHeaderLayout';

interface ResponsivePageHeadingProps {
  title?: string;
  icon?: ReactNode;
  leading?: ReactNode;
}

export function ResponsivePageHeading({
  title,
  icon,
  leading,
}: ResponsivePageHeadingProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 md:ml-2">
      {leading ? (
        <span
          className="inline-flex h-11 w-11 shrink-0 [&>*]:h-full [&>*]:w-full"
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
    </div>
  );
}
