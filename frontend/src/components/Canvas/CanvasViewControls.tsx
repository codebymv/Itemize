import type { CSSProperties } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CanvasViewControlsProps {
  zoom: number;
  onZoomOut: () => void;
  onResetView: () => void;
  onZoomIn: () => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export function CanvasViewControls({
  zoom,
  onZoomOut,
  onResetView,
  onZoomIn,
  ariaLabel = 'Canvas view controls',
  className,
  style,
}: CanvasViewControlsProps) {
  return (
    <div
      aria-label={ariaLabel}
      data-canvas-controls
      role="toolbar"
      style={style}
      className={cn(
        'flex select-none items-center gap-2 rounded-xl border bg-background p-3 text-foreground shadow-lg',
        className,
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={onZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus className="h-[18px] w-[18px]" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={onResetView}
        aria-label="Reset canvas view"
        title="Reset view"
      >
        <RotateCcw className="h-[18px] w-[18px]" />
      </Button>
      <output
        aria-label={`Canvas zoom ${Math.round(zoom * 100)} percent`}
        aria-live="polite"
        className="min-w-[3.75rem] px-1 text-center font-mono text-sm font-medium tabular-nums text-muted-foreground"
      >
        {Math.round(zoom * 100)}%
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={onZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus className="h-[18px] w-[18px]" />
      </Button>
    </div>
  );
}
