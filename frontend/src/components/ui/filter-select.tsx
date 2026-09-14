import * as React from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface FilterSelectOption<T extends string = string> {
  value: T;
  /** What the menu shows. */
  label: React.ReactNode;
  /** What the closed trigger shows when this option is selected; defaults to `label`. */
  triggerLabel?: React.ReactNode;
  /** Plain-text form of the trigger label, used to size the trigger. Required when `triggerLabel` is not a string. */
  sizingText?: string;
}

interface FilterSelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<FilterSelectOption<T>>;
  placeholder?: string;
  'aria-label'?: string;
  /** Optional leading icon inside the trigger. */
  icon?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
}

const sizingTextOf = (option: FilterSelectOption): string => {
  if (option.sizingText) return option.sizingText;
  const source = option.triggerLabel ?? option.label;
  return typeof source === 'string' || typeof source === 'number' ? String(source) : '';
};

/**
 * A filter/sort select whose trigger is exactly as wide as its widest option.
 * Every option label is rendered invisibly in the same grid cell as the live
 * value, so the trigger never clips an authored label and never jumps when the
 * selection changes. Replaces the hand-tuned `w-[6.5rem]`-style widths that
 * were sized to one option and truncated the others.
 */
export function FilterSelect<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  'aria-label': ariaLabel,
  icon,
  className,
  triggerClassName,
}: FilterSelectProps<T>) {
  const current = options.find((option) => option.value === value);
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as T)}>
      <SelectTrigger
        aria-label={ariaLabel}
        data-filter-select
        className={cn('h-11 w-auto shrink-0 bg-muted/20', triggerClassName, className)}
      >
        {icon}
        {/* !grid: SelectTrigger applies line-clamp-1 (display:-webkit-box) to direct span children. */}
        <span className="!grid min-w-0 text-left">
          <span className="col-start-1 row-start-1 truncate">
            <SelectValue placeholder={placeholder}>
              {current ? current.triggerLabel ?? current.label : undefined}
            </SelectValue>
          </span>
          {options.map((option) => {
            const text = sizingTextOf(option);
            return text ? (
              <span
                key={option.value}
                aria-hidden="true"
                className="invisible col-start-1 row-start-1 whitespace-nowrap"
                data-filter-select-sizer
              >
                {text}
              </span>
            ) : null;
          })}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
