import { useEffect, type ReactNode } from 'react';
import { useSetDesktopHeaderTools, useSetHeaderContent } from '@/contexts/HeaderContext';
import { ResponsivePageHeading } from '@/components/layout/ResponsivePageHeading';
import { DesktopHeaderTools, type DesktopHeaderToolsProps } from '@/components/layout/DesktopHeaderTools';

export { PAGE_TITLE_CLASS } from '@/components/layout/pageHeaderLayout';

interface UsePageHeaderOptions {
    title?: string;
    icon?: ReactNode;
    leading?: ReactNode;
    compactNavigation?: ReactNode;
    compactNavigationBreakpoint?: 'md' | 'wide';
    desktopTools?: DesktopHeaderToolsProps;
}

export const usePageHeader = ({
    title,
    icon,
    leading,
    compactNavigation,
    compactNavigationBreakpoint,
    desktopTools,
}: UsePageHeaderOptions) => {
    const setHeaderContent = useSetHeaderContent();
    const setDesktopTools = useSetDesktopHeaderTools();

    useEffect(() => {
        setHeaderContent(
            <ResponsivePageHeading
                title={title}
                icon={icon}
                leading={leading}
                compactNavigation={compactNavigation}
                compactNavigationBreakpoint={compactNavigationBreakpoint}
            />,
        );
        return () => setHeaderContent(null);
    }, [compactNavigation, compactNavigationBreakpoint, icon, leading, setHeaderContent, title]);

    useEffect(() => {
        setDesktopTools(desktopTools ? <DesktopHeaderTools {...desktopTools} /> : null);
        return () => setDesktopTools(null);
    }, [desktopTools, setDesktopTools]);
};
