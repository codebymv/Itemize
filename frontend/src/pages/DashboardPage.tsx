import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useQuery } from '@tanstack/react-query';
import { useAuthState } from '@/contexts/AuthContext';
import { useHeader } from '@/contexts/HeaderContext';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/StatCard';
import { Progress } from '@/components/ui/progress';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import {
    Users,
    TrendingUp,
    Calendar,
    CheckSquare,
    DollarSign,
    ArrowRight,
    ArrowUpRight,
    ArrowDownRight,
    Map,
    Sparkles,
    LucideIcon,
    Clock,
    AlertCircle,
    CalendarDays,
    Target,
    Mail,
    Phone,
    Workflow,
    BarChart3,
    PieChart,
    LayoutDashboard,
    Activity,
} from 'lucide-react';
import { 
    getDashboardAnalytics, 
    getConversionRates,
    getCommunicationStats,
    getPipelineVelocity,
    getRevenueTrends,
    type DashboardAnalytics,
    type ConversionRates,
    type CommunicationStats,
    type PipelineVelocity,
    type RevenueTrends,
} from '@/services/analyticsApi';

interface QuickAction {
    title: string;
    description: string;
    icon: LucideIcon;
    action: () => void;
    primary?: boolean;
}


function PipelineFunnel({ funnel, isLoading }: { funnel: DashboardAnalytics['deals']['funnel']; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                ))}
            </div>
        );
    }

    if (!funnel || funnel.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8">
                No pipeline data available
            </div>
        );
    }

    const maxCount = Math.max(...funnel.map(s => s.dealCount), 1);

    return (
        <div className="space-y-3">
            {funnel.map((stage) => (
                <div key={stage.stageId} className="flex items-center gap-3">
                    <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.stageColor }}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium truncate">{stage.stageName}</span>
                            <span className="text-sm text-muted-foreground">
                                {stage.dealCount} deal{stage.dealCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <Progress
                            value={(stage.dealCount / maxCount) * 100}
                            className="h-2"
                            style={{ '--progress-color': stage.stageColor } as React.CSSProperties}
                        />
                    </div>
                    <div className="text-sm font-medium w-20 text-right">
                        ${stage.totalValue.toLocaleString()}
                    </div>
                </div>
            ))}
        </div>
    );
}

function ConversionRateCard({ 
    title, 
    rate, 
    numerator, 
    denominator, 
    icon: Icon, 
    color = 'text-green-600',
    isLoading 
}: { 
    title: string;
    rate: number;
    numerator: number;
    denominator: number;
    icon: LucideIcon;
    color?: string;
    isLoading?: boolean;
}) {
    if (isLoading) {
        return (
            <div className="p-4 bg-muted/30 rounded-lg">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-20" />
            </div>
        );
    }

    return (
        <div className="p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-sm font-medium text-muted-foreground">{title}</span>
            </div>
            <div className="text-2xl font-bold">{rate}%</div>
            <div className="text-xs text-muted-foreground">
                {numerator} of {denominator}
            </div>
        </div>
    );
}

function CommunicationStatsCard({ stats, isLoading }: { stats?: CommunicationStats; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
            </div>
        );
    }

    if (!stats || !stats.email || !stats.sms) {
        return (
            <div className="text-center text-muted-foreground py-8">
                No communication data available
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Email Stats */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">Email</span>
                    <span className="text-sm text-muted-foreground ml-auto">{stats.email?.total ?? 0} total</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-lg font-bold text-gray-600">{stats.email?.rates?.delivery ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Delivered</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold text-green-600">{stats.email?.rates?.open ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Opened</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold text-purple-600">{stats.email?.rates?.click ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Clicked</div>
                    </div>
                </div>
            </div>

            {/* SMS Stats */}
            <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                    <Phone className="h-4 w-4 text-green-600" />
                    <span className="font-medium">SMS</span>
                    <span className="text-sm text-muted-foreground ml-auto">{stats.sms?.total ?? 0} total</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-lg font-bold text-green-600">{stats.sms?.rates?.delivery ?? 0}%</div>
                        <div className="text-xs text-muted-foreground">Delivered</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold">{stats.sms?.outbound ?? 0}</div>
                        <div className="text-xs text-muted-foreground">Outbound</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold">{stats.sms?.inbound ?? 0}</div>
                        <div className="text-xs text-muted-foreground">Inbound</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PipelineVelocityCard({ velocity, isLoading }: { velocity?: PipelineVelocity; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                ))}
            </div>
        );
    }

    if (!velocity?.velocity || velocity.velocity.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8">
                No pipeline data available
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {velocity.velocity.map((stage) => (
                <div key={stage.stageId} className="flex items-center gap-3">
                    <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.stageColor }}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium truncate">{stage.stageName}</span>
                            <div className="flex items-center gap-2">
                                {stage.isBottleneck && (
                                    <span className="text-xs bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 px-1.5 py-0.5 rounded">
                                        Bottleneck
                                    </span>
                                )}
                                <span className="text-sm text-muted-foreground">
                                    {stage.dealCount} deal{stage.dealCount !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Avg {stage.avgAgeDays} days</span>
                            <span>${stage.totalValue.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            ))}
            {velocity.summary && (
                <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-center">
                    <div>
                        <div className="text-lg font-bold text-green-600">{velocity.summary.avgDaysToWin}</div>
                        <div className="text-xs text-muted-foreground">Avg days to win</div>
                    </div>
                    <div>
                        <div className="text-lg font-bold">{velocity.summary.winRate}%</div>
                        <div className="text-xs text-muted-foreground">Win rate</div>
                    </div>
                </div>
            )}
        </div>
    );
}

