import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

const MASK: CSSProperties = {
  WebkitMaskImage: 'url("/icon.png")',
  maskImage: 'url("/icon.png")',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskSize: 'contain',
  maskSize: 'contain',
};

/**
 * The Itemize mark in the user's theme colour. The shipped PNG is used as a
 * mask so the shape is exact, and the fill is the icon-accent token, so it
 * follows the theme and light/dark like every other chrome icon. Brand
 * surfaces (marketing, public pages) keep the blue `<img src="/icon.png">`.
 */
export function ThemeMark({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-theme-mark
      className={cn('block shrink-0 bg-icon-accent', className)}
      style={MASK}
    />
  );
}
