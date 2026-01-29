import React from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

interface PageSurfaceProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn('w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6', className)}>
      {children}
    </div>
  );
}

export function PageSurface({ children, className, contentClassName }: PageSurfaceProps) {
  return (
    <div
      className={cn(
        'w-full rounded-none border-0 bg-transparent shadow-none sm:rounded-lg sm:border sm:bg-card sm:shadow-sm',
        className
      )}
    >
      <div className={cn('p-0 sm:p-6', contentClassName)}>{children}</div>
    </div>
  );
}
