import React from 'react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'brand' | 'muted' | 'current';
  className?: string;
  /** Accessible label when the spinner is the state announcement. */
  label?: string;
  /** Hides the spinner when an enclosing control already owns the state. */
  decorative?: boolean;
}

const sizeMap = {
  xs: 'h-3 w-3 border',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-2',
  xl: 'h-12 w-12 border-2',
};

const variantMap = {
  primary: 'border-primary border-t-transparent',
  brand: 'border-blue-600 border-t-transparent',
  muted: 'border-muted-foreground border-t-transparent',
  current: 'border-current border-t-transparent',
};

export const Spinner: React.FC<SpinnerProps> = ({ 
  size = 'md',
  variant = 'primary',
  className = '',
  label = 'Loading',
  decorative = false,
}) => {
  return (
    <div
      className={cn(
        'animate-spin rounded-full',
        sizeMap[size],
        variantMap[variant],
        className
      )}
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    />
  );
};

export default Spinner;
