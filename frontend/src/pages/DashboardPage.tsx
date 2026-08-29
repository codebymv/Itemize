import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { HeaderAction, HeaderFilters } from '@/components/layout/DesktopHeaderTools';
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
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { ActivityTimeline, getLatestActivityGroupLabel } from '@/components/activity-timeline';
import { transformApiActivityToDesignSystem } from '@/design-system/utils/transform-api-activity';
import { RevenueFlowChart } from '@/components/payments/RevenueFlowChart';
import { useOrganization } from '@/hooks/useOrganization';
import { InvoicesWidget, SignaturesWidget, WorkspaceWidget, ContactsWidget } from '@/design-system/widgets';
import { GetStartedCard } from '@/components/GetStartedCard';
import { getInvoiceStatusVisual } from './invoices/constants/invoiceConstants';
import { getSignatureStatusVisual } from './signatures/constants/signatureConstants';

interface QuickAction {
    title: string;
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

    const recentActivities = analytics?.recentActivity?.map(transformApiActivityToDesignSystem) ?? [];
    const latestActivityGroupLabel = getLatestActivityGroupLabel(recentActivities);

    const firstName = currentUser?.name?.split(' ')[0] || 'there';

    const quickActions: QuickAction[] = [
        {
            title: 'Manage Contacts',
            icon: Users,
            action: () => navigate('/contacts'),
        },
        {
            title: 'View Pipelines',
            icon: TrendingUp,
            action: () => navigate('/pipelines'),
        },
        {
            title: 'View Bookings',
            icon: Calendar,
            action: () => navigate('/bookings'),
        },
        {
            title: 'Open Workspace',
            icon: Map,
            action: () => navigate('/canvas'),
        },
    ];

    const periodSelect = (compact = false) => (
        <Select value={period} onValueChange={(value) => setPeriod(value as PeriodOption)}>
            <SelectTrigger
                className={compact
                    ? 'h-11 w-full bg-muted/20'
                    : 'h-11 w-[140px] bg-muted/20'}
            >
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
    );

