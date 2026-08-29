import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavigationRow } from '@/components/ui/navigation-row';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from '@/components/ui/select';
import { Activity, Mail, BarChart3, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

// Admin navigation items - Communications is now the default
const adminNav = [
    { title: 'Communications', path: '/admin', icon: Mail },
    { title: 'Statistics', path: '/admin/stats', icon: BarChart3 },
    { title: 'Operations', path: '/admin/operations', icon: Activity },
    { title: 'Change Tier', path: '/admin/change-tier', icon: Zap },
];

export const AdminNav = () => {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <nav aria-label="Admin sections" className="hidden flex-col gap-1 lg:flex">
            {adminNav.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path === '/admin' && location.pathname === '/admin/');
                return (
                    <NavigationRow
                        key={item.path}
                        active={isActive}
                        icon={item.icon}
                        className="font-raleway"
                        onClick={() => navigate(item.path)}
                    >
                        {item.title}
                    </NavigationRow>
                );
            })}
        </nav>
    );
};

export function AdminShellNavigation() {
    const location = useLocation();
    const navigate = useNavigate();
    const activePath = location.pathname === '/admin/' ? '/admin' : location.pathname;
    const activeItem = adminNav.find((item) => item.path === activePath) ?? adminNav[0];
    const ActiveIcon = activeItem.icon;

    return (
        <div className="min-w-0">
            <h1 className="sr-only">{activeItem.title.toUpperCase()}</h1>
            <Select value={activeItem.path} onValueChange={(value) => navigate(value)}>
                <SelectTrigger
                    aria-label="Admin section"
                    className="h-11 w-auto max-w-full gap-2 bg-background px-3 font-raleway [&>span]:!flex [&>span]:line-clamp-none"
                >
                    <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                        <ActiveIcon
                            aria-hidden="true"
                            className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400"
                            data-admin-section-icon={activeItem.title}
                        />
                        <span className="text-lg font-semibold italic text-foreground">
                            {activeItem.title.toUpperCase()}
                        </span>
                    </span>
                </SelectTrigger>
                <SelectContent align="start">
                    {adminNav.map((item) => (
                        <SelectItem key={item.path} value={item.path} className="py-2.5 pr-3">
                            <span className="flex items-center gap-2">
                                <item.icon
                                    aria-hidden="true"
                                    className={cn(
                                        'h-4 w-4 shrink-0',
                                        item.path === activeItem.path
                                            ? 'text-blue-600 dark:text-blue-400'
                                            : 'text-gray-600 dark:text-gray-400',
                                    )}
                                />
                                <span>{item.title}</span>
                            </span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

export default AdminNav;
