import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, type CardContentSurface } from '@/components/ui/card';
import { SectionCardTitle } from '@/components/ui/section-card-title';
import { cn } from '@/lib/utils';

interface FramedSectionProps extends Omit<React.ComponentPropsWithoutRef<typeof Card>, 'title'> {
  title: React.ReactNode;
  icon: LucideIcon;
  headingLevel?: 2 | 3 | 4;
  description?: React.ReactNode;
  action?: React.ReactNode;
  headerClassName?: string;
  contentClassName?: string;
  contentSurface?: CardContentSurface;
}

const HEADING_TAGS = {
  2: 'h2',
  3: 'h3',
  4: 'h4',
} as const;

/**
 * Groups one coherent piece of page content into the app's standard hierarchy:
 * shell background -> framed section -> inset content surfaces.
 *
 * Children should use `surface="inset"` when they are cards. Use
 * `contentSurface="inset"` when the section directly owns a form, table,
 * preview, or other content instead of a collection of child cards.
 */
const FramedSection = React.forwardRef<HTMLDivElement, FramedSectionProps>(({
  title,
  icon,
  headingLevel = 2,
  description,
  action,
  headerClassName,
  contentClassName,
  contentSurface = 'plain',
  className,
  children,
  ...props
}, ref) => {
  const headingId = React.useId();

  return (
    <Card
      ref={ref}
      role="region"
      aria-labelledby={headingId}
      data-framed-section
      className={className}
      {...props}
    >
      <CardHeader
        className={cn(
          'flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-4 sm:p-6',
          headerClassName,
        )}
      >
        <div className="min-w-0">
          <SectionCardTitle id={headingId} icon={icon} as={HEADING_TAGS[headingLevel]}>
            {title}
          </SectionCardTitle>
          {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent
        surface={contentSurface}
        className={cn(contentSurface === 'plain' && 'p-4 pt-0 sm:p-6 sm:pt-0', contentClassName)}
      >
        {children}
      </CardContent>
    </Card>
  );
});
FramedSection.displayName = 'FramedSection';

export { FramedSection };
