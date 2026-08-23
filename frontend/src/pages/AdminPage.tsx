import React, { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import { Activity, BarChart3, Mail, Zap } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { PageLayout } from '@/components/layout/PageLayout';
import {
    AdminNav,
    CommunicationsSection,
    StatisticsSection,
    OperationsSection,
    ChangeTierSection
} from './admin';

export function AdminPage() {
    const { currentUser } = useAuthState();
    const navigate = useNavigate();
    const location = useLocation();

    const activeNavItem = [
        { title: 'Communications', path: '/admin', icon: Mail },
        { title: 'Statistics', path: '/admin/stats', icon: BarChart3 },
        { title: 'Operations', path: '/admin/operations', icon: Activity },
        { title: 'Change Tier', path: '/admin/change-tier', icon: Zap },
    ].find(item => item.path === location.pathname)
        || { title: 'Communications', path: '/admin', icon: Mail };
    const ActiveIcon = activeNavItem.icon;

    useEffect(() => {
        if (currentUser && currentUser.role !== 'ADMIN') {
            navigate('/dashboard');
        }
    }, [currentUser, navigate]);

    if (!currentUser) {
        return (
            <PageLayout
                title={activeNavItem.title.toUpperCase()}
                icon={<ActiveIcon className="h-5 w-5 shrink-0 text-primary" />}
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
            icon={<ActiveIcon className="h-5 w-5 shrink-0 text-primary" />}
            nav={<AdminNav />}
        >
            <Routes>
                <Route index element={<CommunicationsSection />} />
                <Route path="stats" element={<StatisticsSection />} />
                <Route path="operations" element={<OperationsSection />} />
                <Route path="change-tier" element={<ChangeTierSection />} />
            </Routes>
        </PageLayout>
    );
}

export default AdminPage;
