import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    Target,
    Workflow,
    BarChart3,
    LayoutDashboard,
    Activity,
    Mail,
    Dumbbell,
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
import { RevenueFlowChart, RevenueFlowSeriesControls } from '@/components/payments/RevenueFlowChart';
import { RevenueFlowSizeControls } from '@/components/payments/RevenueFlowSizeControls';
import { useOrganization } from '@/hooks/useOrganization';
import { GetStartedCard } from '@/components/GetStartedCard';
import { ErrorState } from '@/components/ErrorState';
import { FailureNotice } from '@/components/FailureNotice';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { DashboardOverview } from './dashboard/components/DashboardOverview';
import { useDashboardSignalPins } from './dashboard/hooks/useDashboardSignalPins';
import { buildDashboardSignals } from './dashboard/signals/dashboardSignalCatalog';
import { useRevenueFlowPreferences } from '@/hooks/useRevenueFlowPreferences';

interface QuickAction {
    title: string;
    icon: LucideIcon;
    action: () => void;
}

const DASHBOARD_PERIODS: PeriodOption[] = ['7days', '30days', '90days'];
const DASHBOARD_CARD_ACTION_CLASS = ['shrink-0 whitespace-nowrap text-xs font-light', 'text-blue-600 hover:bg-blue-50/50 hover:text-blue-700', 'dark:text-blue-400 dark:hover:bg-blue-900/20 dark:hover:text-blue-300'].join(' ');

