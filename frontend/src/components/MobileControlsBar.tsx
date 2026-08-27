import React from 'react';
import { cn } from '@/lib/utils';

interface MobileControlsBarProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * A standardized page-level container for mobile-only controls.
 * It deliberately scrolls with page content so dense controls never become a
 * second application header.
 */
export function MobileControlsBar({ children, className }: MobileControlsBarProps) {
    return (
        <section
          aria-label="Page actions"
          className={cn(
            "mx-3 mt-4 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/10 p-3 md:hidden [&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11 [&_[role=combobox]]:min-h-11",
            className
          )}
        >
            {children}
        </section>
    );
}

export default MobileControlsBar;
