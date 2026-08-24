import { useEffect, type ReactNode } from 'react';
import { useSetHeaderContent } from '@/contexts/HeaderContext';
import { ResponsivePageHeading } from '@/components/layout/ResponsivePageHeading';
import { cn } from '@/lib/utils';

export { PAGE_TITLE_CLASS } from '@/components/layout/pageHeaderLayout';

interface UsePageHeaderOptions {
    title?: ReactNode;
    icon?: ReactNode;
    leading?: ReactNode;
    rightContent?: ReactNode;
}

export const usePageHeader = ({
    title,
    icon,
    leading,
    rightContent,
}: UsePageHeaderOptions) => {
    const setHeaderContent = useSetHeaderContent();

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <ResponsivePageHeading title={title} icon={icon} leading={leading} />
                {rightContent ? (
                    <div className={cn('hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4')}>
                        {rightContent}
                    </div>
                ) : null}
            </div>
        );
        return () => setHeaderContent(null);
    }, [setHeaderContent, title, icon, leading, rightContent]);
};
