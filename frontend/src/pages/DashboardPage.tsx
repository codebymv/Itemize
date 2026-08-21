import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/StatCard';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PageLayout } from '@/components/layout/PageLayout';
import {
    Users,
    TrendingUp,
    Calendar,
    CheckSquare,
    DollarSign,
    ArrowRight,
    Map,
    Sparkles,
    LucideIcon,
    Clock,
    AlertCircle,
    CalendarDays,
    Target,
    Workflow,
    BarChart3,
    PieChart,
    LayoutDashboard,
    Activity,
    Mail,
} from 'lucide-react';
import { useDashboardData } from './dashboard/hooks/useDashboardData';
import { usePeriodSelector, periodLabels, type PeriodOption } from './dashboard/hooks/usePeriodSelector';
import { PipelineFunnel } from './dashboard/components/PipelineFunnel';
import { ConversionRateCard } from './dashboard/components/ConversionRateCard';
import { CommunicationStatsCard } from './dashboard/components/CommunicationStatsCard';
import { PipelineDealAgeCard } from './dashboard/components/PipelineDealAgeCard';
import { RecentActivityList } from './dashboard/components/RecentActivityList';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { ActivityTimeline } from '@/components/activity-timeline';
import { transformApiActivityToDesignSystem } from '@/design-system/utils/transform-api-activity';
import { RevenueTrendsChart } from './dashboard/components/RevenueTrendsChart';
import { useOrganization } from '@/hooks/useOrganization';
import { InvoicesWidget, SignaturesWidget, WorkspaceWidget, ContactsWidget } from '@/design-system/widgets';
import { GetStartedCard } from '@/components/GetStartedCard';

interface QuickAction {
    title: string;
    description: string;
    icon: LucideIcon;
    action: () => void;
}

