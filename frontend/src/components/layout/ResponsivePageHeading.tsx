import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import {
  PAGE_TITLE_CLASS,
  shouldShowMobilePageHeaderIcon,
} from './pageHeaderLayout';

interface ResponsivePageHeadingProps {
  title?: ReactNode;
  icon?: ReactNode;
  leading?: ReactNode;
}

export function ResponsivePageHeading({
  title,
  icon,
  leading,
}: ResponsivePageHeadingProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const leadingRef = useRef<HTMLSpanElement>(null);
  const measuredIconWidth = useRef(0);
  const [showMobileIcon, setShowMobileIcon] = useState(true);

  const measure = useCallback(() => {
    if (!icon || !rowRef.current || !titleRef.current) return;
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches) {
      setShowMobileIcon(true);
      return;
    }

    const liveIconWidth = iconRef.current?.getBoundingClientRect().width ?? 0;
    if (liveIconWidth > 0) measuredIconWidth.current = liveIconWidth;

    const styles = window.getComputedStyle(rowRef.current);
    const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
    const nextValue = shouldShowMobilePageHeaderIcon({
      availableWidth: rowRef.current.clientWidth,
      titleWidth: titleRef.current.scrollWidth,
      iconWidth: measuredIconWidth.current,
      leadingWidth: leadingRef.current?.getBoundingClientRect().width ?? 0,
      gap,
    });
    setShowMobileIcon((current) => current === nextValue ? current : nextValue);
  }, [icon]);

  useLayoutEffect(() => {
    measure();
  }, [measure, title, leading]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(row);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div ref={rowRef} className="ml-2 flex min-w-0 flex-1 items-center gap-2">
      {leading ? (
        <span ref={leadingRef} className="inline-flex shrink-0" data-page-header-leading>
          {leading}
        </span>
      ) : null}
      {icon ? (
        <span
          ref={iconRef}
          className={cn(
            'shrink-0 md:inline-flex',
            showMobileIcon ? 'inline-flex' : 'hidden',
          )}
          data-page-header-icon
          data-mobile-visible={showMobileIcon}
        >
          {icon}
        </span>
      ) : null}
      {title ? (
        <h1 ref={titleRef} className={cn(PAGE_TITLE_CLASS, 'min-w-0')}>
          {title}
        </h1>
      ) : null}
    </div>
  );
}
