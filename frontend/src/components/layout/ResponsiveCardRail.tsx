import React, { useCallback, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface ResponsiveCardRailProps {
  label: string;
  desktopColumns: string;
  children: React.ReactNode;
  className?: string;
  mobileCardClassName?: string;
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

export function ResponsiveCardRail({
  label,
  desktopColumns,
  children,
  className,
  mobileCardClassName = 'flex-[0_0_82%]',
  showIndicators,
}: ResponsiveCardRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [activeIndex, setActiveIndex] = useState(0);
  const cards = flattenChildren(children);
  const itemCount = cards.length;
  const hasIndicators = showIndicators ?? itemCount >= 4;

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
            )}
          >
            {child}
          </div>
        ))}
      </div>

      {hasIndicators && itemCount > 1 && (
        <div
          aria-label={`${label} position`}
          className="mt-3 flex items-center justify-center gap-1.5 md:hidden"
        >
          {Array.from({ length: itemCount }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-current={activeIndex === index ? 'true' : undefined}
              aria-label={`Show card ${index + 1} of ${itemCount}`}
              className={cn(
                'h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                activeIndex === index
                  ? 'w-4 bg-primary'
                  : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50',
              )}
              onClick={() => scrollToItem(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
