import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LucideIcon } from 'lucide-react';

type StatCardTheme = 'green' | 'orange' | 'blue' | 'red' | 'gray';

interface StatCardProps {
  title: string;
  badgeText: string;
  value: number | string;
  icon: LucideIcon;
  description?: string;
  colorTheme?: StatCardTheme;
  isLoading?: boolean;
}

const getStatBadgeClasses = (theme: StatCardTheme) => {
  switch (theme) {
    case 'green':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'orange':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    case 'blue':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300';
    case 'red':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'gray':
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

const getStatIconBgClasses = (theme: StatCardTheme) => {
  switch (theme) {
    case 'green':
      return 'bg-green-100 dark:bg-green-900';
    case 'orange':
      return 'bg-orange-100 dark:bg-orange-900';
    case 'blue':
      return 'bg-sky-100 dark:bg-sky-900';
    case 'red':
      return 'bg-red-100 dark:bg-red-900';
    case 'gray':
    default:
      return 'bg-gray-100 dark:bg-gray-800';
  }
};

const getStatValueColor = (theme: StatCardTheme) => {
  switch (theme) {
    case 'green':
      return 'text-green-600';
    case 'orange':
      return 'text-orange-600';
    case 'blue':
      return 'text-sky-600';
    case 'red':
      return 'text-red-600';
    case 'gray':
    default:
      return 'text-gray-600';
  }
};

const getStatIconColor = (theme: StatCardTheme) => {
  switch (theme) {
    case 'green':
      return 'text-green-600 dark:text-green-400';
    case 'orange':
      return 'text-orange-600 dark:text-orange-400';
    case 'blue':
      return 'text-sky-600 dark:text-sky-400';
    case 'red':
      return 'text-red-600 dark:text-red-400';
    case 'gray':
    default:
      return 'text-gray-400 dark:text-gray-500';
  }
};

export const StatCard = ({
  title,
  badgeText,
  value,
  icon: Icon,
  description,
  colorTheme = 'gray',
  isLoading
}: StatCardProps) => {
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
            <Badge className={`text-xs mb-2 ${getStatBadgeClasses(colorTheme)}`}>
              {badgeText}
            </Badge>
            <p className={`text-2xl font-bold ${getStatValueColor(colorTheme)}`}>
              {value}
            </p>
            <p className="text-xs text-muted-foreground">
              {description ?? title}
            </p>
          </div>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatIconBgClasses(colorTheme)}`}>
            <Icon className={`h-5 w-5 ${getStatIconColor(colorTheme)}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