function RecentActivityList({ activities, isLoading }: { activities: DashboardAnalytics['recentActivity']; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1">
                            <Skeleton className="h-4 w-full mb-1" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (!activities || activities.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8">
                No recent activity
            </div>
        );
    }

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'email': return '📧';
            case 'call': return '📞';
            case 'note': return '📝';
            case 'meeting': return '📅';
            case 'deal': return '💰';
            default: return '📌';
        }
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="space-y-3">
            {activities.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                    <div className="text-lg">{getActivityIcon(activity.type)}</div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(activity.createdAt)}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

// Period options for date range selector
type PeriodOption = '7days' | '30days' | '90days' | '6months' | '12months';
const periodLabels: Record<PeriodOption, string> = {
    '7days': 'Last 7 days',
    '30days': 'Last 30 days',
    '90days': 'Last 90 days',
    '6months': 'Last 6 months',
    '12months': 'Last 12 months',
};

// Revenue Trends Chart Component
function RevenueTrendsChart({ data, isLoading }: { data?: RevenueTrends; isLoading?: boolean }) {
    if (isLoading) {
        return (
            <div className="h-[200px] flex items-center justify-center">
                <Skeleton className="h-full w-full" />
            </div>
        );
    }

    if (!data?.data || data.data.length === 0) {
        return (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No revenue data available
            </div>
        );
    }

    // Determine if we're showing days or months based on period
    const isDayView = data.period === '30days';
    const isMonthView = data.period === '6months' || data.period === '12months';

    // Format date for display
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        if (isDayView) {
            // For day view: "Jan 26"
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (isMonthView) {
            // For month view: "Jan 2026"
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
        // Fallback: "Jan 26, 2026"
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Format date for tooltip (more detailed)
    const formatTooltipDate = (dateString: string) => {
        const date = new Date(dateString);
        if (isDayView) {
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
        } else {
            return date.toLocaleDateString('en-US', { 
                month: 'long', 
                year: 'numeric' 
            });
        }
    };

    // Prepare chart data with formatted labels
    const chartData = data.data.map(item => ({
        ...item,
        formattedPeriod: formatDate(item.period)
    }));

    const chartConfig = {
        revenue: {
            label: 'Revenue',
            color: 'hsl(142, 76%, 36%)',
        },
    };

    return (
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                    dataKey="formattedPeriod" 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    angle={isDayView ? -45 : 0}
                    textAnchor={isDayView ? 'end' : 'middle'}
                    height={isDayView ? 60 : 30}
                />
                <YAxis 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <ChartTooltip 
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const dataPoint = payload[0].payload as typeof chartData[0];
                            return (
                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="grid gap-2">
                                        <div className="flex flex-col">
                                            <span className="text-[0.70rem] text-muted-foreground">
                                                {formatTooltipDate(dataPoint.period)}
                                            </span>
                                            <span className="font-bold text-foreground">
                                                ${Number(payload[0].value).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }}
                />
                <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(142, 76%, 36%)"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                />
            </AreaChart>
        </ChartContainer>
    );
}

export function DashboardPage() {
    const { currentUser } = useAuthState();
    const navigate = useNavigate();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();
    
    // Onboarding
    const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('dashboard');
    
    // Date range state
    const [period, setPeriod] = useState<PeriodOption>('30days');

    // Fetch analytics data
    const { data: analytics, isLoading, error } = useQuery({
        queryKey: ['dashboardAnalytics'],
        queryFn: () => getDashboardAnalytics(),
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false,
    });

    // Fetch conversion rates with dynamic period
    const { data: conversionData, isLoading: conversionLoading } = useQuery({
        queryKey: ['conversionRates', period],
        queryFn: () => getConversionRates(period as any),
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });

    // Fetch communication stats with dynamic period
    const { data: commStats, isLoading: commLoading } = useQuery({
        queryKey: ['communicationStats', period],
        queryFn: () => getCommunicationStats(period as any),
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });

    // Fetch pipeline velocity
    const { data: velocityData, isLoading: velocityLoading } = useQuery({
        queryKey: ['pipelineVelocity'],
        queryFn: () => getPipelineVelocity(),
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });

    // Fetch revenue trends with dynamic period
    const { data: revenueData, isLoading: revenueLoading } = useQuery({
        queryKey: ['revenueTrends', period],
        queryFn: () => getRevenueTrends(period as any),
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });

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

                    {/* Pipeline Funnel & Recent Activity */}
                    <div className="grid gap-6 md:grid-cols-2 mb-8">
                        {/* Pipeline Funnel */}
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

                        {/* Recent Activity */}
                        <Card className="bg-muted/10">
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
                    </div>

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
                                    <div className="p-4 bg-muted/30 rounded-lg">
                                        <div className="flex items-center gap-2 mb-2">
                                            <DollarSign className="h-4 w-4 text-green-600" />
                                            <span className="text-sm font-medium text-muted-foreground">Won Value</span>
                                        </div>
                                        <div className="text-2xl font-bold">
                                            ${(conversionData?.conversions?.dealWinRate?.wonValue ?? 0).toLocaleString()}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            Lost: ${(conversionData?.conversions?.dealWinRate?.lostValue ?? 0).toLocaleString()}
                                        </div>
                                    </div>
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

                    {/* Pipeline Velocity */}
                    <Card className="bg-muted/10 mb-8">
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