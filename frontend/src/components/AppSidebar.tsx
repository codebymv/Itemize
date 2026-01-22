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
    useSidebar,
} from '@/components/ui/sidebar';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Navigation items for the sidebar
const mainNavItems = [
    {
        title: 'Dashboard',
        icon: LayoutDashboard,
        path: '/dashboard',
    },
    {
        title: 'Workspace',
        icon: Map,
        path: '/workspace',
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
        title: 'Automations',
        icon: Zap,
        path: '/automations',
    },
];

const secondaryNavItems = [
    {
        title: 'Settings',
        icon: Settings,
        path: '/settings',
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

    return (
        <Sidebar collapsible="icon" className="border-r">
            <SidebarHeader className="border-b px-2 py-3">
                <div className="flex items-center justify-between">
                    {!isCollapsed && (
                        <img
                            src={theme === 'dark' ? '/cover_whitetext.png' : '/cover.png'}
                            alt="Itemize"
                            className="h-8 w-auto cursor-pointer"
                            onClick={() => navigate('/dashboard')}
                        />
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSidebar}
                        className="h-8 w-8"
                    >
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    </Button>
                </div>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Main</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {mainNavItems.map((item) => {
                                const isActive = location.pathname === item.path ||
                                    (item.path !== '/' && location.pathname.startsWith(item.path));

                                return (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            tooltip={item.title}
                                            isActive={isActive}
                                            onClick={() => handleNavigate(item.path, item.disabled)}
                                            className={cn(
                                                item.disabled ? 'opacity-50 cursor-not-allowed' : '',
                                                isActive ? 'text-blue-600 dark:text-blue-400 font-medium' : ''
                                            )}
                                        >
                                            <item.icon className={cn("h-4 w-4", isActive && "text-blue-600 dark:text-blue-400")} />
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

            <SidebarFooter className="border-t">
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {secondaryNavItems.map((item) => {
                                const isActive = location.pathname === item.path ||
                                    (item.path !== '/' && location.pathname.startsWith(item.path));

                                return (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            tooltip={item.title}
                                            isActive={isActive}
                                            onClick={() => handleNavigate(item.path)}
                                            className={cn(
                                                isActive ? 'text-blue-600 dark:text-blue-400 font-medium' : ''
                                            )}
                                        >
                                            <item.icon className={cn("h-4 w-4", isActive && "text-blue-600 dark:text-blue-400")} />
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
