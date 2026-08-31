import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SectionCardTitle({
  icon: Icon,
  children,
  className,
  as: Heading = 'h3',
  ...props
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  as?: 'h2' | 'h3' | 'h4';
} & Omit<HTMLAttributes<HTMLHeadingElement>, 'children'>) {
  return (
    <Heading
      className={cn('flex items-center gap-2 text-base font-semibold leading-none tracking-tight', className)}
      {...props}
    >
      <Icon className="icon-accent h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </Heading>
  );
}
