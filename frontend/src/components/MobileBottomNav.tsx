import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    Users,
    Kanban,
    MessageSquare,
    Menu,
    X,
} from 'lucide-react';
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';

interface NavItem {
    title: string;
    icon: React.ElementType;
    path: string;
}

// Primary nav items for bottom bar (max 5 for usability)
const primaryNavItems: NavItem[] = [
    { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { title: 'Contacts', icon: Users, path: '/contacts' },
    { title: 'Pipelines', icon: Kanban, path: '/pipelines' },
    { title: 'Inbox', icon: MessageSquare, path: '/inbox' },
];

// More items shown in drawer
const moreNavItems: NavItem[] = [
    { title: 'Workspace', icon: () => <span className="text-lg">🗺️</span>, path: '/workspace' },
    { title: 'Calendars', icon: () => <span className="text-lg">📅</span>, path: '/calendars' },
    { title: 'Bookings', icon: () => <span className="text-lg">📆</span>, path: '/bookings' },
    { title: 'Forms', icon: () => <span className="text-lg">📝</span>, path: '/forms' },
    { title: 'Automations', icon: () => <span className="text-lg">⚡</span>, path: '/automations' },
    { title: 'Settings', icon: () => <span className="text-lg">⚙️</span>, path: '/settings' },
];

export function MobileBottomNav() {
    const location = useLocation();
    const navigate = useNavigate();
    const [moreOpen, setMoreOpen] = React.useState(false);

    const isActive = (path: string) => {
        return location.pathname === path || 
            (path !== '/' && location.pathname.startsWith(path));
    };

    const handleNavigate = (path: string) => {
        navigate(path);
        setMoreOpen(false);
    };

    return (
        <>
            {/* Bottom Navigation Bar - Only visible on mobile */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t md:hidden safe-area-bottom">
                <div className="flex items-center justify-around h-16">
                    {primaryNavItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        
                        return (
                            <button
                                key={item.path}
                                onClick={() => handleNavigate(item.path)}
                                className={cn(
                                    "flex flex-col items-center justify-center flex-1 h-full min-w-[64px] py-2 transition-colors",
                                    active 
                                        ? "text-gray-900 dark:text-white" 
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <Icon className={cn("h-5 w-5 mb-1", active && "text-blue-600")} />
                                <span 
                                    className={cn(
                                        "text-xs font-medium",
                                        active && "text-gray-900 dark:text-white"
                                    )}
                                    style={{ fontFamily: '"Raleway", sans-serif' }}
                                >
                                    {item.title}
                                </span>
                            </button>
                        );
                    })}
                    
                    {/* More button */}
                    <button
                        onClick={() => setMoreOpen(true)}
                        className={cn(
                            "flex flex-col items-center justify-center flex-1 h-full min-w-[64px] py-2 transition-colors",
                            moreOpen 
                                ? "text-gray-900 dark:text-white" 
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Menu className="h-5 w-5 mb-1" />
                        <span className="text-xs font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>More</span>
                    </button>
                </div>
            </nav>

            {/* More Drawer */}
            <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
                <DrawerContent className="max-h-[85vh]">
                    <DrawerHeader className="flex items-center justify-between">
                        <DrawerTitle style={{ fontFamily: '"Raleway", sans-serif' }}>More</DrawerTitle>
                        <DrawerClose asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <X className="h-4 w-4" />
                            </Button>
                        </DrawerClose>
                    </DrawerHeader>
                    <div className="px-4 pb-8">
                        <div className="grid grid-cols-3 gap-4">
                            {moreNavItems.map((item) => {
                                const Icon = item.icon;
                                const active = isActive(item.path);
                                
                                return (
                                    <button
                                        key={item.path}
                                        onClick={() => handleNavigate(item.path)}
                                        className={cn(
                                            "flex flex-col items-center justify-center p-4 rounded-xl transition-colors",
                                            active 
                                                ? "bg-blue-100 dark:bg-blue-900/30" 
                                                : "bg-muted/50 hover:bg-muted"
                                        )}
                                    >
                                        <Icon className={cn(
                                            "h-6 w-6 mb-2",
                                            active ? "text-blue-600" : "text-foreground"
                                        )} />
                                        <span 
                                            className={cn(
                                                "text-xs font-medium text-center",
                                                active ? "text-gray-900 dark:text-white" : "text-foreground"
                                            )}
                                            style={{ fontFamily: '"Raleway", sans-serif' }}
                                        >
                                            {item.title}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </DrawerContent>
            </Drawer>
        </>
    );
}

export default MobileBottomNav;
