import { useEffect, type ReactNode } from 'react';
import { useSetHeaderContent } from '@/contexts/HeaderContext';
import { ResponsivePageHeading } from '@/components/layout/ResponsivePageHeading';

export { PAGE_TITLE_CLASS } from '@/components/layout/pageHeaderLayout';

interface UsePageHeaderOptions {
    title?: string;
    icon?: ReactNode;
    leading?: ReactNode;
}

export const usePageHeader = ({
    title,
    icon,
    leading,
}: UsePageHeaderOptions) => {
    const setHeaderContent = useSetHeaderContent();

    useEffect(() => {
        setHeaderContent(
            <div className="flex w-full min-w-0 items-center">
                <ResponsivePageHeading title={title} icon={icon} leading={leading} />
            </div>
        );
        return () => setHeaderContent(null);
    }, [setHeaderContent, title, icon, leading]);
};
