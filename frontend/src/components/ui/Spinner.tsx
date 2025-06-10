import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ 
  size = 'md',
  className = ''
}) => {
  // Calculate size based on prop
  const sizeMap = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };
  
  const sizeClass = sizeMap[size];
  
  return (
    <div className={`${className}`}>
      <div className={`${sizeClass} animate-spin rounded-full border-2 border-t-transparent border-primary`}></div>
    </div>
  );
};

export default Spinner;
