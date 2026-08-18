import React, { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { PageLayout } from '@/components/layout/PageLayout';
import {
    AdminNav,
    CommunicationsSection,
    StatisticsSection,
    ChangeTierSection
} from './admin';

export function AdminPage() {
    const { currentUser } = useAuthState();
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

    if (!currentUser) {
        return (
            <PageLayout
                title={activeNavItem.title.toUpperCase()}
                icon={<Loader2 className="h-5 w-5 text-blue-600 flex-shrink-0 animate-spin" />}
                nav={<AdminNav />}
            >
                <div className="flex items-center justify-center h-96">
                    <Spinner size="lg" variant="muted" />
                </div>
            </PageLayout>
        );
    }

    if (currentUser.role !== 'ADMIN') {
        return null;
    }

    return (
        <PageLayout
            title={activeNavItem.title.toUpperCase()}
            icon={<Loader2 className="h-5 w-5 text-blue-600 flex-shrink-0 animate-spin" />}
            nav={<AdminNav />}
        >
            <Routes>
                <Route index element={<CommunicationsSection />} />
                <Route path="stats" element={<StatisticsSection />} />
                <Route path="change-tier" element={<ChangeTierSection />} />
            </Routes>
        </PageLayout>
    );
}

export default AdminPage;
