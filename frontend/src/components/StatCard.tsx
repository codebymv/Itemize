import React, { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStatStyles, type StatTheme } from '@/hooks/useStatStyles';

interface StatCardProps {
  title: string;
  badgeText: string;
  value: number | string;
  icon: LucideIcon;
  description?: string;
  colorTheme?: StatTheme;
  isLoading?: boolean;
}

export const StatCard = memo(({
  title,
  badgeText,
  value,
  icon: Icon,
  description,
  colorTheme = 'gray',
  isLoading,
}: StatCardProps) => {
  const { badgeClass, iconBgClass, valueClass, iconClass } = useStatStyles(colorTheme);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBgClass}`}>
            <Icon className={`h-5 w-5 ${iconClass}`} />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">{badgeText}</p>
            <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});