export function DashboardPage() {
    const { currentUser } = useAuthState();

    // Pro tip dismiss state
    const [proTipDismissed, setProTipDismissed] = useState(false);

    const navigate = useNavigate();
    const { organizationId, error: organizationError } = useOrganization();

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
        analyticsError,
        conversionsError,
        communicationsError,
        pipelineDealAgeError,
        revenueError,
        refetchAll,
    } = useDashboardData({ organizationId, period });

    const recentActivities = analytics?.recentActivity?.map(transformApiActivityToDesignSystem) ?? [];
    const latestActivityGroupLabel = getLatestActivityGroupLabel(recentActivities);

    const dashboardSignals = useMemo(() => buildDashboardSignals({
        analytics,
        conversions: conversionData,
        communications: commStats,
        pipelineDealAge,
        revenue: revenueData,
        loading: {
            analytics: isLoading,
            conversions: conversionLoading,
            communications: commLoading,
            pipelineDealAge: isLoadingPipelineDealAge,
            revenue: revenueLoading,
        },
        errors: {
            conversions: Boolean(conversionsError),
            communications: Boolean(communicationsError),
            pipelineDealAge: Boolean(pipelineDealAgeError),
            revenue: Boolean(revenueError),
        },
    }), [
        analytics,
        commLoading,
        commStats,
        communicationsError,
        conversionData,
        conversionLoading,
        conversionsError,
        isLoading,
        isLoadingPipelineDealAge,
        pipelineDealAge,
        pipelineDealAgeError,
        revenueData,
        revenueError,
        revenueLoading,
    ]);
    const { pinnedSignalIds, savePinnedSignalIds } = useDashboardSignalPins({
        organizationId,
        userId: currentUser?.uid,
    });
    const revenueFlowPreferences = useRevenueFlowPreferences({
        organizationId,
        userId: currentUser?.uid,
        context: 'dashboard',
    });

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
            <SelectTrigger aria-label="Performance period" className={compact ? 'h-11 w-full bg-muted/20' : 'h-11 w-[140px] bg-muted/20'}>
                {compact ? <SelectValue placeholder="Select period" /> : <span className="whitespace-nowrap">{periodLabels[period]}</span>}
            </SelectTrigger>
            <SelectContent>
                {DASHBOARD_PERIODS.map((value) => (
                    <SelectItem key={value} value={value}>
                        {periodLabels[value]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );

    if (organizationError) {
        return (
            <PageLayout title="DASHBOARD" icon={<LayoutDashboard className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}>
                <OrganizationErrorState title="Unable to load dashboard" icon={LayoutDashboard} />
            </PageLayout>
        );
    }

    if (analyticsError && !analytics) {
        return (
            <PageLayout title="DASHBOARD" icon={<LayoutDashboard className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}>
                <ErrorState
                    kind="page"
                    title="Unable to load dashboard"
                    description="We couldn't load your overview. Try again."
                    icon={LayoutDashboard}
                    onAction={refetchAll}
                />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="DASHBOARD"
            icon={<LayoutDashboard className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
            headerTools={{
                filters: (
                    <HeaderFilters
                        label="Performance period"
                        compactLabel={period.replace('days', 'd')}
                        compactChildren={periodSelect(true)}
                        preferExpanded
                    >
                        {periodSelect()}
                    </HeaderFilters>
                ),
                secondaryAction: <HeaderAction prominence="secondary" label="Canvas" onClick={() => navigate('/canvas')} icon={<Map className="h-4 w-4" />} />,
            }}
        >
            {/* Welcome Section */}
            <div className="mb-8 min-[1000px]:flex min-[1000px]:items-center min-[1000px]:justify-between min-[1000px]:gap-6">
                <h2 className="mb-2 text-2xl font-light tracking-tight min-[1000px]:mb-0">
                    Welcome back, <span className="font-medium">{firstName}</span>
                </h2>
                <p className="text-muted-foreground min-[1000px]:shrink-0 min-[1000px]:text-right">Here's a look at your performance</p>
            </div>

            <GetStartedCard />

            {analyticsError && analytics ? (
                <FailureNotice
                    title="Dashboard data may be out of date"
                    description="Your last loaded overview is still visible."
                    onRetry={refetchAll}
                    className="mb-8"
                />
            ) : null}

            <DashboardOverview
                signals={dashboardSignals}
                pinnedSignalIds={pinnedSignalIds}
                onSavePinnedSignalIds={savePinnedSignalIds}
                onNavigate={navigate}
            />

            {/* Revenue flow */}
            <Card className="revenue-flow-card mb-8">
                <CardHeader className="revenue-flow-card-header flex flex-row items-center justify-between gap-3 space-y-0">
                    <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        Revenue flow
                    </CardTitle>
                    <RevenueFlowSeriesControls
                        visibleSeries={revenueFlowPreferences.visibleSeries}
                        onVisibleSeriesChange={revenueFlowPreferences.setVisibleSeries}
                        variant="direct"
                        className="revenue-flow-series-header min-w-0 shrink-0"
                    />
                    <div className="flex shrink-0 items-center gap-2">
                        <RevenueFlowSizeControls
                            size={revenueFlowPreferences.size}
                            onSizeChange={revenueFlowPreferences.setSize}
                        />
                        <Button size="sm" variant="ghost" onClick={() => navigate('/invoices/payments')} className={DASHBOARD_CARD_ACTION_CLASS} aria-label="View payment revenue flow details">
                            <span className="revenue-flow-view-label">View details</span>
                            <ArrowRight className="h-3 w-3" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent surface="inset" className="p-0">
                    {revenueError && !revenueData ? (
                        <ErrorState
                            kind="inline"
                            title="Revenue data unavailable"
                            description="We couldn't load revenue flow. Try again."
                            onAction={refetchAll}
                        />
                    ) : (
                        <div className="space-y-4">
                            {revenueError ? (
                                <FailureNotice title="Revenue data may be out of date" onRetry={refetchAll} />
                            ) : null}
                            <RevenueFlowChart
                                data={revenueData}
                                isLoading={revenueLoading}
                                context="dashboard"
                                size={revenueFlowPreferences.size}
                                visibleSeries={revenueFlowPreferences.visibleSeries}
                                onVisibleSeriesChange={revenueFlowPreferences.setVisibleSeries}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Performance */}
            <Card className="mb-8" data-dashboard-section="performance">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Dumbbell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        Performance
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6 lg:grid-cols-2">
                    {/* Pipeline info */}
                    <Card surface="inset" className="flex flex-col">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="min-w-0">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Workflow className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        Pipeline info
                                    </CardTitle>
                                    <p className="ml-6 mt-1 text-xs text-muted-foreground">Default pipeline</p>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => navigate('/pipelines')} className={DASHBOARD_CARD_ACTION_CLASS} aria-label="View pipeline info details" data-dashboard-detail-action>
                                    <span data-dashboard-detail-label>
                                        View
                                        <span className="hidden min-[1048px]:inline"> Details</span>
                                    </span>
                                    <ArrowRight className="ml-1 h-3 w-3" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <PipelineFunnel funnel={analytics?.deals?.funnel ?? []} isLoading={isLoading} />
                        </CardContent>
                    </Card>

                    {/* Current open-deal age */}
                    <Card surface="inset">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="min-w-0">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        Open Deal Age
                                    </CardTitle>
                                    <p className="ml-6 mt-1 text-xs text-muted-foreground">Default pipeline</p>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => navigate('/pipelines')} className={DASHBOARD_CARD_ACTION_CLASS} aria-label="View open deal age details" data-dashboard-detail-action>
                                    <span data-dashboard-detail-label>
                                        View
                                        <span className="hidden min-[1048px]:inline"> Details</span>
                                    </span>
                                    <ArrowRight className="ml-1 h-3 w-3" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {pipelineDealAgeError ? (
                                <ErrorState
                                    kind="inline"
                                    title="Deal age unavailable"
                                    description="We couldn't load open deal age. Try again."
                                    onAction={refetchAll}
                                />
                            ) : (
                                <PipelineDealAgeCard dealAge={pipelineDealAge} isLoading={isLoadingPipelineDealAge} />
                            )}
                        </CardContent>
                    </Card>
                </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="mb-8">
                <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                        <CardTitle className="flex shrink-0 items-center gap-2 text-base">
                            <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            Recent Activity
                        </CardTitle>
                        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
                            <span className="min-w-0 flex-1 text-right text-sm leading-5 text-muted-foreground">
                                Latest updates:
                                {latestActivityGroupLabel ? ` ${latestActivityGroupLabel}` : ''}
                            </span>
                            <Button size="sm" variant="ghost" onClick={() => navigate('/contacts')} className={DASHBOARD_CARD_ACTION_CLASS} aria-label="View recent activity details" data-dashboard-detail-action>
                                <span data-dashboard-detail-label>
                                    View
                                    <span className="hidden min-[1048px]:inline"> Details</span>
                                </span>
                                <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent surface="inset" className="p-0">
                    <ActivityTimeline
                        activities={recentActivities}
                        isLoading={isLoading}
                        hideFirstGroupHeading
                        empty={{
                            title: 'No activity yet',
                            description: 'Activity will appear here as you use Itemize',
                        }}
                    />
                </CardContent>
            </Card>

            {/* Performance analytics: swipeable rail on mobile, grid on desktop */}
            <ResponsiveCardRail label="Performance analytics" desktopColumns="md:grid-cols-1 md:gap-6 xl:grid-cols-2" mobileCardClassName="flex-[0_0_92%]" className="dashboard-performance-analytics mb-8">
                {/* Conversion Rates */}
                <Card className="h-full flex flex-col">
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
                        {conversionsError ? (
                            <ErrorState
                                kind="inline"
                                title="Conversion rates unavailable"
                                description="We couldn't load conversion rates. Try again."
                                onAction={refetchAll}
                            />
                        ) : (
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
                            <Card surface="inset" className="flex-1">
                                <CardContent className="pt-6 h-full flex flex-col justify-between">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 rounded-full bg-muted text-blue-600 dark:text-blue-400" data-dashboard-analytics-icon>
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
                                            <div className="text-lg font-bold text-green-600 dark:text-green-400">{conversionData?.dealWinRate?.valuesByCurrency?.[0]?.wonValue.toLocaleString() ?? 0}</div>
                                            <div className="text-xs text-muted-foreground">Won</div>
                                        </div>
                                        <div>
                                            <div className="text-lg font-bold text-red-600 dark:text-red-400">{conversionData?.dealWinRate?.valuesByCurrency?.[0]?.lostValue.toLocaleString() ?? 0}</div>
                                            <div className="text-xs text-muted-foreground">Lost</div>
                                        </div>
                                        <div>
                                            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{conversionData?.dealWinRate?.totalClosed ?? 0}</div>
                                            <div className="text-xs text-muted-foreground">Closed</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                        )}
                    </CardContent>
                </Card>

                {/* Communication Stats */}
                <Card className="h-full flex flex-col">
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
                        {communicationsError ? (
                            <ErrorState
                                kind="inline"
                                title="Communication data unavailable"
                                description="We couldn't load communication performance. Try again."
                                onAction={refetchAll}
                            />
                        ) : (
                            <CommunicationStatsCard stats={commStats} isLoading={commLoading} />
                        )}
                    </CardContent>
                </Card>
            </ResponsiveCardRail>

            {/* Quick Actions */}
            <div className="mb-8">
                <h2 className="text-lg font-medium mb-4">Quick Actions</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {quickActions.map((action) => (
                        <Card surface="inset" interactive key={action.title} className="group">
                            <button type="button" className="w-full rounded-lg text-left focus-visible:outline-none" onClick={action.action} aria-label={action.title}>
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
                                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-blue-600 group-focus-within:text-blue-600 dark:group-hover:text-blue-400 dark:group-focus-within:text-blue-400" />
                                    </div>
                                </CardHeader>
                            </button>
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
                                    <button type="button" onClick={() => navigate('/automations')} className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300">
                                        Automations
                                    </button>
                                    .
                                </p>
                            </div>
                            <button type="button" onClick={() => setProTipDismissed(true)} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground" aria-label="Dismiss">
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
