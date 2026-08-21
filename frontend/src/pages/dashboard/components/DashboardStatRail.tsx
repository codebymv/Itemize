import React from 'react';
import { cn } from '@/lib/utils';

interface DashboardStatRailProps {
  label: string;
  isMobile: boolean;
  desktopColumns: string;
  children: React.ReactNode;
}

export function DashboardStatRail({
  label,
  isMobile,
  desktopColumns,
  children,
}: DashboardStatRailProps) {
  return (
    <div
      aria-label={label}
      className={cn(
        'dashboard-stat-rail -mx-3 mb-8 flex snap-x snap-mandatory scroll-px-3 gap-4 overflow-x-auto overscroll-x-contain px-3 pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0 md:snap-none',
        desktopColumns,
      )}
      role="region"
      tabIndex={isMobile ? 0 : undefined}
    >
      {React.Children.map(children, (child) => (
        <div className="min-w-0 flex-[0_0_82%] snap-start md:flex-auto [&>*]:h-full">
          {child}
        </div>
      ))}
    </div>
  );
}
