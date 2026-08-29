import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function SectionCardTitle({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <CardTitle className={cn('flex items-center gap-2 text-base', className)}>
      <Icon className="icon-accent h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </CardTitle>
  );
}
