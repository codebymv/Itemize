import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AppHeaderIconButtonProps = Omit<ButtonProps, 'size' | 'variant'>;

/**
 * Canonical app-chrome icon action. Header controls share one 44px hit area,
 * ghost/accent hover treatment, focus ring, and icon geometry.
 */
export const AppHeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  AppHeaderIconButtonProps
>(({ className, ...props }, ref) => (
  <Button
    ref={ref}
    variant="ghost"
    size="icon"
    className={cn('h-11 w-11 shrink-0', className)}
    {...props}
  />
));

AppHeaderIconButton.displayName = 'AppHeaderIconButton';

