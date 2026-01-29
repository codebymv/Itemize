import React, { useEffect } from 'react';
import { useHeader } from '@/contexts/HeaderContext';
import { cn } from '@/lib/utils';

interface UsePageHeaderOptions {
    title?: React.ReactNode;
    icon?: React.ReactNode;
    rightContent?: React.ReactNode;
    theme?: string;
    content?: React.ReactNode;
    className?: string;
    leftClassName?: string;
    rightClassName?: string;
    titleClassName?: string;
}

export const usePageHeader = (
    options: UsePageHeaderOptions,
    deps: React.DependencyList = []
) => {
    const { setHeaderContent } = useHeader();

    useEffect(() => {
        const resolvedContent = options.content ?? (
            <div className={cn('flex items-center justify-between w-full min-w-0', options.className)}>
                <div className={cn('flex items-center gap-2 ml-2 min-w-0', options.leftClassName)}>
                    {options.icon}
                    {options.title ? (
                        <h1
                            className={cn('text-xl font-semibold italic truncate font-raleway', options.titleClassName)}
                            style={{
                                color: options.theme === 'dark' ? '#ffffff' : '#000000'
                            }}
                        >
                            {options.title}
                        </h1>
                    ) : null}
                </div>
                {options.rightContent ? (
                    <div className={cn('hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4', options.rightClassName)}>
                        {options.rightContent}
                    </div>
                ) : null}
            </div>
        );

        setHeaderContent(resolvedContent);
        return () => setHeaderContent(null);
    }, [setHeaderContent, ...deps]);
};
