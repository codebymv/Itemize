import React from 'react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'brand' | 'muted' | 'current';
  className?: string;
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
  className = ''
}) => {
  return (
    <div
      className={cn(
        'animate-spin rounded-full',
        sizeMap[size],
        variantMap[variant],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
};

export default Spinner;
