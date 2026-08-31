import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton,
    useSidebar,
} from '@/components/ui/sidebar';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
    LayoutDashboard,
    Map,
    Users,
    Settings,
    HelpCircle,
    Activity,
    ChevronLeft,
    ChevronRight,
    Kanban,
    Zap,
    CalendarDays,
    Layout,
    MessageSquare,
    Megaphone,
    Star,
    Receipt,
    Search,
    FileSignature,
    Ellipsis,
} from 'lucide-react';
import { AppHeaderIconButton } from '@/components/ui/app-header-icon-button';
import { useSearch } from '@/components/AppShell';
import { useSubscriptionState } from '@/contexts/SubscriptionContext';
import { useOrganization } from '@/hooks/useOrganization';
import {
    getOrganizationBootstrapViaGraphql,
    organizationBootstrapQueryKey,
    type OrganizationBootstrap,
} from '@/services/organizationBootstrapGraphql';
import { getWorkspaceDestinations, getWorkspaceLanding } from '@/lib/workspaceNavigation';
import { AVAILABLE_PLANS_PATH } from '@/lib/settingsNavigation';

// Navigation items for the sidebar
interface NavItem {
    title: string;
    icon: React.ElementType;
    path: string;
    disabled?: boolean;
    items?: {
        title: string;
        path: string;
    }[];
}

const mainNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        icon: LayoutDashboard,
        path: '/dashboard',
    },
    {
        title: 'Workspace',
        icon: Map,
        path: '/canvas',
        items: getWorkspaceDestinations(false),
    },
    {
        title: 'Contacts',
        icon: Users,
        path: '/contacts',
    },
    {
        title: 'Pipelines',
        icon: Kanban,
        path: '/pipelines',
    },
    {
        title: 'Sales & Payments',
        icon: Receipt,
        path: '/invoices',
        items: [
            {
                title: 'Invoices',
                path: '/invoices',
            },
            {
                title: 'Estimates',
                path: '/estimates',
            },
            {
                title: 'Payments',
                path: '/invoices/payments',
            },
            {
                title: 'Products',
                path: '/products',
            },
        ],
    },
    {
        title: 'Documents',
        icon: FileSignature,
        path: '/documents',
        items: [
            {
                title: 'All Documents',
                path: '/documents',
            },
            {
                title: 'Templates',
                path: '/templates',
            },
        ],
    },
    {
        title: 'Automations',
        icon: Zap,
        path: '/automations',
    },
    {
        title: 'Campaigns',
        icon: Megaphone,
        path: '/campaigns',
        items: [
            {
                title: 'Campaigns',
                path: '/campaigns',
            },
            {
                title: 'Segments',
                path: '/segments',
            },
            {
                title: 'Email Templates',
                path: '/email-templates',
            },
            {
                title: 'SMS Templates',
                path: '/sms-templates',
            },
        ],
    },
    {
        title: 'Pages & Forms',
        icon: Layout,
        path: '/pages',
        items: [
            {
                title: 'Pages',
                path: '/pages',
            },
            {
                title: 'Forms',
                path: '/forms',
            },
        ],
    },
    {
        title: 'Communications',
        icon: MessageSquare,
        path: '/inbox',
        items: [
            {
                title: 'Inbox',
                path: '/inbox',
            },
            {
                title: 'Chat Widget',
                path: '/chat-widget',
            },
            {
                title: 'Connected Accounts',
                path: '/social',
            },
        ],
    },
    {
        title: 'Scheduling',
        icon: CalendarDays,
        path: '/calendars',
        items: [
            {
                title: 'Calendars',
                path: '/calendars',
            },
            {
                title: 'Bookings',
                path: '/bookings',
            },
        ],
    },
    {
        title: 'Reputation',
        icon: Star,
        path: '/reviews',
        items: [
            {
                title: 'Reviews',
                path: '/reviews',
            },
            {
                title: 'Requests',
                path: '/review-requests',
            },
            {
                title: 'Widgets',
                path: '/review-widgets',
            },
            {
                title: 'Configuration',
                path: '/reputation-settings',
            },
        ],
    },
];

const FIRST_RUN_PRIMARY_NAV = new Set([
    'Dashboard',
    'Workspace',
    'Contacts',
    'Sales & Payments',
    'Documents',
]);

