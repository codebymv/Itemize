import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useHeader } from '@/contexts/HeaderContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
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
} from 'lucide-react';
import { getDashboardAnalytics, type DashboardAnalytics } from '@/services/analyticsApi';

interface QuickAction {
    title: string;
    description: string;
    icon: LucideIcon;
    action: () => void;
    primary?: boolean;
}

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    description?: string;
    trend?: {
        value: number;
        label: string;
        positive?: boolean;
    };
    color?: string;
    isLoading?: boolean;
}

function StatCard({ title, value, icon: Icon, description, trend, color = 'text-blue-600', isLoading }: StatCardProps) {
    if (isLoading) {
        return (
            <Card className="bg-muted/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-8 w-16 mb-1" />
                    <Skeleton className="h-3 w-24" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-muted/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {trend && (
                    <div className="flex items-center gap-1 text-xs">
                        {trend.positive ? (
                            <ArrowUpRight className="h-3 w-3 text-green-500" />
                        ) : (
                            <ArrowDownRight className="h-3 w-3 text-red-500" />
                        )}
                        <span className={trend.positive ? 'text-green-500' : 'text-red-500'}>
                            {trend.value > 0 ? '+' : ''}{trend.value}
                        </span>
                        <span className="text-muted-foreground">{trend.label}</span>
                    </div>
                )}
                {description && !trend && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
            </CardContent>
        </Card>
    );
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

export function DashboardPage() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    // Fetch analytics data
    const { data: analytics, isLoading, error } = useQuery({
        queryKey: ['dashboardAnalytics'],
        queryFn: () => getDashboardAnalytics(),
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false,
    });

    // Set header content following workspace pattern
    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <h1
                    className="text-xl font-semibold italic truncate ml-2"
                    style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#374151' }}
                >
                    DASHBOARD
                </h1>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
                        onClick={() => navigate('/workspace')}
                    >
                        <Map className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Go to Workspace</span>
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, navigate, setHeaderContent]);

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
            action: () => navigate('/workspace'),
        },
    ];

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            {/* Main Content Card */}
            <Card>
                <CardContent className="p-6">
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
                            value={analytics?.contacts.total ?? 0}
                            icon={Users}
                            trend={analytics?.contacts.newThisWeek ? {
                                value: analytics.contacts.newThisWeek,
                                label: 'this week',
                                positive: true
                            } : undefined}
                            color="text-blue-600"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Open Deals"
                            value={analytics?.deals.open ?? 0}
                            icon={TrendingUp}
                            description={`$${(analytics?.deals.openValue ?? 0).toLocaleString()} in pipeline`}
                            color="text-purple-600"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Revenue Won"
                            value={`$${(analytics?.deals.wonThisMonth ?? 0).toLocaleString()}`}
                            icon={DollarSign}
                            description="This month"
                            color="text-green-600"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Upcoming Bookings"
                            value={analytics?.bookings.upcomingThisWeek ?? 0}
                            icon={CalendarDays}
                            description={`${analytics?.bookings.upcomingToday ?? 0} today`}
                            color="text-orange-600"
                            isLoading={isLoading}
                        />
                    </div>

                    {/* Secondary Stats Row */}
                    <div className="grid gap-4 md:grid-cols-3 mb-8">
                        <StatCard
                            title="Tasks Overdue"
                            value={analytics?.tasks.overdue ?? 0}
                            icon={AlertCircle}
                            description={`${analytics?.tasks.pending ?? 0} pending`}
                            color={analytics?.tasks.overdue && analytics.tasks.overdue > 0 ? 'text-red-600' : 'text-gray-600'}
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Deals Won"
                            value={analytics?.deals.won ?? 0}
                            icon={CheckSquare}
                            description={`$${(analytics?.deals.wonValue ?? 0).toLocaleString()} total`}
                            color="text-green-600"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title="Active Leads"
                            value={analytics?.contacts.leads ?? 0}
                            icon={Users}
                            description={`${analytics?.contacts.customers ?? 0} customers`}
                            color="text-blue-600"
                            isLoading={isLoading}
                        />
                    </div>

                    {/* Pipeline Funnel & Recent Activity */}
                    <div className="grid gap-6 md:grid-cols-2 mb-8">
                        {/* Pipeline Funnel */}
                        <Card className="bg-muted/10">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base">Pipeline Overview</CardTitle>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => navigate('/pipelines')}
                                        className="text-xs"
                                    >
                                        View All <ArrowRight className="h-3 w-3 ml-1" />
                                    </Button>
                                </div>
                                <CardDescription>Active deals by stage</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <PipelineFunnel
                                    funnel={analytics?.deals.funnel ?? []}
                                    isLoading={isLoading}
                                />
                            </CardContent>
                        </Card>

                        {/* Recent Activity */}
                        <Card className="bg-muted/10">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base">Recent Activity</CardTitle>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => navigate('/contacts')}
                                        className="text-xs"
                                    >
                                        View All <ArrowRight className="h-3 w-3 ml-1" />
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
                </CardContent>
            </Card>
        </div>
    );
}

export default DashboardPage;
