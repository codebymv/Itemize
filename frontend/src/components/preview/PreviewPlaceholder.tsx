import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PreviewPlaceholder({
  action,
  className,
  description,
  icon: Icon,
  size = 'default',
  title,
}: {
  action?: ReactNode;
  className?: string;
  description?: string;
  icon?: LucideIcon;
  size?: 'default' | 'compact';
  title: string;
}) {
  const compact = size === 'compact';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/10 px-6 text-center',
        compact ? 'min-h-28 py-6' : 'min-h-48 py-10',
        className,
      )}
      data-preview-placeholder
    >
      {Icon ? (
        <div className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/70',
          compact ? 'mb-2 h-8 w-8' : 'mb-4 h-12 w-12',
        )}>
          <Icon
            aria-hidden="true"
            className={cn('text-blue-600 dark:text-blue-400', compact ? 'h-4 w-4' : 'h-6 w-6')}
          />
        </div>
      ) : null}
      <h3 className={cn('font-medium', compact ? 'text-sm' : 'text-base')}>{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-5 text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
