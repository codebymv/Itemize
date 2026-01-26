import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
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
    Calendar,
    FileText,
    MessageSquare,
    Mail,
    Star,
    Receipt,
    Filter,
    Link,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        path: '/workspace',
        items: [
            {
                title: 'Canvas',
                path: '/workspace',
            },
            {
                title: 'Contents',
                path: '/workspace/contents',
            },
            {
                title: 'Shared',
                path: '/workspace/shared',
            },
        ],
    },
    {
        title: 'Contacts',
        icon: Users,
        path: '/contacts',
    },
    {
        title: 'Segments',
        icon: Filter,
        path: '/segments',
    },
    {
        title: 'Pipelines',
        icon: Kanban,
        path: '/pipelines',
    },
    {
        title: 'Scheduling',
        icon: Calendar,
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
            {
                title: 'Integrations',
                path: '/calendar-integrations',
            },
        ],
    },
    {
        title: 'Campaigns',
        icon: Mail,
        path: '/campaigns',
        items: [
            {
                title: 'All Campaigns',
                path: '/campaigns',
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
        icon: FileText,
        path: '/pages',
        items: [
            {
                title: 'Landing Pages',
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
                title: 'Social',
                path: '/social',
            },
        ],
    },
    {
        title: 'Automations',
        icon: Zap,
        path: '/automations',
    },
    {
        title: 'Reputation',
        icon: Star,
        path: '/reputation',
        items: [
            {
                title: 'Reviews',
                path: '/reputation',
            },
            {
                title: 'Requests',
                path: '/reputation/requests',
            },
            {
                title: 'Widgets',
                path: '/reputation/widgets',
            },
        ],
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
                path: '/invoices/estimates',
            },
            {
                title: 'Recurring',
                path: '/invoices/recurring',
            },
            {
                title: 'Payments',
                path: '/invoices/payments',
            },
            {
                title: 'Products',
                path: '/invoices/products',
            },
        ],
    },
];

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
                title: 'Preferences',
                path: '/settings/preferences',
            },
            {
                title: 'Payments',
                path: '/settings/payments',
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

export function AppSidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { theme } = useTheme();
    const { state, toggleSidebar } = useSidebar();

    const isCollapsed = state === 'collapsed';

    const handleNavigate = (path: string, disabled?: boolean) => {
        if (disabled) return;
        navigate(path);
    };

    const handleItemClick = (item: NavItem, disabled?: boolean) => {
        if (disabled) return;
        
        // If it's a grouping with sub-items, navigate to first sub-item
        if (item.items && item.items.length > 0) {
            // If collapsed, expand sidebar first, then navigate
            if (isCollapsed) {
                toggleSidebar();
                // Delay to allow sidebar to expand and component to re-render before navigation
                setTimeout(() => {
                    navigate(item.items![0].path);
                }, 200);
            } else {
                // Already expanded, navigate immediately
                navigate(item.items[0].path);
            }
        } else {
            // Regular item (no sub-items)
            if (isCollapsed) {
                // Expand sidebar first, then navigate
                toggleSidebar();
                setTimeout(() => {
                    navigate(item.path);
                }, 200);
            } else {
                // Already expanded, navigate immediately
                navigate(item.path);
            }
        }
    };

    return (
        <Sidebar collapsible="icon" className="border-r">
            <SidebarHeader className={cn("border-b py-4", isCollapsed ? "px-2" : "px-3")}>
                <div className={cn("flex items-center", isCollapsed ? "flex-col gap-2 justify-center" : "justify-between gap-2")}>
                    {!isCollapsed ? (
                        <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => navigate('/dashboard')}>
                            <img
                                src="/icon.png"
                                alt="Itemize Icon"
                                className="h-7 w-7 flex-shrink-0"
                            />
                            <img
                                src={theme === 'dark' ? '/textwhite.png' : '/textblack.png'}
                                alt="Itemize"
                                className="h-6 w-auto object-contain object-left"
                            />
                        </div>
                    ) : (
                        <img
                            src="/icon.png"
                            alt="Itemize"
                            className="h-8 w-8 cursor-pointer"
                            onClick={() => navigate('/dashboard')}
                        />
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSidebar}
                        className="h-8 w-8 flex-shrink-0"
                    >
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-400" /> : <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />}
                    </Button>
                </div>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup className={cn(isCollapsed && "w-full flex items-center justify-center")}>
                    <SidebarGroupLabel style={{ fontFamily: '"Raleway", sans-serif' }}>Main</SidebarGroupLabel>
                    <SidebarGroupContent className={cn(isCollapsed && "w-full flex items-center justify-center")}>
                        <SidebarMenu className={cn("gap-3", isCollapsed && "w-full items-center")}>
                            {mainNavItems.map((item) => {
                                // Check if any child route is active for grouped items
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
                                                        className="h-10 group/item"
                                                        style={{ fontFamily: '"Raleway", sans-serif' }}
                                                        onClick={(e) => {
                                                            if (isCollapsed) {
                                                                e.preventDefault();
                                                                handleItemClick(item, item.disabled);
                                                            }
                                                            // When expanded, CollapsibleTrigger handles toggle via onOpenChange
                                                        }}
                                                    >
                                                        <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-blue-600" : "text-gray-600 dark:text-gray-400 group-hover/item:text-blue-600")} />
                                                        <span>{item.title}</span>
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
                                                                    style={{ fontFamily: '"Raleway", sans-serif' }}
                                                                >
                                                                    <div onClick={() => handleNavigate(subItem.path)} className="cursor-pointer">
                                                                        <span>{subItem.title}</span>
                                                                    </div>
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
                                                "h-10 group/item",
                                                item.disabled ? 'opacity-50 cursor-not-allowed' : '',
                                                isActive ? 'text-gray-900 dark:text-white font-medium' : ''
                                            )}
                                            style={{ fontFamily: '"Raleway", sans-serif' }}
                                        >
                                            <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-blue-600" : "text-gray-600 dark:text-gray-400 group-hover/item:text-blue-600")} />
                                            <span>{item.title}</span>
                                            {item.disabled && (
                                                <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                                            )}
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className={cn("border-t", isCollapsed && "flex items-center justify-center")}>
                <SidebarGroup className={cn(isCollapsed && "w-full flex items-center justify-center")}>
                    <SidebarGroupContent className={cn(isCollapsed && "w-full flex items-center justify-center")}>
                        <SidebarMenu className={cn("gap-2", isCollapsed && "w-full items-center")}>
                            {secondaryNavItems.map((item) => {
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
                                                        className="h-9 group/item"
                                                        style={{ fontFamily: '"Raleway", sans-serif' }}
                                                        onClick={(e) => {
                                                            if (isCollapsed) {
                                                                e.preventDefault();
                                                                handleItemClick(item);
                                                            }
                                                            // When expanded, CollapsibleTrigger handles toggle via onOpenChange
                                                        }}
                                                    >
                                                        <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-blue-600" : "text-gray-600 dark:text-gray-400 group-hover/item:text-blue-600")} />
                                                        <span>{item.title}</span>
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
                                                                    style={{ fontFamily: '"Raleway", sans-serif' }}
                                                                >
                                                                    <div onClick={() => handleNavigate(subItem.path)} className="cursor-pointer">
                                                                        <span>{subItem.title}</span>
                                                                    </div>
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
                                                "h-9 group/item",
                                                isActive ? 'text-gray-900 dark:text-white font-medium' : ''
                                            )}
                                            style={{ fontFamily: '"Raleway", sans-serif' }}
                                        >
                                            <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-blue-600" : "text-gray-600 dark:text-gray-400 group-hover/item:text-blue-600")} />
                                            <span>{item.title}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarFooter>

            <SidebarRail />
        </Sidebar>
    );
}

export default AppSidebar;
