import { Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  REVENUE_FLOW_SIZES,
  type RevenueFlowSize,
} from '@/hooks/useRevenueFlowPreferences';
import { cn } from '@/lib/utils';

const SIZE_LABELS: Record<RevenueFlowSize, string> = {
  compact: 'Compact',
  standard: 'Standard',
  expanded: 'Expanded',
};

export function RevenueFlowSizeControls({
  size,
  onSizeChange,
  className,
}: {
  size: RevenueFlowSize;
  onSizeChange: (size: RevenueFlowSize) => void;
  className?: string;
}) {
  const index = REVENUE_FLOW_SIZES.indexOf(size);
  const canDecrease = index > 0;
  const canIncrease = index < REVENUE_FLOW_SIZES.length - 1;

  return (
    <div
      role="toolbar"
      aria-label="Revenue flow size controls"
      className={cn('flex shrink-0 items-center gap-1', className)}
    >
      <Button
        type="button"
        variant="outline"
        size="iconCompact"
        className="h-10 w-10"
        aria-label="Zoom out revenue chart"
        title="Zoom out"
        disabled={!canDecrease}
        onClick={() => canDecrease && onSizeChange(REVENUE_FLOW_SIZES[index - 1])}
      >
        <Minus aria-hidden="true" />
      </Button>
      <output className="sr-only" aria-live="polite">
        {SIZE_LABELS[size]} revenue chart height
      </output>
      <Button
        type="button"
        variant="outline"
        size="iconCompact"
        className="h-10 w-10"
        aria-label="Zoom in revenue chart"
        title="Zoom in"
        disabled={!canIncrease}
        onClick={() => canIncrease && onSizeChange(REVENUE_FLOW_SIZES[index + 1])}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}
