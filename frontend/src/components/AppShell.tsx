import React, { useEffect, useState, createContext, useContext } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuthActions, useAuthState } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { AppHeaderIconButton } from '@/components/ui/app-header-icon-button';
import { LogOut, Moon, Sun, ShieldCheck, User, Zap, Crown, Building2, Mail, BarChart3, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscriptionState } from '@/contexts/SubscriptionContext';
import { PLAN_METADATA, type Plan } from '@/lib/subscription';
import { TrialBanner } from '@/components/trial/TrialBanner';
import { TrialBadge } from '@/components/trial/TrialBadge';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { TrialEndedBillingActiveModal } from '@/components/subscription/TrialEndedBillingActiveModal';
import { TrialExpiredModal } from '@/components/subscription/TrialExpiredModal';
import { useBillingStatus } from '@/hooks/useBillingStatus';
import { billingApi } from '@/services/billingApi';
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
import { useSessionWarning } from '@/hooks/useSessionExpiration';
import { HeaderProvider, useHeader } from '@/contexts/HeaderContext';
import { cn } from '@/lib/utils';
import { OrganizationSwitcher } from '@/components/OrganizationSwitcher';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

const GlobalSearch = React.lazy(() =>
  import('@/components/GlobalSearch').then((module) => ({ default: module.GlobalSearch }))
);

const SearchContext = createContext<{
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}>({
  searchOpen: false,
  setSearchOpen: () => {}
});

