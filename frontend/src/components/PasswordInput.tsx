import React, { useState } from 'react';
import { Eye, EyeOff, LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PasswordInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  icon?: LucideIcon;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  autoComplete?: string;
}

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder = '••••••••',
  className,
  icon: Icon,
  required = false,
  minLength,
  disabled = false,
  autoComplete = 'current-password',
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
      )}
      <Input
        id={id}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        disabled={disabled}
        autoComplete={autoComplete}
        className={cn(
          Icon && 'pl-10',
          'pr-10',
          className
        )}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 focus:outline-none"
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {showPassword ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
