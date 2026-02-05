import { Skeleton } from './skeleton';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  count?: number;
  className?: string;
}

interface ListRowSkeletonProps extends SkeletonProps {
  height?: string;
}

interface CardGridSkeletonProps extends SkeletonProps {
  columns?: 1 | 2 | 3 | 4;
  height?: string;
}

/**
 * Skeleton for list/table rows (invoices, contacts, automations, etc.)
 * Default: 5 rows at h-20
 */
export function ListRowSkeleton({ 
  count = 5, 
  height = 'h-20',
  className 
}: ListRowSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn('w-full', height)} />
      ))}
    </div>
  );
}

/**
 * Skeleton for card grids (widgets, pages, workspace items)
 * Default: 6 cards at h-40 in responsive grid
 */
export function CardGridSkeleton({ 
  count = 6, 
  columns = 3,
  height = 'h-40',
  className 
}: CardGridSkeletonProps) {
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={cn('grid gap-4', gridClasses[columns], className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn('w-full rounded-lg', height)} />
      ))}
    </div>
  );
}

/**
 * Skeleton for dashboard stat cards
 * Default: 5 cards at h-24
 */
export function StatCardSkeleton({ 
  count = 5,
  className 
}: SkeletonProps) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-5', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Skeleton for data tables with configurable columns
 * Default: 5 rows with header
 */
export function TableSkeleton({ 
  count = 5,
  className 
}: SkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Header row */}
      <Skeleton className="h-10 w-full" />
      {/* Data rows */}
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

/**
 * Skeleton for detail/profile cards with avatar
 */
export function DetailCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
