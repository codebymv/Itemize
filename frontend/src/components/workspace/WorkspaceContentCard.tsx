import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type WorkspaceContentCardProps = React.ComponentProps<typeof Card>;

export function WorkspaceContentCard({ className, ...props }: WorkspaceContentCardProps) {
  return (
    <Card
      className={cn('w-full border shadow-sm', className)}
      {...props}
    />
  );
}
