import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface NavigationRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon: LucideIcon;
}

const NavigationRow = React.forwardRef<HTMLButtonElement, NavigationRowProps>(
  ({ active = false, className, icon: Icon, type = 'button', children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-active={active}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group/navigation-row inline-flex h-11 w-full items-center justify-start gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-muted-foreground outline-none ring-sidebar-ring transition-colors',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground',
        className,
      )}
      {...props}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'h-4 w-4 shrink-0 transition-colors',
          active
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-600 group-hover/navigation-row:text-blue-600 dark:text-gray-400 dark:group-hover/navigation-row:text-blue-400',
        )}
      />
      {children}
    </button>
  ),
);
NavigationRow.displayName = 'NavigationRow';

export { NavigationRow };
