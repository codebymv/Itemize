import React, { useEffect } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { LogOut, Moon, Sun, ShieldCheck, User, Zap, Crown, Building2, Mail, BarChart3, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PLAN_METADATA, type Plan } from '@/lib/subscription';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { HeaderProvider, useHeader } from '@/contexts/HeaderContext';
import { cn } from '@/lib/utils';

interface AppShellProps {
    children: React.ReactNode;
}

// Admin navigation items for dropdown
const adminNavItems = [
    { title: 'Communications', path: '/admin', icon: Mail },
    { title: 'Statistics', path: '/admin/stats', icon: BarChart3 },
    { title: 'Change Tier', path: '/admin/change-tier', icon: Zap },
];

// Internal component that accesses the useHeader hook
function AppShellContent({ children }: { children: React.ReactNode }) {
    const { currentUser, logout } = useAuth();
    const { theme, setTheme } = useTheme();
    const { toast } = useToast();
    const { headerContent } = useHeader();
    const navigate = useNavigate();
    const location = useLocation();
    const { subscription } = useSubscription();

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

    // Get tier icon based on subscription plan
    const getTierIcon = (plan?: Plan) => {
        if (!plan) return User;
        const iconName = PLAN_METADATA[plan]?.icon || 'user';
        const iconMap = {
            user: User,
            zap: Zap,
            crown: Crown,
            building: Building2
        };
        return iconMap[iconName] || User;
    };

    // Get current plan
    const currentPlan = (subscription?.planName?.toLowerCase() as Plan) || 'free';
    const TierIcon = getTierIcon(currentPlan);

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
                                <DropdownMenuContent align="end" className="w-64">
                                    <DropdownMenuLabel>
                                        <div className="flex items-center space-x-2">
                                            <div className="flex items-center gap-1">
                                                {currentUser?.role === 'ADMIN' && (
                                                    <ShieldCheck className="h-4 w-4" />
                                                )}
                                                <TierIcon className="h-4 w-4" />
                                            </div>
                                            <div className="flex flex-col space-y-1 flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{currentUser.name || 'User'}</p>
                                                <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
                                            </div>
                                        </div>
                                    </DropdownMenuLabel>
                                    
                                    {/* Admin Dashboard Collapsible - Only shown for ADMIN users */}
                                    {currentUser?.role === 'ADMIN' && (() => {
                                        const isOnAdminRoute = location.pathname.startsWith('/admin');
                                        
                                        return (
                                            <>
                                                <DropdownMenuSeparator />
                                                <div className="w-full">
                                                    <Collapsible 
                                                        defaultOpen={isOnAdminRoute} 
                                                        className="w-full group/collapsible"
                                                        onOpenChange={(open) => {
                                                            // When opening, navigate to first sub-item (matching sidebar behavior)
                                                            // Only navigate if we're not already on an admin route
                                                            if (open && !isOnAdminRoute && adminNavItems.length > 0) {
                                                                navigate(adminNavItems[0].path);
                                                            }
                                                        }}
                                                    >
                                                        <CollapsibleTrigger asChild>
                                                            <DropdownMenuItem 
                                                                className="w-full cursor-pointer group/admin"
                                                                onSelect={(e) => e.preventDefault()}
                                                            >
                                                                <ShieldCheck className={cn("mr-2 h-4 w-4 transition-colors", isOnAdminRoute ? "text-blue-600" : "group-hover/admin:text-blue-600")} />
                                                                <span className="flex-1">Admin Dashboard</span>
                                                                <ChevronRight className="h-4 w-4 ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                                            </DropdownMenuItem>
                                                        </CollapsibleTrigger>
                                                        <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
                                                            <div className="pl-6 py-1">
                                                                {adminNavItems.map((item) => {
                                                                    const isActive = location.pathname === item.path || 
                                                                        (item.path !== '/admin' && location.pathname.startsWith(item.path));
                                                                    
                                                                    return (
                                                                        <DropdownMenuItem
                                                                            key={item.path}
                                                                            onClick={() => navigate(item.path)}
                                                                            className={cn(
                                                                                "cursor-pointer",
                                                                                isActive && "bg-muted"
                                                                            )}
                                                                        >
                                                                            <span className="flex-1">{item.title}</span>
                                                                        </DropdownMenuItem>
                                                                    );
                                                                })}
                                                            </div>
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                </div>
                                            </>
                                        );
                                    })()}
                                    
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleLogout}>
                                        <LogOut className="mr-2 h-4 w-4 text-red-600" />
                                        <span className="flex-1">Log out</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </header>

                {/* Breadcrumb navigation - only for /help routes */}
                {location.pathname.startsWith('/help') && (
                    <div className="hidden md:block border-b px-4 py-2 bg-muted/30">
                        <Breadcrumbs />
                    </div>
                )}

                {/* Main content - add bottom padding on mobile for bottom nav */}
                <main className={cn(
                    "flex-1 overflow-x-hidden overflow-y-auto pb-16 md:pb-0",
                    location.pathname.startsWith('/help') 
                        ? "h-[calc(100vh-3.5rem-2.5rem)]" 
                        : "h-[calc(100vh-3.5rem)]"
                )}>
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
