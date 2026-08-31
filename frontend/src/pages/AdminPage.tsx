import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import { Activity, BarChart3, Mail, Zap } from 'lucide-react';
import { LoadingState } from '@/components/LoadingState';
import { PageLayout } from '@/components/layout/PageLayout';
import type { DesktopHeaderToolsProps } from '@/components/layout/DesktopHeaderTools';
import {
    AdminNav,
    AdminShellNavigation,
    CommunicationsSection,
    StatisticsSection,
    OperationsSection,
    ChangeTierSection
} from './admin';

export function AdminPage() {
    const { currentUser } = useAuthState();
    const navigate = useNavigate();
    const location = useLocation();
    const [desktopTools, setDesktopTools] = useState<DesktopHeaderToolsProps>();

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
                icon={<ActiveIcon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
                compactNavigation={<AdminShellNavigation />}
                nav={<AdminNav />}
                navigationBreakpoint="wide"
            >
                <LoadingState kind="section" message="Loading administration" className="h-96" />
            </PageLayout>
        );
    }

    if (currentUser.role !== 'ADMIN') {
        return null;
    }

    return (
        <PageLayout
            title={activeNavItem.title.toUpperCase()}
            icon={<ActiveIcon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
            compactNavigation={<AdminShellNavigation />}
            headerTools={desktopTools}
            nav={<AdminNav />}
            navigationBreakpoint="wide"
        >
            <Routes>
                <Route index element={(
                    <CommunicationsSection
                        onDesktopToolsChange={setDesktopTools}
                    />
                )} />
                <Route path="stats" element={<StatisticsSection />} />
                <Route path="operations" element={(
                    <OperationsSection
                        onDesktopToolsChange={setDesktopTools}
                    />
                )} />
                <Route path="change-tier" element={<ChangeTierSection />} />
            </Routes>
        </PageLayout>
    );
}

export default AdminPage;
