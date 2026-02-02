import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, BarChart3, Zap } from 'lucide-react';

// Admin navigation items - Communications is now the default
const adminNav = [
    { title: 'Communications', path: '/admin', icon: Mail },
    { title: 'Statistics', path: '/admin/stats', icon: BarChart3 },
    { title: 'Change Tier', path: '/admin/change-tier', icon: Zap },
];

export const AdminNav = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const activePath = location.pathname === '/admin/' ? '/admin' : location.pathname;

    const mobileTabs = (
        <Tabs value={activePath} onValueChange={(value) => navigate(value)} className="w-full md:hidden">
            <TabsList className="grid w-full grid-cols-3 mb-4">
                {adminNav.map((item) => (
                    <TabsTrigger
                        key={item.path}
                        value={item.path}
                        className="flex items-center gap-1.5 text-xs sm:text-sm px-2 sm:px-3"
                    >
                        <item.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="hidden sm:inline">{item.title}</span>
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );

    const desktopNav = (
        <nav className="hidden md:flex flex-col gap-1">
            {adminNav.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path === '/admin' && location.pathname === '/admin/');
                return (
                    <Button
                        key={item.path}
                        variant={isActive ? 'secondary' : 'ghost'}
                        className="justify-start text-muted-foreground hover:text-foreground font-raleway"
                        onClick={() => navigate(item.path)}
                    >
                        <item.icon className={`mr-2 h-4 w-4 ${isActive ? 'text-blue-600' : ''}`} />
                        {item.title}
                    </Button>
                );
            })}
        </nav>
    );

    return (
        <>
            {mobileTabs}
            {desktopNav}
        </>
    );
};

export default AdminNav;