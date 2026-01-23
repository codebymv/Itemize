import React, { useEffect } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { LogOut, Moon, Sun } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { HeaderProvider, useHeader } from '@/contexts/HeaderContext';

interface AppShellProps {
    children: React.ReactNode;
}

// Internal component that accesses the useHeader hook
function AppShellContent({ children }: { children: React.ReactNode }) {
    const { currentUser, logout } = useAuth();
    const { theme, setTheme } = useTheme();
    const { toast } = useToast();
    const { headerContent } = useHeader();

    // Clear header content on unmount/change
    // This helps when navigating away from a page with custom header
    // Note: Pages should set their header content in useEffect

    const getUserInitials = (name: string, email: string): string => {
        if (name && name.trim()) {
            const nameParts = name.trim().split(' ');
            if (nameParts.length >= 2) {
                return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
            }
            return nameParts[0][0].toUpperCase();
        }
        return email ? email[0].toUpperCase() : 'U';
    };

    const handleLogout = async () => {
        try {
            await logout();
            toast({
                title: 'Goodbye!',
                description: 'Successfully signed out.',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to sign out. Please try again.',
                variant: 'destructive',
            });
        }
    };

    return (
        <SidebarProvider defaultOpen={true}>
            <AppSidebar />
            <SidebarInset className="overflow-x-hidden">
                {/* Top header bar */}
                <header className="flex h-14 items-center justify-between border-b px-4 bg-background sticky top-0 z-50 w-full overflow-hidden">
                    <div className="flex items-center gap-2 flex-1 overflow-hidden min-w-0">
                        <div className="md:hidden flex items-center mr-1">
                            <img src="/icon.png" alt="Itemize" className="h-6 w-auto" />
                        </div>
                        <SidebarTrigger className="md:hidden" />

                        {/* Dynamic header content injected by pages */}
                        <div className="flex-1 flex items-center min-w-0 overflow-hidden">
                            {headerContent}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        {/* Theme toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        >
                            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </Button>

                        {/* User menu */}
                        {currentUser && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0 bg-blue-600 hover:bg-blue-700">
                                        <span className="text-sm font-medium text-white">
                                            {getUserInitials(currentUser.name || '', currentUser.email || '')}
                                        </span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>
                                        <div className="flex flex-col space-y-1">
                                            <p className="text-sm font-medium">{currentUser.name || 'User'}</p>
                                            <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleLogout}>
                                        <LogOut className="mr-2 h-4 w-4 text-red-600" />
                                        <span>Log out</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </header>

                {/* Breadcrumb navigation - hidden on mobile, shown on desktop */}
                <div className="hidden md:block border-b px-4 py-2 bg-muted/30">
                    <Breadcrumbs />
                </div>

                {/* Main content - add bottom padding on mobile for bottom nav */}
                <main className="flex-1 overflow-x-hidden overflow-y-auto h-[calc(100vh-3.5rem)] md:h-[calc(100vh-3.5rem-2.5rem)] pb-16 md:pb-0">
                    {children}
                </main>
            </SidebarInset>
            
            {/* Mobile bottom navigation */}
            <MobileBottomNav />
        </SidebarProvider>
    );
}

export function AppShell({ children }: AppShellProps) {
    return (
        <HeaderProvider>
            <AppShellContent>{children}</AppShellContent>
        </HeaderProvider>
    );
}

export default AppShell;
