import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';

interface HeaderContextType {
    headerContent: ReactNode;
    setHeaderContent: (content: ReactNode) => void;
    desktopTools: ReactNode;
    setDesktopTools: (content: ReactNode) => void;
}

export const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

export function HeaderProvider({ children }: { children: ReactNode }) {
    const [headerContent, setHeaderContent] = useState<ReactNode>(null);
    const [desktopTools, setDesktopTools] = useState<ReactNode>(null);

    const value = useMemo(
        () => ({ headerContent, setHeaderContent, desktopTools, setDesktopTools }),
        [desktopTools, headerContent],
    );

    return (
        <HeaderContext.Provider value={value}>
            {children}
        </HeaderContext.Provider>
    );
}

/** Read-only header for AppShell. Pages must use PageLayout / usePageHeader. */
export function useHeader() {
    const context = useContext(HeaderContext);
    if (context === undefined) {
        throw new Error('useHeader must be used within a HeaderProvider');
    }
    return { headerContent: context.headerContent, desktopTools: context.desktopTools };
}

/** Internal setter used only by usePageHeader. */
export function useSetHeaderContent() {
    const context = useContext(HeaderContext);
    if (context === undefined) {
        throw new Error('useSetHeaderContent must be used within a HeaderProvider');
    }
    return context.setHeaderContent;
}

/** Internal setter used only by usePageHeader. */
export function useSetDesktopHeaderTools() {
    const context = useContext(HeaderContext);
    if (context === undefined) {
        throw new Error('useSetDesktopHeaderTools must be used within a HeaderProvider');
    }
    return context.setDesktopTools;
}