    return (
        <PageLayout
            title="DASHBOARD"
            icon={<LayoutDashboard className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
            desktopTools={{
                filters: (
                    <HeaderFilters
                        label="Filter dashboard period"
                        compactChildren={periodSelect(true)}
                        preferExpanded
                    >
                        {periodSelect()}
                    </HeaderFilters>
                ),
                primaryAction: (
                    <HeaderAction
                        label="Canvas"
                        onClick={() => navigate('/canvas')}
                        icon={<Map className="h-4 w-4" />}
                    />
                ),
            }}
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
                    <div className="mb-8 min-[1000px]:flex min-[1000px]:items-center min-[1000px]:justify-between min-[1000px]:gap-6">
                        <h2 className="mb-2 text-2xl font-light tracking-tight min-[1000px]:mb-0">
                            Welcome back, <span className="font-medium">{firstName}</span>
                        </h2>
                        <p className="text-muted-foreground min-[1000px]:shrink-0 min-[1000px]:text-right">
                            Here's an overview of your performance
                        </p>
                    </div>

                    <GetStartedCard />

                    {/* CRM Stats: swipeable rail on mobile, grid on desktop */}
                    <ResponsiveCardRail
                        label="CRM overview"
                        desktopColumns="md:grid-cols-2 lg:grid-cols-4"
                        className="dashboard-stat-summary mb-8"
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
                        className="dashboard-stat-summary mb-8"
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
                        className="dashboard-module-summaries mb-8"
                    >
                        <InvoicesWidget
                            primaryStat={analytics?.invoiceMetrics?.pending ?? 0}
                            primaryStatColor="text-blue-600 dark:text-blue-400"
                            secondaryStats={[
                                { label: 'Overdue', value: analytics?.invoiceMetrics?.overdue ?? 0, color: getInvoiceStatusVisual('overdue').iconClass },
                                { label: 'Paid This Month', value: `$${(analytics?.invoiceMetrics?.paidThisMonth ?? 0).toLocaleString()}`, color: 'text-green-600 dark:text-green-400' },
                            ]}
                            recentItems={analytics?.invoiceMetrics?.recentInvoices?.map(inv => {
                                const visual = getInvoiceStatusVisual(inv.status);
                                return {
                                    id: inv.id,
                                    title: inv.number,
                                    subtitle: `$${inv.amount.toLocaleString()}`,
                                    status: { label: visual.label, color: visual.iconClass },
                                };
                            }) ?? []}
                            action={{ label: 'View Invoices', compactLabel: 'View', onClick: () => navigate('/invoices') }}
                            loading={isLoading}
                            compact={isMobile}
                            isCollapsed={isWidgetCollapsed('invoices')}
                            onToggleCollapse={() => toggleWidgetCollapse('invoices')}
                        />
                        <SignaturesWidget
                            primaryStat={analytics?.signatureMetrics?.awaiting ?? 0}
                            primaryStatColor={getSignatureStatusVisual('in_progress').iconClass}
                            secondaryStats={[
                                { label: 'Signed This Week', value: analytics?.signatureMetrics?.signedThisWeek ?? 0, color: 'text-green-600 dark:text-green-400' },
                                { label: 'Total Documents', value: analytics?.signatureMetrics?.total ?? 0, color: 'text-blue-600 dark:text-blue-400' },
                            ]}
                            recentItems={analytics?.signatureMetrics?.recentDocuments?.map(sig => {
                                const normalizedStatus = sig.status === 'signed' ? 'completed' : sig.status;
                                const visual = getSignatureStatusVisual(normalizedStatus);
                                return {
                                    id: sig.id,
                                    title: sig.title,
                                    status: { label: sig.status === 'signed' ? 'Signed' : visual.label, color: visual.iconClass },
                                };
                            }) ?? []}
                            action={{ label: 'View Documents', compactLabel: 'View', onClick: () => navigate('/documents') }}
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
                            action={{ label: 'Open Workspace', compactLabel: 'View', onClick: () => navigate('/canvas') }}
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
                            action={{ label: 'View Contacts', compactLabel: 'View', onClick: () => navigate('/contacts') }}
                            loading={isLoading}
                            compact={isMobile}
                            isCollapsed={isWidgetCollapsed('contacts')}
                            onToggleCollapse={() => toggleWidgetCollapse('contacts')}
                        />
                    </ResponsiveCardRail>

                    {/* Revenue flow */}
                    <Card className="bg-muted/10 mb-8">
                        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                            <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                Revenue flow
                            </CardTitle>
                            <Button
                                size="sm"
                                onClick={() => navigate('/invoices/payments')}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs whitespace-nowrap font-light"
                                aria-label="View payment revenue flow details"
                            >
                                View payments
                                <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <RevenueFlowChart data={revenueData} isLoading={revenueLoading} compact />
                        </CardContent>
                    </Card>

                    {/* Pipeline funnel and current deal age */}
                    <div className="mb-8 grid gap-6 md:grid-cols-2">
                        {/* Pipeline Overview */}
                        <Card className="flex flex-col bg-muted/10">
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
                                        aria-label="View pipeline overview details"
                                        data-dashboard-detail-action
                                    >
                                        <span data-dashboard-detail-label>
                                            View<span className="hidden min-[1048px]:inline"> Details</span>
                                        </span>
                                        <ArrowRight className="ml-1 h-3 w-3" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1">
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
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => navigate('/pipelines')}
                                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs whitespace-nowrap font-light"
                                        aria-label="View open deal age details"
                                        data-dashboard-detail-action
                                    >
                                        <span data-dashboard-detail-label>
                                            View<span className="hidden min-[1048px]:inline"> Details</span>
                                        </span>
                                        <ArrowRight className="ml-1 h-3 w-3" />
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
                            <div className="flex items-center justify-between gap-3">
                                <CardTitle className="flex shrink-0 items-center gap-2 text-base">
                                    <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    Recent Activity
                                </CardTitle>
                                <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
                                    <span className="min-w-0 flex-1 text-right text-sm leading-5 text-muted-foreground">
                                        latest updates:{latestActivityGroupLabel ? ` ${latestActivityGroupLabel}` : ''}
                                    </span>
                                    <Button
                                        size="sm"
                                        onClick={() => navigate('/contacts')}
                                        className="shrink-0 bg-blue-600 text-xs font-light text-white hover:bg-blue-700"
                                        aria-label="View recent activity details"
                                        data-dashboard-detail-action
                                    >
                                        <span data-dashboard-detail-label>
                                            View<span className="hidden min-[1048px]:inline"> Details</span>
                                        </span>
                                        <ArrowRight className="ml-1 h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <ActivityTimeline
                                activities={recentActivities}
                                isLoading={isLoading}
                                hideFirstGroupHeading
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
                        desktopColumns="md:grid-cols-1 md:gap-6 min-[951px]:grid-cols-2"
                        mobileCardClassName="flex-[0_0_92%]"
                        className="dashboard-performance-analytics mb-8"
                    >
                        {/* Conversion Rates */}
                        <Card className="bg-muted/10 h-full flex flex-col">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        <span className="min-[1048px]:hidden">Rates</span>
                                        <span className="hidden min-[1048px]:inline">Conversion Rates</span>
                                    </CardTitle>
                                    <span className="text-xs text-muted-foreground">{periodLabels[period]}</span>
                                </div>
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
                                                    <div
                                                        className="p-2 rounded-full bg-muted text-blue-600 dark:text-blue-400"
                                                        data-dashboard-analytics-icon
                                                    >
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
                                                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                                                        {conversionData?.dealWinRate?.valuesByCurrency?.[0]?.wonValue.toLocaleString() ?? 0}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">Won</div>
                                                </div>
                                                <div>
                                                    <div className="text-lg font-bold text-red-600 dark:text-red-400">
                                                        {conversionData?.dealWinRate?.valuesByCurrency?.[0]?.lostValue.toLocaleString() ?? 0}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">Lost</div>
                                                </div>
                                                <div>
                                                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
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
                                        <span className="min-[1048px]:hidden">Comms</span>
                                        <span className="hidden min-[1048px]:inline">Communication</span>
                                    </CardTitle>
                                    <span className="text-xs text-muted-foreground">{periodLabels[period]}</span>
                                </div>
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
                                <div className="flex items-start gap-3">
                                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                                        <div className="flex shrink-0 items-center gap-2">
                                            <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                            <CardTitle className="text-base">Pro Tip: Automation</CardTitle>
                                        </div>
                                        <p className="min-w-0 basis-[max-content] grow text-sm text-muted-foreground">
                                            Automate emails, tasks, and contact updates in{' '}
                                            <button
                                                onClick={() => navigate('/automations')}
                                                className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                            >
                                                Automations
                                            </button>.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setProTipDismissed(true)}
                                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                                        aria-label="Dismiss"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </CardHeader>
                        </Card>
                    )}
        </PageLayout>
    );
}

export default DashboardPage;