const secondaryNavItems: NavItem[] = [
    {
        title: 'Settings',
        icon: Settings,
        path: '/settings',
        items: [
            {
                title: 'Account',
                path: '/settings',
            },
            {
                title: 'Organization',
                path: '/organization-settings',
            },
            {
                title: 'Preferences',
                path: '/preferences',
            },
            {
                title: 'Payments',
                path: '/payment-settings',
            },
            {
                title: 'Integrations',
                path: '/settings/integrations',
            },
        ],
    },
    {
        title: 'Help',
        icon: HelpCircle,
        path: '/help',
    },
    {
        title: 'Status',
        icon: Activity,
        path: '/status',
    },
];

function isAppleModifierPlatform(): boolean {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const clientPlatform = nav.userAgentData?.platform?.toLowerCase();
    if (clientPlatform === 'macos' || clientPlatform === 'ios') return true;
    if (clientPlatform === 'windows' || clientPlatform === 'android' || clientPlatform === 'linux') return false;
    const platform = navigator.platform ?? '';
    if (/^(Mac|iPhone|iPod|iPad)/i.test(platform)) return true;
    return /Mac OS X|Macintosh|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function AppSidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
    const { setSearchOpen } = useSearch();
    const { organizationId } = useOrganization();
    const {
        isLoading: isSubscriptionLoading,
        isSubscribed,
        isTrialing,
        tierLevel,
        subscription,
        error: subscriptionError,
    } = useSubscriptionState();
    const [searchShortcutHint, setSearchShortcutHint] = React.useState<'apple' | 'other' | null>(null);
    const [isMoreToolsOpen, setIsMoreToolsOpen] = React.useState(false);

    const { data: getStartedProgress } = useQuery<OrganizationBootstrap, Error, OrganizationBootstrap['getStartedProgress']>({
        queryKey: organizationBootstrapQueryKey(organizationId),
        queryFn: ({ signal }) => getOrganizationBootstrapViaGraphql(
            organizationId as number,
            signal,
        ),
        enabled: isTrialing && !!organizationId,
        staleTime: 5 * 60 * 1000,
        select: (bootstrap) => bootstrap.getStartedProgress,
    });

    const isCollapsed = state === 'collapsed';

    const workspaceLanding = getWorkspaceLanding(isMobile);
    const responsiveMainNavItems = mainNavItems.map((item) => item.title === 'Workspace'
        ? { ...item, path: workspaceLanding.path, items: getWorkspaceDestinations(isMobile) }
        : item);
    const workspaceItems = responsiveMainNavItems.filter((item) => item.title === 'Workspace');
    const paidItems = tierLevel >= 2
        ? responsiveMainNavItems
        : responsiveMainNavItems.map((item) => item.title === 'Communications' && item.items
            ? { ...item, items: item.items.filter((subItem) => subItem.title !== 'Social') }
            : item);
    const firstSendCompleted = getStartedProgress?.steps
        .find((step) => step.id === 'first_send')?.completed === true;
    const shouldFocusTrialNavigation = isTrialing && !firstSendCompleted;
    const focusedPaidItems = shouldFocusTrialNavigation
        ? paidItems.filter((item) => FIRST_RUN_PRIMARY_NAV.has(item.title))
        : paidItems;
    const moreToolsItems = shouldFocusTrialNavigation
        ? paidItems.filter((item) => !FIRST_RUN_PRIMARY_NAV.has(item.title))
        : [];
    const subscriptionUnavailable = !!subscriptionError && !subscription;
    const filteredMainNavItems = isSubscriptionLoading || subscriptionUnavailable
        ? workspaceItems
        : isSubscribed
            ? focusedPaidItems
            : [
                ...workspaceItems,
                { title: 'Unlock business tools', icon: Zap, path: AVAILABLE_PLANS_PATH },
            ];
    const filteredSecondaryNavItems = secondaryNavItems;
    const homePath = isSubscribed ? '/dashboard' : workspaceLanding.path;

    const isNavItemActive = React.useCallback((item: NavItem) => (
        location.pathname === item.path
        || (item.path !== '/' && location.pathname.startsWith(item.path))
        || Boolean(item.items?.some((subItem) => (
            location.pathname === subItem.path
            || location.pathname.startsWith(`${subItem.path}/`)
        )))
    ), [location.pathname]);

    const isMoreToolsRouteActive = moreToolsItems.some(isNavItemActive);

    // Auto-close sidebar on mobile when route changes
    React.useEffect(() => {
        if (isMobile) {
            setOpenMobile(false);
        }
    }, [location.pathname, isMobile, setOpenMobile]);

    React.useEffect(() => {
        setSearchShortcutHint(isAppleModifierPlatform() ? 'apple' : 'other');
    }, []);

    React.useEffect(() => {
        if (isMoreToolsRouteActive) {
            setIsMoreToolsOpen(true);
        }
    }, [isMoreToolsRouteActive]);

    const handleNavigate = (path: string, disabled?: boolean) => {
        if (disabled) return;
        navigate(path);
    };

    const handleItemClick = (item: NavItem, disabled?: boolean) => {
        if (disabled) return;
        if (isCollapsed) toggleSidebar();
        if (item.items && item.items.length > 0) {
            navigate(item.items[0].path);
        } else {
            navigate(item.path);
        }
    };

    const renderMainNavItem = (item: NavItem) => {
        const isActive = isNavItemActive(item);

        if (item.items && item.items.length > 0) {
            return (
                <Collapsible
                    key={item.title}
                    asChild
                    open={isActive}
                    onOpenChange={(open) => {
                        if (open && !isActive && item.items && item.items.length > 0) {
                            navigate(item.items[0].path);
                        }
                    }}
                    className="group/collapsible"
                >
                    <SidebarMenuItem className={cn(isCollapsed && "flex justify-center")}>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                                tooltip={item.title}
                                isActive={isActive}
                                className="h-10 group/item font-raleway"
                                onClick={(event) => {
                                    if (isCollapsed) {
                                        event.preventDefault();
                                        handleItemClick(item, item.disabled);
                                    }
                                }}
                            >
                                <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400 group-hover/item:text-blue-600 group-focus-visible/item:text-blue-600 dark:group-hover/item:text-blue-400 dark:group-focus-visible/item:text-blue-400")} />
                                <span className="min-w-0 flex-1 truncate whitespace-nowrap">{item.title}</span>
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 text-gray-600 dark:text-gray-400" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                {item.items.map((subItem) => (
                                    <SidebarMenuSubItem key={subItem.title}>
                                        <SidebarMenuSubButton
                                            asChild
                                            isActive={location.pathname === subItem.path}
                                            className="font-raleway"
                                        >
                                            <button type="button" onClick={() => handleNavigate(subItem.path)} className="w-full cursor-pointer text-left">
                                                <span className="block min-w-0 truncate whitespace-nowrap">{subItem.title}</span>
                                            </button>
                                        </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                ))}
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </Collapsible>
            );
        }

        return (
            <SidebarMenuItem key={item.title} className={cn(isCollapsed && "flex justify-center")}>
                <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActive}
                    onClick={() => handleItemClick(item, item.disabled)}
                    className={cn(
                        "h-10 group/item font-raleway",
                        item.disabled ? 'opacity-50 cursor-not-allowed' : '',
                        isActive ? 'text-gray-900 dark:text-white font-medium' : '',
                    )}
                >
                    <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400 group-hover/item:text-blue-600 group-focus-visible/item:text-blue-600 dark:group-hover/item:text-blue-400 dark:group-focus-visible/item:text-blue-400")} />
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap">{item.title}</span>
                    {item.disabled && (
                        <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                    )}
                </SidebarMenuButton>
            </SidebarMenuItem>
        );
    };

    const brandIcon = () => (
        <span
            className={cn(
                'relative block h-8 w-10 min-h-8 min-w-10 max-h-8 max-w-10 shrink-0 overflow-hidden',
                'transition-[transform,filter] duration-500 ease-out',
                'group-hover:-translate-y-1 group-hover:translate-x-0.5',
                'group-hover:drop-shadow-[0_6px_10px_rgba(37,99,235,0.32)]',
            )}
        >
            <span className="relative block h-full w-full overflow-hidden">
                <img
                    src="/icon.png"
                    width={40}
                    height={32}
                    alt=""
                    aria-hidden="true"
                    className="block h-8 w-10 object-contain dark:hidden"
                />
                <img
                    src="/icon-blue-400.png"
                    width={40}
                    height={32}
                    alt=""
                    aria-hidden="true"
                    className="hidden h-8 w-10 object-contain dark:block"
                />
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                    style={{
                        WebkitMaskImage: 'url("/icon.png")',
                        maskImage: 'url("/icon.png")',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                    }}
                >
                    <span
                        className="absolute inset-0 -translate-x-full transition-transform duration-1000 ease-out group-hover:translate-x-full"
                        style={{
                            background:
                                'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)',
                        }}
                    />
                </span>
            </span>
        </span>
    );

    return (
        <Sidebar collapsible="icon" className="border-r">
            <SidebarHeader className={cn("border-b py-4", isCollapsed ? "px-2" : "px-3")}>
                <div className={cn("flex items-center", isCollapsed ? "flex-col gap-2 justify-center" : "justify-between gap-2")}>
                    <div
                        className={cn(
                            "group flex min-w-0 items-center cursor-pointer",
                            isCollapsed ? "justify-center" : "flex-1 gap-2",
                        )}
                        onClick={() => navigate(homePath)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                navigate(homePath);
                            }
                        }}
                        role="link"
                        tabIndex={0}
                        aria-label="Itemize"
                    >
                        {brandIcon()}
                        <span
                            aria-hidden={isCollapsed}
                            className={cn(
                                "relative block h-6 shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-linear",
                                isCollapsed ? "w-0 opacity-0" : "w-[7.5rem] opacity-100",
                            )}
                        >
                            <img
                                src="/textblack.png"
                                alt=""
                                aria-hidden="true"
                                className="absolute inset-y-0 left-0 h-6 w-auto max-w-none object-contain object-left dark:hidden"
                            />
                            <img
                                src="/textwhite.png"
                                alt=""
                                aria-hidden="true"
                                className="absolute inset-y-0 left-0 hidden h-6 w-auto max-w-none object-contain object-left dark:block"
                            />
                        </span>
                    </div>
                    <AppHeaderIconButton
                        onClick={toggleSidebar}
                        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-400" /> : <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />}
                    </AppHeaderIconButton>
                </div>
            </SidebarHeader>

            <div className={cn("px-3 py-2", isCollapsed && "hidden")}>
                <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="interaction-control relative flex min-h-11 w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm text-muted-foreground"
                >
                    <Search className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">Search anything...</span>
                    <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                        <span className="text-xs">{searchShortcutHint === 'apple' ? '⌘' : 'Ctrl'}</span>K
                    </kbd>
                </button>
            </div>

            <SidebarContent>
                <SidebarGroup className={cn(isCollapsed && "w-full flex items-center justify-center")}>
                    <SidebarGroupContent className={cn(isCollapsed && "w-full flex items-center justify-center")}>
                        <SidebarMenu className={cn("gap-3", isCollapsed && "w-full items-center")}>
                            {filteredMainNavItems.map(renderMainNavItem)}
                            {moreToolsItems.length > 0 && (
                                <Collapsible
                                    asChild
                                    open={isMoreToolsOpen}
                                    onOpenChange={setIsMoreToolsOpen}
                                    className="group/more-tools"
                                >
                                    <SidebarMenuItem className={cn(isCollapsed && "flex justify-center")}>
                                        <CollapsibleTrigger asChild>
                                            <SidebarMenuButton
                                                tooltip="More tools"
                                                isActive={isMoreToolsRouteActive}
                                                className="h-10 group/item font-raleway"
                                                aria-label="More tools"
                                                onClick={(event) => {
                                                    if (isCollapsed) {
                                                        event.preventDefault();
                                                        toggleSidebar();
                                                        setIsMoreToolsOpen(true);
                                                    }
                                                }}
                                            >
                                                <Ellipsis className={cn("h-4 w-4 transition-colors", isMoreToolsRouteActive ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400 group-hover/item:text-blue-600 group-focus-visible/item:text-blue-600 dark:group-hover/item:text-blue-400 dark:group-focus-visible/item:text-blue-400")} />
                                                <span className="min-w-0 flex-1 truncate whitespace-nowrap">More tools</span>
                                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/more-tools:rotate-90 text-gray-600 dark:text-gray-400" />
                                            </SidebarMenuButton>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                            <SidebarMenu className="mt-2 gap-3 pl-2">
                                                {moreToolsItems.map(renderMainNavItem)}
                                            </SidebarMenu>
                                        </CollapsibleContent>
                                    </SidebarMenuItem>
                                </Collapsible>
                            )}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            {filteredSecondaryNavItems.length > 0 && (
                <SidebarFooter className={cn("border-t", isCollapsed && "flex items-center justify-center")}>
                    <SidebarGroup className={cn(isCollapsed && "w-full flex items-center justify-center")}>
                        <SidebarGroupContent className={cn(isCollapsed && "w-full flex items-center justify-center")}>
                            <SidebarMenu className={cn("gap-2", isCollapsed && "w-full items-center")}>
                                {filteredSecondaryNavItems.map((item) => {
                                    const isActive = location.pathname === item.path ||
                                        (item.path !== '/' && location.pathname.startsWith(item.path)) ||
                                        (item.items?.some(sub => location.pathname === sub.path || location.pathname.startsWith(sub.path + '/')));

                                    if (item.items && item.items.length > 0) {
                                        return (
                                            <Collapsible
                                                key={item.title}
                                                asChild
                                                open={!!isActive}
                                                onOpenChange={(open) => {
                                                    // When opening, navigate to first sub-item
                                                    if (open && !isActive && item.items && item.items.length > 0) {
                                                        navigate(item.items[0].path);
                                                    }
                                                }}
                                                className="group/collapsible"
                                            >
                                                <SidebarMenuItem className={cn(isCollapsed && "flex justify-center")}>
                                                    <CollapsibleTrigger asChild>
                                                        <SidebarMenuButton
                                                            tooltip={item.title}
                                                            isActive={isActive}
                                                            className="h-9 group/item font-raleway"
                                                            onClick={(e) => {
                                                                if (isCollapsed) {
                                                                    e.preventDefault();
                                                                    handleItemClick(item);
                                                                }
                                                                // When expanded, CollapsibleTrigger handles toggle via onOpenChange
                                                            }}
                                                        >
                                                            <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400 group-hover/item:text-blue-600 group-focus-visible/item:text-blue-600 dark:group-hover/item:text-blue-400 dark:group-focus-visible/item:text-blue-400")} />
                                                            <span className="min-w-0 flex-1 truncate whitespace-nowrap">{item.title}</span>
                                                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 text-gray-600 dark:text-gray-400" />
                                                        </SidebarMenuButton>
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent>
                                                        <SidebarMenuSub>
                                                            {item.items.map((subItem) => (
                                                                <SidebarMenuSubItem key={subItem.title}>
                                                                    <SidebarMenuSubButton
                                                                        asChild
                                                                        isActive={location.pathname === subItem.path}
                                                                        className="font-raleway"
                                                                    >
                                                                        <button type="button" onClick={() => handleNavigate(subItem.path)} className="w-full cursor-pointer text-left">
                                                                            <span className="block min-w-0 truncate whitespace-nowrap">{subItem.title}</span>
                                                                        </button>
                                                                    </SidebarMenuSubButton>
                                                                </SidebarMenuSubItem>
                                                            ))}
                                                        </SidebarMenuSub>
                                                    </CollapsibleContent>
                                                </SidebarMenuItem>
                                            </Collapsible>
                                        );
                                    }

                                    return (
                                        <SidebarMenuItem key={item.title} className={cn(isCollapsed && "flex justify-center")}>
                                            <SidebarMenuButton
                                                tooltip={item.title}
                                                isActive={isActive}
                                                onClick={() => handleItemClick(item)}
                                                className={cn(
                                                    "h-9 group/item font-raleway",
                                                    isActive ? 'text-gray-900 dark:text-white font-medium' : ''
                                                )}
                                            >
                                                <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400 group-hover/item:text-blue-600 group-focus-visible/item:text-blue-600 dark:group-hover/item:text-blue-400 dark:group-focus-visible/item:text-blue-400")} />
                                                <span className="min-w-0 flex-1 truncate whitespace-nowrap">{item.title}</span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarFooter>
            )}

            <SidebarRail />
        </Sidebar>
    );
}

export default AppSidebar;
