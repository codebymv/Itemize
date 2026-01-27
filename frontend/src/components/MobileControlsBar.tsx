import React from 'react';
import { cn } from '@/lib/utils';

interface MobileControlsBarProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * A standardized container for mobile-only controls, rendered at the top of page content.
 * Hidden on desktop (md breakpoint and above).
 * Sticky positioning keeps controls visible while scrolling.
 */
export function MobileControlsBar({ children, className }: MobileControlsBarProps) {
    return (
        <div className={cn(
            "md:hidden flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-background sticky top-0 z-40",
            className
        )}>
            {children}
        </div>
    );
}

export default MobileControlsBar;
