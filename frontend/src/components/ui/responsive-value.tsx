import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  formatCompactMoney,
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatTightMoney,
  formatTightNumber,
  type MoneyFormatOptions,
  type NumericFormatOptions,
  type NumericInput,
} from '@/lib/numberFormat';
import { cn } from '@/lib/utils';
import { pickFittingValue } from '@/lib/responsiveValue';

interface ResponsiveValueProps {
  values: readonly string[];
  accessibleValue?: string;
  className?: string;
}

export function ResponsiveValue({ values, accessibleValue, className }: ResponsiveValueProps) {
  const candidates = useMemo(() => Array.from(new Set(values.filter(Boolean))), [values]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const measureRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const exactValue = accessibleValue ?? candidates[0] ?? '';

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || candidates.length < 2) {
      setSelectedIndex(0);
      return;
    }

    const measure = () => {
      const availableWidth = root.getBoundingClientRect().width;
      const candidateWidths = candidates.map((_, index) => (
        measureRefs.current[index]?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY
      ));
      setSelectedIndex(pickFittingValue(availableWidth, candidateWidths));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (root.parentElement) observer.observe(root.parentElement);
    return () => observer.disconnect();
  }, [candidates]);

  return (
    <span
      ref={rootRef}
      className={cn('relative block min-w-0 max-w-full overflow-hidden whitespace-nowrap tabular-nums', className)}
      aria-label={exactValue}
      title={exactValue}
      data-responsive-value
      data-responsive-value-mode={selectedIndex === 0 ? 'full' : selectedIndex === 1 ? 'compact' : 'tight'}
    >
      <span aria-hidden="true">{candidates[selectedIndex] ?? exactValue}</span>
      <span className="sr-only">{exactValue}</span>
      <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 invisible flex w-max">
        {candidates.map((candidate, index) => (
          <span
            key={`${candidate}-${index}`}
            ref={(node) => { measureRefs.current[index] = node; }}
            data-responsive-value-measure={index}
          >
            {candidate}
          </span>
        ))}
      </span>
    </span>
  );
}

interface ResponsiveNumberValueProps extends NumericFormatOptions {
  value: NumericInput;
  className?: string;
}

export function ResponsiveNumberValue({ value, className, ...options }: ResponsiveNumberValueProps) {
  const full = formatNumber(value, options);
  return (
    <ResponsiveValue
      values={[full, formatCompactNumber(value, options), formatTightNumber(value, options)]}
      accessibleValue={full}
      className={className}
    />
  );
}

interface ResponsiveMoneyValueProps extends MoneyFormatOptions {
  amount: NumericInput;
  className?: string;
}

export function ResponsiveMoneyValue({ amount, className, ...options }: ResponsiveMoneyValueProps) {
  const full = formatMoney(amount, options);
  return (
    <ResponsiveValue
      values={[full, formatCompactMoney(amount, options), formatTightMoney(amount, options)]}
      accessibleValue={full}
      className={className}
    />
  );
}
