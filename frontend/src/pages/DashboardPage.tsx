import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAuthState } from '@/contexts/AuthContext';
import { useHeader } from '@/contexts/HeaderContext';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
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
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
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
    ArrowUpRight,
    ArrowDownRight,
} from 'lucide-react';
import { useDashboardData } from './dashboard/hooks/useDashboardData';
import { usePeriodSelector, periodLabels, type PeriodOption } from './dashboard/hooks/usePeriodSelector';
import { PipelineFunnel } from './dashboard/components/PipelineFunnel';
import { ConversionRateCard } from './dashboard/components/ConversionRateCard';
import { CommunicationStatsCard } from './dashboard/components/CommunicationStatsCard';
import { PipelineVelocityCard } from './dashboard/components/PipelineVelocityCard';
import { RecentActivityList } from './dashboard/components/RecentActivityList';
import { RevenueTrendsChart } from './dashboard/components/RevenueTrendsChart';
import { useOrganization } from '@/hooks/useOrganization';

interface QuickAction {
    title: string;
    description: string;
    icon: LucideIcon;
    action: () => void;
    primary?: boolean;
}

export function DashboardPage() {
    const { currentUser } = useAuthState();
    const navigate = useNavigate();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();
    const { organizationId } = useOrganization();
    
    // Onboarding
    const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('dashboard');
    
    // Period selector hook
    const { period, setPeriod } = usePeriodSelector('30days');

    // Fetch all dashboard data with custom hook
    const {
        analytics,
        conversions: conversionData,
        communications: commStats,
        velocity: velocityData,
        revenue: revenueData,
        isLoadingAnalytics: isLoading,
        isLoadingConversions: conversionLoading,
        isLoadingCommunications: commLoading,
        isLoadingVelocity: velocityLoading,
        isLoadingRevenue: revenueLoading,
    } = useDashboardData({ organizationId, period });


    // Set header content following workspace pattern
    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <LayoutDashboard className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className={`text-xl font-semibold italic truncate font-raleway ${theme === 'dark' ? 'text-white' : 'text-black'}`}
                    >
                        DASHBOARD
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    {/* Date Range Selector */}
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
                        Go to Canvas
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, navigate, setHeaderContent, period]);

    const firstName = currentUser?.name?.split(' ')[0] || 'there';

    const quickActions: QuickAction[] = [
        {
            title: 'Manage Contacts',
            description: 'View and manage your CRM contacts',
            icon: Users,
            action: () => navigate('/contacts'),
            primary: true,
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
        <>
            {/* Onboarding Modal */}
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={closeOnboarding}
                onComplete={completeOnboarding}
                onDismiss={dismissOnboarding}
                content={ONBOARDING_CONTENT.dashboard}
            />

            {/* Mobile Controls Bar */}
            <MobileControlsBar>
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
                    Go to Canvas
                </Button>
            </MobileControlsBar>
            
            <PageContainer>
                <PageSurface>
                    {/* Welcome Section */}
                    <div className="mb-8">
                        <h2 className="text-2xl font-light tracking-tight mb-2">
                            Welcome back, <span className="font-medium">{firstName}</span>
                        </h2>
                        <p className="text-muted-foreground">
                            Here's an overview of your CRM performance
                        </p>
                    </div>

                    {/* CRM Stats Grid */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
                        <StatCard
                            title="Total Contacts"
                            badgeText="Total Contacts"
                            value={analytics?.contacts?.total ?? 0}
                            icon={Users}
                            description={analytics?.contacts?.newThisWeek ? `+${analytics.contacts.newThisWeek} this week` : undefined}
                            colorTheme="blue"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Open Deals"
                            badgeText="Open Deals"
                            value={analytics?.deals?.open ?? 0}
                            icon={TrendingUp}
                            description={`$${(analytics?.deals?.openValue ?? 0).toLocaleString()} in pipeline`}
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
                            title="Revenue Won"
                            badgeText="Revenue Won"
                            value={`$${(analytics?.deals?.wonThisMonth ?? 0).toLocaleString()}`}
                            icon={DollarSign}
                            description="This month"
                            colorTheme="green"
                            isLoading={isLoading}
                        />
                    </div>

                    {/* Secondary Stats Row */}
                    <div className="grid gap-4 md:grid-cols-3 mb-8">
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
                            title="Active Leads"
                            badgeText="Active"
                            value={analytics?.contacts?.leads ?? 0}
                            icon={Users}
                            description={`${analytics?.contacts?.customers ?? 0} customers`}
                            colorTheme="orange"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Deals Won"
                            badgeText="Won"
                            value={analytics?.deals?.won ?? 0}
                            icon={CheckSquare}
                            description={`$${(analytics?.deals?.wonValue ?? 0).toLocaleString()} total`}
                            colorTheme="green"
                            isLoading={isLoading}
                        />
                    </div>

                    {/* Revenue Trends Chart */}
                    <Card className="bg-muted/10 mb-8">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4 text-blue-600" />
                                        Revenue Trends
                                    </CardTitle>
                                    <CardDescription>
                                        {periodLabels[period]} - Total: ${(revenueData?.summary?.totalRevenue ?? 0).toLocaleString()}
                                    </CardDescription>
                                </div>
                                {revenueData?.summary && (
                                    <div className="text-right">
                                        <div className="flex items-center gap-1 text-sm">
                                            {(revenueData.summary.growthRate ?? 0) >= 0 ? (
                                                <ArrowUpRight className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <ArrowDownRight className="h-4 w-4 text-red-500" />
                                            )}
                                            <span className={(revenueData.summary.growthRate ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}>
                                                {(revenueData.summary.growthRate ?? 0) > 0 ? '+' : ''}{revenueData.summary.growthRate ?? 0}%
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {revenueData.summary.totalDeals ?? 0} deals closed
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <RevenueTrendsChart data={revenueData} isLoading={revenueLoading} />
                        </CardContent>
                    </Card>

                    {/* Pipeline Funnel & Pipeline Velocity */}
                    <div className="grid gap-6 md:grid-cols-2 mb-8">
                        {/* Pipeline Overview */}
                        <Card className="bg-muted/10">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Workflow className="h-4 w-4 text-blue-600" />
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

                        {/* Pipeline Velocity */}
                        <Card className="bg-muted/10">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <BarChart3 className="h-4 w-4 text-blue-600" />
                                            Pipeline Velocity
                                        </CardTitle>
                                        <CardDescription>
                                            {velocityData?.pipeline?.name ?? 'Default Pipeline'} - Deal flow analysis
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
                                <PipelineVelocityCard 
                                    velocity={velocityData} 
                                    isLoading={velocityLoading} 
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Recent Activity */}
                    <Card className="bg-muted/10 mb-8">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-blue-600" />
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
                            <CardDescription>Latest updates across your CRM</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <RecentActivityList
                                activities={analytics?.recentActivity ?? []}
                                isLoading={isLoading}
                            />
                        </CardContent>
                    </Card>

                    {/* Conversion Rates & Communication Stats */}
                    <div className="grid gap-6 md:grid-cols-2 mb-8">
                        {/* Conversion Rates */}
                        <Card className="bg-muted/10">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Target className="h-4 w-4 text-blue-600" />
                                        Conversion Rates
                                    </CardTitle>
                                    <span className="text-xs text-muted-foreground">{periodLabels[period]}</span>
                                </div>
                                <CardDescription>Key conversion metrics</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 gap-3">
                                    <ConversionRateCard
                                        title="Lead → Customer"
                                        rate={conversionData?.conversions?.leadToCustomer?.rate ?? 0}
                                        numerator={conversionData?.conversions?.leadToCustomer?.customers ?? 0}
                                        denominator={conversionData?.conversions?.leadToCustomer?.total ?? 0}
                                        icon={Users}
                                        color="text-gray-600"
                                        isLoading={conversionLoading}
                                    />
                                    <ConversionRateCard
                                        title="Deal Win Rate"
                                        rate={conversionData?.conversions?.dealWinRate?.rate ?? 0}
                                        numerator={conversionData?.conversions?.dealWinRate?.won ?? 0}
                                        denominator={conversionData?.conversions?.dealWinRate?.totalClosed ?? 0}
                                        icon={TrendingUp}
                                        color="text-green-600"
                                        isLoading={conversionLoading}
                                    />
                                    <ConversionRateCard
                                        title="Form → Contact"
                                        rate={conversionData?.conversions?.formToContact?.rate ?? 0}
                                        numerator={conversionData?.conversions?.formToContact?.converted ?? 0}
                                        denominator={conversionData?.conversions?.formToContact?.submissions ?? 0}
                                        icon={CheckSquare}
                                        color="text-purple-600"
                                        isLoading={conversionLoading}
                                    />
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="flex items-center justify-between">
                                                <div className="p-2 rounded-full bg-muted text-green-600">
                                                    <DollarSign className="h-5 w-5" />
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-2xl font-bold">
                                                        ${(conversionData?.conversions?.dealWinRate?.wonValue ?? 0).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-2">
                                                <p className="text-sm font-medium">Won Value</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Lost: ${(conversionData?.conversions?.dealWinRate?.lostValue ?? 0).toLocaleString()}
                                                </p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Communication Stats */}
                        <Card className="bg-muted/10">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Mail className="h-4 w-4 text-blue-600" />
                                        Communication
                                    </CardTitle>
                                    <span className="text-xs text-muted-foreground">{periodLabels[period]}</span>
                                </div>
                                <CardDescription>Email and SMS performance</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <CommunicationStatsCard 
                                    stats={commStats} 
                                    isLoading={commLoading} 
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Quick Actions */}
                    <div className="mb-8">
                        <h3 className="text-lg font-medium mb-4">Quick Actions</h3>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            {quickActions.map((action) => (
                                <Card
                                    key={action.title}
                                    className={`cursor-pointer transition-all hover:shadow-md ${action.primary
                                            ? 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20'
                                            : 'bg-muted/20'
                                        }`}
                                    onClick={() => action.action()}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${action.primary ? 'bg-blue-100 dark:bg-blue-900' : 'bg-muted'}`}>
                                                    <action.icon className={`h-4 w-4 ${action.primary ? 'text-blue-600' : 'text-muted-foreground'}`} />
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
                    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-100 dark:border-blue-900">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-blue-600" />
                                <CardTitle className="text-base">Pro Tip: Automation</CardTitle>
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
                </PageSurface>
            </PageContainer>
        </>
    );
}

export default DashboardPage;