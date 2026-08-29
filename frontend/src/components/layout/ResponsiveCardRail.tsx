import React, { useCallback, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface ResponsiveCardRailProps {
  label: string;
  desktopColumns: string;
  children: React.ReactNode;
  className?: string;
  mobileCardClassName?: string;
  desktopCardClassName?: string;
  showIndicators?: boolean;
}

function flattenChildren(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment) {
      return flattenChildren(child.props.children);
    }

    return child;
  });
}

type GridBreakpoint = 'md' | 'lg' | 'xl' | '2xl';

const TWO_COLUMN_CLASSES: Record<GridBreakpoint, string> = {
  md: 'md:col-span-2 md:w-[calc((100%_-_1rem)/2)] md:justify-self-center',
  lg: 'lg:col-span-2 lg:w-[calc((100%_-_1rem)/2)] lg:justify-self-center',
  xl: 'xl:col-span-2 xl:w-[calc((100%_-_1rem)/2)] xl:justify-self-center',
  '2xl': '2xl:col-span-2 2xl:w-[calc((100%_-_1rem)/2)] 2xl:justify-self-center',
};

const STANDARD_COLUMN_CLASSES: Record<GridBreakpoint, string> = {
  md: 'md:col-span-1 md:w-auto md:justify-self-stretch',
  lg: 'lg:col-span-1 lg:w-auto lg:justify-self-stretch',
  xl: 'xl:col-span-1 xl:w-auto xl:justify-self-stretch',
  '2xl': '2xl:col-span-1 2xl:w-auto 2xl:justify-self-stretch',
};

function oddLastCardClasses(desktopColumns: string): string {
  const breakpoints: GridBreakpoint[] = ['md', 'lg', 'xl', '2xl'];
  return breakpoints.flatMap((breakpoint) => {
    const match = desktopColumns.match(new RegExp(`(?:^|\\s)${breakpoint}:grid-cols-(\\d+)(?:\\s|$)`));
    if (!match) return [];
    return Number(match[1]) === 2
      ? [TWO_COLUMN_CLASSES[breakpoint]]
      : [STANDARD_COLUMN_CLASSES[breakpoint]];
  }).join(' ');
}

export function ResponsiveCardRail({
  label,
  desktopColumns,
  children,
  className,
  mobileCardClassName = 'flex-[0_0_82%]',
  desktopCardClassName,
  showIndicators,
}: ResponsiveCardRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [activeIndex, setActiveIndex] = useState(0);
  const cards = flattenChildren(children);
  const itemCount = cards.length;
  const hasIndicators = showIndicators ?? itemCount >= 4;
  const centeredOddLastClasses = itemCount % 2 === 1
    ? oddLastCardClasses(desktopColumns)
    : '';

  const updateActiveIndex = useCallback(() => {
    const rail = railRef.current;
    if (!rail || !isMobile) return;

    const railCenter = rail.scrollLeft + rail.clientWidth / 2;
    const items = Array.from(rail.children) as HTMLElement[];
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    items.forEach((item, index) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const distance = Math.abs(itemCenter - railCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setActiveIndex(closestIndex);
  }, [isMobile]);

  const scrollToItem = (index: number) => {
    const rail = railRef.current;
    const item = rail?.children.item(index) as HTMLElement | null;
    if (!rail || !item) return;

    rail.scrollTo({ left: item.offsetLeft, behavior: 'smooth' });
    setActiveIndex(index);
  };

  return (
    <div className={cn('mb-6', className)}>
      <div
        ref={railRef}
        aria-label={label}
        className={cn(
          'responsive-card-rail -mx-3 flex snap-x snap-mandatory scroll-px-3 gap-4 overflow-x-auto overscroll-x-contain px-3 pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0 md:snap-none',
          desktopColumns,
        )}
        role="region"
        tabIndex={isMobile ? 0 : undefined}
        onScroll={updateActiveIndex}
      >
        {cards.map((child, index) => (
          <div
            key={React.isValidElement(child) ? child.key ?? index : index}
            className={cn(
              'min-w-0 snap-start md:flex-auto [&>*]:h-full',
              mobileCardClassName,
              desktopCardClassName,
              index === itemCount - 1 && centeredOddLastClasses,
            )}
          >
            {child}
          </div>
        ))}
      </div>

      {hasIndicators && itemCount > 1 && (
        <div
          aria-label={`${label} position`}
          className="mt-1 flex items-center justify-center md:hidden"
        >
          {Array.from({ length: itemCount }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-current={activeIndex === index ? 'true' : undefined}
              aria-label={`Show card ${index + 1} of ${itemCount}`}
              className="group flex h-8 w-8 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => scrollToItem(index)}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  activeIndex === index
                    ? 'w-4 bg-primary'
                    : 'w-1.5 bg-muted-foreground/30 group-hover:bg-muted-foreground/50',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
