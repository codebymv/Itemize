import React, { memo, type ReactNode } from 'react';
import { Card, CardContent, type CardSurface } from '@/components/ui/card';
import { ResponsiveNumberValue } from '@/components/ui/responsive-value';
import { Skeleton } from '@/components/ui/skeleton';
import { LucideIcon } from 'lucide-react';
import { useStatStyles, type StatTheme } from '@/hooks/useStatStyles';

interface StatCardProps {
  title: string;
  badgeText: string;
  value: ReactNode;
  icon: LucideIcon;
  description?: string;
  colorTheme?: StatTheme;
  isLoading?: boolean;
  surface?: CardSurface;
}

export const StatCard = memo(({
  title,
  badgeText,
  value,
  icon: Icon,
  description,
  colorTheme = 'gray',
  isLoading,
  surface = 'inset',
}: StatCardProps) => {
  const { iconBgClass, valueClass, iconClass } = useStatStyles(colorTheme);
  const renderedValue = typeof value === 'number'
    ? <ResponsiveNumberValue value={value} />
    : value;

  if (isLoading) {
    return (
      <Card surface={surface} role="group" aria-label={title} data-stat-card>
        <CardContent className="py-6">
          <div className="flex items-center gap-3" data-stat-card-row>
            <Skeleton className="w-10 h-10 rounded-full" data-stat-card-icon />
            <div className="min-w-0 flex-1" data-stat-card-content>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card surface={surface} role="group" aria-label={title} data-stat-card>
      <CardContent className="py-6">
        <div className="flex items-center gap-3" data-stat-card-row>
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBgClass}`}
            data-stat-card-icon
          >
            <Icon className={`h-5 w-5 ${iconClass}`} />
          </div>
          <div className="min-w-0 flex-1" data-stat-card-content>
            <p className="text-xs font-medium text-muted-foreground mb-1">{badgeText}</p>
            <p className={`min-w-0 text-2xl font-bold tabular-nums ${valueClass}`} data-stat-card-value>{renderedValue}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