export function DashboardPage() {
    const { currentUser } = useAuthState();

    const DASHBOARD_COLLAPSED_KEY = 'itemize_dashboard_collapsed';

    // Pro tip dismiss state
    const [proTipDismissed, setProTipDismissed] = useState(false);

    // Collapsible widget state (persisted to localStorage)
    const [collapsedWidgets, setCollapsedWidgets] = useState<Set<string>>(() => {
        if (typeof window === 'undefined') return new Set();
        try {
            const raw = window.localStorage.getItem(DASHBOARD_COLLAPSED_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                return Array.isArray(arr) ? new Set(arr) : new Set();
            }
        } catch {
            // ignore
        }
        return new Set();
    });

    // Responsive detection
    const [isMobile, setIsMobile] = useState(false);

    // Initialize mobile detection
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // On mobile, if no persisted state yet, default to widgets collapsed and persist
    useEffect(() => {
        if (typeof window === 'undefined' || !isMobile) return;
        const raw = window.localStorage.getItem(DASHBOARD_COLLAPSED_KEY);
        if (raw === null || raw === '[]') {
            const defaultCollapsed = new Set(['invoices', 'signatures', 'workspace', 'contacts']);
            setCollapsedWidgets(defaultCollapsed);
            try {
                window.localStorage.setItem(DASHBOARD_COLLAPSED_KEY, JSON.stringify([...defaultCollapsed]));
            } catch {
                // ignore
            }
        }
    }, [isMobile]);

    // Helper functions
    const isWidgetCollapsed = (widgetId: string) => collapsedWidgets.has(widgetId);

    const toggleWidgetCollapse = (widgetId: string) => {
        setCollapsedWidgets(prev => {
            const newSet = new Set(prev);
            if (newSet.has(widgetId)) {
                newSet.delete(widgetId);
            } else {
                newSet.add(widgetId);
            }
            try {
                window.localStorage.setItem(DASHBOARD_COLLAPSED_KEY, JSON.stringify([...newSet]));
            } catch {
                // ignore
            }
            return newSet;
        });
    };
    const navigate = useNavigate();
    const { organizationId } = useOrganization();
    
    // Period selector hook
    const { period, setPeriod } = usePeriodSelector('30days');

    // Fetch all dashboard data with custom hook
    const {
        analytics,
        conversions: conversionData,
        communications: commStats,
        pipelineDealAge,
        revenue: revenueData,
        isLoadingAnalytics: isLoading,
        isLoadingConversions: conversionLoading,
        isLoadingCommunications: commLoading,
        isLoadingPipelineDealAge,
        isLoadingRevenue: revenueLoading,
    } = useDashboardData({ organizationId, period });

    const firstName = currentUser?.name?.split(' ')[0] || 'there';

    const quickActions: QuickAction[] = [
        {
            title: 'Manage Contacts',
            description: 'View and manage your CRM contacts',
            icon: Users,
            action: () => navigate('/contacts'),
        },
        {
            title: 'View Pipelines',
            description: 'Track deals and opportunities',
            icon: TrendingUp,
            action: () => navigate('/pipelines'),
        },
        {
            title: 'View Bookings',
            description: 'Manage your appointments',
            icon: Calendar,
            action: () => navigate('/bookings'),
        },
        {
            title: 'Open Workspace',
            description: 'Continue organizing on your canvas',
            icon: Map,
            action: () => navigate('/canvas'),
        },
    ];

    return (
        <PageLayout
            title="DASHBOARD"
            icon={<LayoutDashboard className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
            headerActions={
                <>
                    <Select value={period} onValueChange={(value) => setPeriod(value as PeriodOption)}>
                        <SelectTrigger className="w-[140px] h-9 bg-muted/20 border-border/50">
                            <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(periodLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
                        onClick={() => navigate('/canvas')}
                    >
                        <Map className="h-4 w-4 mr-2" />
                        Canvas
                    </Button>
                </>
            }
            mobileActions={
                <>
                    <Select value={period} onValueChange={(value) => setPeriod(value as PeriodOption)}>
                        <SelectTrigger className="w-[140px] h-9 bg-muted/20 border-border/50">
                            <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(periodLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light flex-1"
                        onClick={() => navigate('/canvas')}
                    >
                        <Map className="h-4 w-4 mr-2" />
                        Canvas
                    </Button>
                </>
            }
        >
                    {/* Welcome Section */}
                    <div className="mb-8">
                        <h2 className="text-2xl font-light tracking-tight mb-2">
                            Welcome back, <span className="font-medium">{firstName}</span>
                        </h2>
                        <p className="text-muted-foreground">
                            Here's an overview of your CRM performance
                        </p>
                    </div>

                    <GetStartedCard />

                    {/* CRM Stats: swipeable rail on mobile, grid on desktop */}
                    <ResponsiveCardRail
                        label="CRM overview"
                        desktopColumns="md:grid-cols-2 lg:grid-cols-4"
                        className="mb-8"
                    >
                        <StatCard
                            title="Total Contacts"
                            badgeText="Total Contacts"
                            value={analytics?.contacts?.total ?? 0}
                            icon={Users}
                            description="Added"
                            colorTheme="blue"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Open Deals"
                            badgeText="Open Deals"
                            value={analytics?.deals?.open ?? 0}
                            icon={TrendingUp}
                            description={`${analytics?.deals?.total ?? 0} deals total`}
                            colorTheme="orange"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Upcoming Bookings"
                            badgeText="Upcoming"
                            value={analytics?.bookings?.upcomingThisWeek ?? 0}
                            icon={CalendarDays}
                            description={`${analytics?.bookings?.upcomingToday ?? 0} today`}
                            colorTheme="orange"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Pipelines"
                            badgeText="Pipelines"
                            value={analytics?.pipelines?.total ?? 0}
                            icon={Workflow}
                            description="Configured"
                            colorTheme="blue"
                            isLoading={isLoading}
                        />
                    </ResponsiveCardRail>

                    {/* Secondary Stats: swipeable rail on mobile, grid on desktop */}
                    <ResponsiveCardRail
                        label="Activity overview"
                        desktopColumns="md:grid-cols-3"
                        className="mb-8"
                    >
                        <StatCard
                            title="Tasks Overdue"
                            badgeText="Overdue"
                            value={analytics?.tasks?.overdue ?? 0}
                            icon={AlertCircle}
                            description={`${analytics?.tasks?.pending ?? 0} pending`}
                            colorTheme="red"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Active Contacts"
                            badgeText="Active"
                            value={analytics?.contacts?.active ?? 0}
                            icon={Users}
                            description={`${analytics?.contacts?.newThisMonth ?? 0} new this month`}
                            colorTheme="blue"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Deals Won"
                            badgeText="Won"
                            value={analytics?.deals?.won ?? 0}
                            icon={CheckSquare}
                            description={`${analytics?.deals?.lost ?? 0} lost`}
                            colorTheme="green"
                            isLoading={isLoading}
                        />
                    </ResponsiveCardRail>

                    {/* Module summaries: swipeable rail on mobile, grid on desktop */}
                    <ResponsiveCardRail
                        label="Module summaries"
                        desktopColumns="md:grid-cols-2 lg:grid-cols-4"
                        mobileCardClassName="flex-[0_0_88%]"
                        className="mb-8"
                    >
                        <InvoicesWidget
                            primaryStat={analytics?.invoiceMetrics?.pending ?? 0}
                            primaryStatColor="text-blue-600 dark:text-blue-400"
                            secondaryStats={[
                                { label: 'Overdue', value: analytics?.invoiceMetrics?.overdue ?? 0, color: 'text-orange-600 dark:text-orange-400' },
                                { label: 'Paid This Month', value: `$${(analytics?.invoiceMetrics?.paidThisMonth ?? 0).toLocaleString()}`, color: 'text-green-600 dark:text-green-400' },
                            ]}
                            recentItems={analytics?.invoiceMetrics?.recentInvoices?.map(inv => ({
                                id: inv.id,
                                title: inv.number,
                                subtitle: `$${inv.amount.toLocaleString()}`,
                                status: { label: inv.status === 'paid' ? 'Paid' : inv.status === 'overdue' ? 'Overdue' : inv.status, color: inv.status === 'paid' ? 'text-green-600 dark:text-green-400' : inv.status === 'overdue' ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400' }
                            })) ?? []}
                            action={{ label: 'View Invoices', onClick: () => navigate('/invoices') }}
                            loading={isLoading}
                            compact={isMobile}
                            isCollapsed={isWidgetCollapsed('invoices')}
                            onToggleCollapse={() => toggleWidgetCollapse('invoices')}
                        />
                        <SignaturesWidget
                            primaryStat={analytics?.signatureMetrics?.awaiting ?? 0}
                            primaryStatColor="text-blue-600 dark:text-blue-400"
                            secondaryStats={[
                                { label: 'Signed This Week', value: analytics?.signatureMetrics?.signedThisWeek ?? 0, color: 'text-green-600 dark:text-green-400' },
                                { label: 'Total Documents', value: analytics?.signatureMetrics?.total ?? 0, color: 'text-gray-600 dark:text-gray-400' },
                            ]}
                            recentItems={analytics?.signatureMetrics?.recentDocuments?.map(sig => ({
                                id: sig.id,
                                title: sig.title,
                                status: { label: sig.status === 'signed' ? 'Signed' : sig.status === 'sent' ? 'Awaiting' : sig.status, color: sig.status === 'signed' ? 'text-green-600 dark:text-green-400' : sig.status === 'sent' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400' }
                            })) ?? []}
                            action={{ label: 'View Documents', onClick: () => navigate('/documents') }}
                            loading={isLoading}
                            compact={isMobile}
                            isCollapsed={isWidgetCollapsed('signatures')}
                            onToggleCollapse={() => toggleWidgetCollapse('signatures')}
                        />
                        <WorkspaceWidget
                            primaryStat={analytics?.workspaceMetrics?.activeItems ?? 0}
                            primaryStatLabel="Active Items"
                            primaryStatColor="text-blue-600 dark:text-blue-400"
                            secondaryStats={[
                                { label: 'Lists', value: analytics?.workspaceMetrics?.lists ?? 0, color: 'text-blue-600 dark:text-blue-400' },
                                { label: 'Notes', value: analytics?.workspaceMetrics?.notes ?? 0, color: 'text-blue-600 dark:text-blue-400' },
                            ]}
                            recentItems={analytics?.workspaceMetrics?.recentItems?.map(item => ({
                                id: `${item.type}:${item.date}:${item.title}`,
                                title: item.title,
                                status: undefined
                            })) ?? []}
                            action={{ label: 'Open Workspace', onClick: () => navigate('/canvas') }}
                            loading={isLoading}
                            compact={isMobile}
                            isCollapsed={isWidgetCollapsed('workspace')}
                            onToggleCollapse={() => toggleWidgetCollapse('workspace')}
                        />
                        <ContactsWidget
                            primaryStat={analytics?.contacts?.newThisWeek ?? 0}
                            primaryStatLabel="This Week"
                            primaryStatColor="text-blue-600 dark:text-blue-400"
                            secondaryStats={[
                                { label: 'Total', value: analytics?.contacts?.total ?? 0, color: 'text-gray-600 dark:text-gray-400' },
                                { label: 'This Month', value: analytics?.contacts?.newThisMonth ?? 0, color: 'text-green-600 dark:text-green-400' },
                            ]}
                            recentItems={analytics?.contacts?.recentContacts?.map(contact => ({
                                id: contact.id,
                                title: contact.name,
                                subtitle: contact.email
                            })) ?? []}
                            action={{ label: 'View Contacts', onClick: () => navigate('/contacts') }}
                            loading={isLoading}
                            compact={isMobile}
                            isCollapsed={isWidgetCollapsed('contacts')}
                            onToggleCollapse={() => toggleWidgetCollapse('contacts')}
                        />
                    </ResponsiveCardRail>

                    {/* Revenue Trends Chart */}
                    <Card className="bg-muted/10 mb-8">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                Booked and Collected Revenue
                            </CardTitle>
                            <CardDescription>
                                {periodLabels[period]} · shown separately by currency
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <RevenueTrendsChart data={revenueData} isLoading={revenueLoading} />
                        </CardContent>
                    </Card>

                    {/* Pipeline funnel and current deal age */}
                    <div className="grid gap-6 md:grid-cols-2 mb-8">
                        {/* Pipeline Overview */}
                        <Card className="bg-muted/10">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Workflow className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        Pipeline Overview
                                    </CardTitle>
                                    <Button
                                        size="sm"
                                        onClick={() => navigate('/pipelines')}
                                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs whitespace-nowrap font-light"
                                    >
                                        View Details <ArrowRight className="h-3 w-3 ml-1" />
                                    </Button>
                                </div>
                                <CardDescription>Active deals by stage</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <PipelineFunnel
                                    funnel={analytics?.deals?.funnel ?? []}
                                    isLoading={isLoading}
                                />
                            </CardContent>
                        </Card>

                        {/* Current open-deal age */}
                        <Card className="bg-muted/10">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                            Open Deal Age
                                        </CardTitle>
                                        <CardDescription>
                                            {pipelineDealAge?.pipeline?.name ?? 'Default Pipeline'} · age since deal creation
                                        </CardDescription>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => navigate('/pipelines')}
                                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs whitespace-nowrap font-light"
                                    >
                                        View Details <ArrowRight className="h-3 w-3 ml-1" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <PipelineDealAgeCard
                                    dealAge={pipelineDealAge}
                                    isLoading={isLoadingPipelineDealAge}
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Recent Activity */}
                    <Card className="bg-muted/10 mb-8">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    Recent Activity
                                </CardTitle>
                                <Button
                                    size="sm"
                                    onClick={() => navigate('/contacts')}
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs whitespace-nowrap font-light"
                                >
                                    View Details <ArrowRight className="h-3 w-3 ml-1" />
                                </Button>
                            </div>
                            <CardDescription>Latest updates across all modules</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ActivityTimeline
                                activities={analytics?.recentActivity?.map(transformApiActivityToDesignSystem) ?? []}
                                isLoading={isLoading}
                                empty={{
                                    title: 'No activity yet',
                                    description: 'Activity will appear here as you use Itemize'
                                }}
                            />
                        </CardContent>
                    </Card>

                    {/* Performance analytics: swipeable rail on mobile, grid on desktop */}
                    <ResponsiveCardRail
                        label="Performance analytics"
                        desktopColumns="md:grid-cols-2 md:gap-6"
                        mobileCardClassName="flex-[0_0_92%]"
                        className="mb-8"
                    >
                        {/* Conversion Rates */}
                        <Card className="bg-muted/10 h-full flex flex-col">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        Conversion Rates
                                    </CardTitle>
                                    <span className="text-xs text-muted-foreground">{periodLabels[period]}</span>
                                </div>
                                <CardDescription>Closed-deal and form conversion</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col">
                                <div className="flex flex-col gap-3 h-full">
                                    <div className="grid grid-cols-2 gap-3 flex-1">
                                    <ConversionRateCard
                                        title="Deal Win Rate"
                                        rate={conversionData?.dealWinRate?.rate ?? 0}
                                        numerator={conversionData?.dealWinRate?.won ?? 0}
                                        denominator={conversionData?.dealWinRate?.totalClosed ?? 0}
                                        icon={TrendingUp}
                                        color="text-green-600 dark:text-green-400"
                                        isLoading={conversionLoading}
                                    />
                                    <ConversionRateCard
                                        title="Form to Contact"
                                        rate={conversionData?.formToContact?.rate ?? 0}
                                        numerator={conversionData?.formToContact?.converted ?? 0}
                                        denominator={conversionData?.formToContact?.submissions ?? 0}
                                        icon={CheckSquare}
                                        color="text-blue-600 dark:text-blue-400"
                                        isLoading={conversionLoading}
                                    />
                                    </div>
                                    <Card className="flex-1">
                                        <CardContent className="pt-6 h-full flex flex-col justify-between">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-2 rounded-full bg-muted text-green-600">
                                                        <DollarSign className="h-5 w-5" />
                                                    </div>
                                                    <span className="font-medium">Closed Deal Value</span>
                                                </div>
                                                <span className="text-sm text-muted-foreground">
                                                    {conversionData?.dealWinRate?.valuesByCurrency?.[0]
                                                        ? `${conversionData.dealWinRate.valuesByCurrency[0].currency} ${conversionData.dealWinRate.valuesByCurrency[0].wonValue.toLocaleString()}`
                                                        : '0'}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4 text-center">
                                                <div>
                                                    <div className="text-lg font-bold text-green-600">
                                                        {conversionData?.dealWinRate?.valuesByCurrency?.[0]?.wonValue.toLocaleString() ?? 0}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">Won</div>
                                                </div>
                                                <div>
                                                    <div className="text-lg font-bold text-green-600">
                                                        {conversionData?.dealWinRate?.valuesByCurrency?.[0]?.lostValue.toLocaleString() ?? 0}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">Lost</div>
                                                </div>
                                                <div>
                                                    <div className="text-lg font-bold text-green-600">
                                                        {conversionData?.dealWinRate?.totalClosed ?? 0}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">Closed</div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Communication Stats */}
                        <Card className="bg-muted/10 h-full flex flex-col">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        Communication
                                    </CardTitle>
                                    <span className="text-xs text-muted-foreground">{periodLabels[period]}</span>
                                </div>
                                <CardDescription>Email and SMS performance</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col">
                                <CommunicationStatsCard 
                                    stats={commStats} 
                                    isLoading={commLoading} 
                                />
                            </CardContent>
                        </Card>
                    </ResponsiveCardRail>

                    {/* Quick Actions */}
                    <div className="mb-8">
                        <h2 className="text-lg font-medium mb-4">Quick Actions</h2>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            {quickActions.map((action) => (
                                <Card
                                    key={action.title}
                                    className="cursor-pointer transition-all hover:shadow-md bg-muted/20 hover:border-blue-200 dark:hover:border-blue-800"
                                    onClick={() => action.action()}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                                                    <action.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-sm">{action.title}</CardTitle>
                                                    <CardDescription className="text-xs">{action.description}</CardDescription>
                                                </div>
                                            </div>
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </CardHeader>
                                </Card>
                            ))}
                        </div>
                    </div>

                    {/* Getting Started Tip */}
                    {!proTipDismissed && (
                        <Card className="bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-100 dark:border-blue-900">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                        <CardTitle className="text-base">Pro Tip: Automation</CardTitle>
                                    </div>
                                    <button
                                        onClick={() => setProTipDismissed(true)}
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                        aria-label="Dismiss"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    Set up automated workflows to send emails, create tasks, and update contacts when
                                    deals move through your pipeline. Visit the{' '}
                                    <button
                                        onClick={() => navigate('/automations')}
                                        className="text-blue-600 hover:underline"
                                    >
                                        Automations
                                    </button>{' '}
                                    page to get started.
                                </p>
                            </CardContent>
                        </Card>
                    )}
        </PageLayout>
    );
}

export default DashboardPage;
