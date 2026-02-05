import React, { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { useHeader } from '@/contexts/HeaderContext';
import { Loader2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import {
    AdminNav,
    CommunicationsSection,
    EmailLogsView,
    StatisticsSection,
    ChangeTierSection
} from './admin';

export function AdminPage() {
    const { currentUser } = useAuthState();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();

    const activeNavItem = [
        { title: 'Communications', path: '/admin' },
        { title: 'Statistics', path: '/admin/stats' },
        { title: 'Change Tier', path: '/admin/change-tier' },
    ].find(item => item.path === location.pathname) || { title: 'Communications', path: '/admin' };

    useEffect(() => {
        if (currentUser && currentUser.role !== 'ADMIN') {
            navigate('/dashboard');
        }
    }, [currentUser, navigate]);

    useEffect(() => {
        setHeaderContent(
            <div className="flex flex-col md:flex-row md:items-center md:justify-between w-full min-w-0 gap-3 md:gap-2">
                <div className="flex items-center gap-2 ml-2">
                    <Loader2 className="h-5 w-5 text-blue-600 flex-shrink-0 animate-spin" />
                    <h1
                        className="text-base sm:text-xl font-semibold italic truncate font-raleway"
                        style={{ color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        {activeNavItem.title.toUpperCase()}
                    </h1>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, setHeaderContent, activeNavItem.title]);

    if (!currentUser) {
        return (
            <div className="flex items-center justify-center h-96">
                <Spinner size="lg" variant="muted" />
            </div>
        );
    }

    if (currentUser.role !== 'ADMIN') {
        return null;
    }

    return (
        <div className="container mx-auto p-6 max-w-8xl">
            <div className="grid gap-8 md:grid-cols-[200px_1fr]">
                <AdminNav />

                <div className="min-w-0">
                    <Routes>
                        <Route index element={<CommunicationsSection />} />
                        <Route path="stats" element={<StatisticsSection />} />
                        <Route path="change-tier" element={<ChangeTierSection />} />
                    </Routes>
                </div>
            </div>
        </div>
    );
}

export default AdminPage;