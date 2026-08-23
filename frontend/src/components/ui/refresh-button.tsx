import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface RefreshButtonProps extends Omit<ButtonProps, 'children'> {
  refreshing?: boolean;
  label?: string;
  collapseOnMobile?: boolean;
}

export const RefreshButton = React.forwardRef<HTMLButtonElement, RefreshButtonProps>(
  (
    {
      refreshing = false,
      label = 'Refresh',
      collapseOnMobile = true,
      className,
      disabled,
      variant = 'outline',
      size = 'sm',
      ...props
    },
    ref,
  ) => (
    <Button
      ref={ref}
      type="button"
      aria-label={label}
      title={collapseOnMobile ? label : undefined}
      variant={variant}
      size={size}
      disabled={disabled || refreshing}
      className={cn(
        collapseOnMobile && 'w-10 px-0 sm:w-auto sm:px-3',
        className,
      )}
      {...props}
    >
      <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
      <span className={cn(collapseOnMobile && 'hidden sm:inline')}>{label}</span>
    </Button>
  ),
);

RefreshButton.displayName = 'RefreshButton';