export const useSearch = () => useContext(SearchContext);

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
    const { currentUser } = useAuthState();
    const { logout } = useAuthActions();
    useSessionWarning();
    const { resolvedTheme, setTheme } = useTheme();
    const { toast } = useToast();
    const { headerContent, desktopTools } = useHeader();
    const navigate = useNavigate();
    const location = useLocation();
    const { subscription, isSubscribed } = useSubscriptionState();
    const [searchOpen, setSearchOpen] = useState(false);
    const [showTrialEndedBilling, setShowTrialEndedBilling] = useState(false);
    const [showTrialExpired, setShowTrialExpired] = useState(false);
    const { data: billingStatus } = useBillingStatus();
    const trialStatus = useTrialStatus(billingStatus?.trial_ends_at || null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSearchOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (!billingStatus) return;
        const trialEnded =
            !!billingStatus.trial_ends_at &&
            new Date(billingStatus.trial_ends_at) <= new Date() &&
            !billingStatus.trial_end_acknowledged_at;

        if (!trialEnded) return;

        if (billingStatus.subscription_status === 'active') {
            setShowTrialEndedBilling(true);
        } else if (
            billingStatus.subscription_status === 'canceled' ||
            billingStatus.plan === 'free' ||
            (billingStatus.subscription_status === 'trialing' && !billingStatus.stripe_subscription_id)
        ) {
            setShowTrialExpired(true);
        }
    }, [billingStatus]);

    const handleTrialModalClose = async () => {
        setShowTrialEndedBilling(false);
        setShowTrialExpired(false);
        try {
            await billingApi.acknowledgeTrialEnd();
        } catch {
            // Best-effort; modal won't re-show until next page load if this fails
        }
    };

    const getUserInitials = (name: string, email: string): string => {
        if (name && name.trim()) {
            return name.trim()[0].toUpperCase();
        }
        return email ? email[0].toUpperCase() : 'U';
    };

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
        <SearchContext.Provider value={{ searchOpen, setSearchOpen }}>
            <SidebarProvider defaultOpen={true}>
                <AppSidebar />
                <SidebarInset className="overflow-x-hidden">
                    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
                        Skip to main content
                    </a>
                    {/* Global chrome and page identity remain separate on narrow screens. */}
                <header className="sticky top-0 z-50 w-full min-w-0 border-b bg-background">
                  <div className="grid min-w-0 grid-cols-[1fr_auto] md:flex md:h-14 md:items-center md:px-4">
                    <div className="flex h-14 items-center px-4 md:hidden">
                        <SidebarTrigger className="h-11 w-11" />
                    </div>

                    {/* Dynamic page identity. It gets a dedicated row on mobile. */}
                    <div className="col-span-2 row-start-2 flex min-h-12 min-w-0 items-center border-t px-4 py-2 md:order-1 md:col-auto md:row-auto md:h-full md:min-h-0 md:flex-1 md:border-t-0 md:px-0 md:py-px">
                        <div className="min-w-0 flex-1 md:flex-none">{headerContent}</div>
                        {desktopTools}
                    </div>

                    <div className="col-start-2 row-start-1 flex h-14 shrink-0 items-center gap-2 pr-4 md:order-2 md:ml-4 md:h-auto md:pr-0">
                        <OrganizationSwitcher />

                        <NotificationCenter />

                        {/* Theme toggle - only visible on desktop */}
                        <AppHeaderIconButton
                            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                            className="hidden md:flex"
                            aria-label={`Use ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
                        >
                            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </AppHeaderIconButton>

                        {/* User menu */}
                        {currentUser && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      className="relative h-11 w-11 rounded-full bg-blue-600 p-0 hover:bg-blue-700"
                                      aria-label={`Account menu for ${currentUser.name || currentUser.email}`}
                                    >
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

                                    {trialStatus.isInTrial && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => navigate('/settings')}
                                                className="cursor-pointer"
                                            >
                                                <span className="flex-1">Trial access</span>
                                                <TrialBadge
                                                    trialEndsAt={billingStatus?.trial_ends_at || null}
                                                    compact={true}
                                                    className="ml-3 shrink-0"
                                                />
                                            </DropdownMenuItem>
                                        </>
                                    )}

                                    {/* Theme toggle - only visible on mobile */}
                                    <div className="md:hidden">
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
                                            {resolvedTheme === 'dark' ? (
                                                <>
                                                    <Sun className="mr-2 h-4 w-4" />
                                                    <span className="flex-1">Light mode</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Moon className="mr-2 h-4 w-4" />
                                                    <span className="flex-1">Dark mode</span>
                                                </>
                                            )}
                                        </DropdownMenuItem>
                                    </div>
                                    
                                    {/* Admin Dashboard Collapsible - Only shown for ADMIN users */}
                                    {currentUser?.role === 'ADMIN' && (() => {
                                        const isOnAdminRoute = location.pathname.startsWith('/admin');
                                        
                                        return (
                                            <>
                                                <DropdownMenuSeparator />
                                                <div className="w-full">
                                                    <Collapsible
                                                        asChild
                                                        open={isOnAdminRoute}
                                                        onOpenChange={(open) => {
                                                            if (open && !isOnAdminRoute && adminNavItems.length > 0) {
                                                                navigate(adminNavItems[0].path);
                                                            }
                                                        }}
                                                        className="group/collapsible"
                                                    >
                                                        <div>
                                                            <DropdownMenuItem
                                                                className="w-full cursor-pointer group/item"
                                                                onSelect={() => {
                                                                    navigate(adminNavItems[0].path);
                                                                }}
                                                            >
                                                                <CollapsibleTrigger asChild>
                                                                    <div className="flex items-center flex-1">
                                                                        <ShieldCheck className={cn("mr-2 h-4 w-4 transition-colors", isOnAdminRoute ? "text-blue-600 dark:text-blue-400" : "group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400")} />
                                                                        <span className="flex-1">Admin Dashboard</span>
                                                                        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 text-gray-600 dark:text-gray-400" />
                                                                    </div>
                                                                </CollapsibleTrigger>
                                                            </DropdownMenuItem>
                                                            <CollapsibleContent>
                                                                <div className="py-1">
                                                                    {adminNavItems.map((item) => {
                                                                        const isActive = location.pathname === item.path || 
                                                                            (item.path !== '/admin' && location.pathname.startsWith(item.path));
                                                                        
                                                                        return (
                                                                            <DropdownMenuItem
                                                                                key={item.path}
                                                                                onClick={() => navigate(item.path)}
                                                                                className={cn(
                                                                                    "cursor-pointer pl-8",
                                                                                    isActive && "bg-muted"
                                                                                )}
                                                                            >
                                                                                <span className="flex-1 text-sm">{item.title}</span>
                                                                            </DropdownMenuItem>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </CollapsibleContent>
                                                        </div>
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
                  </div>
                </header>

                {/* Trial lifecycle modals */}
                <TrialEndedBillingActiveModal
                    open={showTrialEndedBilling}
                    onClose={handleTrialModalClose}
                    billing={billingStatus || null}
                />
                <TrialExpiredModal
                    open={showTrialExpired}
                    onClose={handleTrialModalClose}
                    billing={billingStatus || null}
                />

                {/* Trial Banner - Shows only during active trial */}
                <TrialBanner
                    trialEndsAt={billingStatus?.trial_ends_at || null}
                    trialPlan={billingStatus
                        ? (PLAN_METADATA[billingStatus.plan]?.displayName || billingStatus.plan)
                        : undefined}
                />

                {/* Main content */}
                <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden overflow-y-auto relative h-[calc(100vh-3.5rem)]">
                    {children}
                </main>
            </SidebarInset>
            {searchOpen && (
                <React.Suspense fallback={null}>
                    <GlobalSearch
                        open
                        onClose={() => setSearchOpen(false)}
                        hasPaidAccess={isSubscribed}
                    />
                </React.Suspense>
            )}
        </SidebarProvider>
    </SearchContext.Provider>
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
