import type { CSSProperties, HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

interface EditorSplitProps extends HTMLAttributes<HTMLDivElement> {
  /** Minimum preview column width in rem once the split is two columns. */
  previewMinRem?: number;
  /** Preview column share of the remaining width, e.g. `0.8fr` or `1fr`. */
  previewShare?: string;
}

/**
 * The two-column editor frame: a form column and a preview column that split
 * only when the editor itself is at least 52rem wide. A 644px editor beside
 * an open sidebar stacks; an 851px editor beside a collapsed one splits.
 * Children keep their own markup; a preview that should stay in view uses
 * `EDITOR_SPLIT_STICKY` and the first/second order helpers below.
 */
export function EditorSplit({
  previewMinRem = 22,
  previewShare = '0.8fr',
  className,
  style,
  children,
  ...props
}: EditorSplitProps) {
  const vars = {
    '--editor-preview-min': `${previewMinRem}rem`,
    '--editor-preview-share': previewShare,
    ...style,
  } as CSSProperties;
  return (
    <div className="@container" data-editor-split>
      <div
        className={cn(
          'grid items-start gap-6 @[52rem]:grid-cols-[minmax(0,1fr)_minmax(var(--editor-preview-min),var(--editor-preview-share))]',
          className,
        )}
        style={vars}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

/** Keeps a preview column in view below the sticky app shell once the editor has split. */
export const EDITOR_SPLIT_STICKY =
  '@[52rem]:sticky @[52rem]:top-[calc(var(--app-shell-height)+1.5rem)]';

/** Preview shown first while stacked, second once split. */
export const EDITOR_SPLIT_PREVIEW_FIRST = 'order-1 @[52rem]:order-2';
/** Form shown second while stacked, first once split. */
export const EDITOR_SPLIT_FORM_SECOND = 'order-2 @[52rem]:order-1';
