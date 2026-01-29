import React, { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LucideIcon } from 'lucide-react';
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
  isLoading
}: StatCardProps) => {
  const { badgeClass, iconBgClass, valueClass, iconClass } = useStatStyles(colorTheme);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <Badge className={`text-xs mb-2 ${badgeClass}`}>
              {badgeText}
            </Badge>
            <p className={`text-2xl font-bold ${valueClass}`}>
              {value}
            </p>
            <p className="text-xs text-muted-foreground">
              {description ?? title}
            </p>
          </div>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBgClass}`}>
            <Icon className={`h-5 w-5 ${iconClass}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
