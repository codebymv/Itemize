import { useEffect, type ReactNode } from 'react';
import { useSetHeaderContent } from '@/contexts/HeaderContext';
import { cn } from '@/lib/utils';

export const PAGE_TITLE_CLASS =
    'text-xl font-semibold italic truncate italic-safe font-raleway text-foreground';

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
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    {leading}
                    {icon}
                    {title ? (
                        <h1 className={PAGE_TITLE_CLASS}>
                            {title}
                        </h1>
                    ) : null}
                </div>
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
