import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { useHeader } from '@/contexts/HeaderContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ListChecks,
    StickyNote,
    Palette,
    ArrowRight,
    Sparkles,
    Users,
    TrendingUp,
    Map,
    LucideIcon,
} from 'lucide-react';

interface QuickAction {
    title: string;
    description: string;
    icon: LucideIcon;
    action: () => void;
    primary?: boolean;
    disabled?: boolean;
    badge?: string;
}

export function DashboardPage() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

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
                    {/* Go to Workspace Button */}
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

    // Get first name for greeting
    const firstName = currentUser?.name?.split(' ')[0] || 'there';

    // Placeholder stats - will be replaced with real data
    const stats = [
        {
            title: 'Lists',
            value: '—',
            icon: ListChecks,
            description: 'Active lists',
            color: 'text-blue-600'
        },
        {
            title: 'Notes',
            value: '—',
            icon: StickyNote,
            description: 'Saved notes',
            color: 'text-blue-600'
        },
        {
            title: 'Whiteboards',
            value: '—',
            icon: Palette,
            description: 'Canvas boards',
            color: 'text-blue-600'
        },
    ];

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
            title: 'Open Workspace',
            description: 'Continue organizing on your canvas',
            icon: Palette,
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
                            Here's an overview of your workspace
                        </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid gap-4 md:grid-cols-3 mb-8">
                        {stats.map((stat) => (
                            <Card key={stat.title} className="bg-muted/20">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">
                                        {stat.title}
                                    </CardTitle>
                                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{stat.value}</div>
                                    <p className="text-xs text-muted-foreground">
                                        {stat.description}
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Quick Actions */}
                    <div className="mb-8">
                        <h3 className="text-lg font-medium mb-4">Quick Actions</h3>
                        <div className="grid gap-4 md:grid-cols-2">
                            {quickActions.map((action) => (
                                <Card
                                    key={action.title}
                                    className={`cursor-pointer transition-all hover:shadow-md ${action.disabled ? 'opacity-60 cursor-not-allowed' : ''
                                        } ${action.primary ? 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20' : 'bg-muted/20'}`}
                                    onClick={() => !action.disabled && action.action()}
                                >
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${action.primary ? 'bg-blue-100 dark:bg-blue-900' : 'bg-muted'}`}>
                                                    <action.icon className={`h-5 w-5 ${action.primary ? 'text-blue-600' : 'text-muted-foreground'}`} />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-base">{action.title}</CardTitle>
                                                    <CardDescription>{action.description}</CardDescription>
                                                </div>
                                            </div>
                                            {action.badge ? (
                                                <span className="text-xs bg-muted px-2 py-1 rounded-full">{action.badge}</span>
                                            ) : (
                                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </CardHeader>
                                </Card>
                            ))}
                        </div>
                    </div>

                    {/* Getting Started / Tips */}
                    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-100 dark:border-blue-900">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-blue-600" />
                                <CardTitle className="text-base">Tip: Canvas Workspace</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Your workspace is an infinite canvas where you can organize lists, notes, and whiteboards
                                visually. Drag items around, group them by project, and share with your team.
                            </p>
                        </CardContent>
                    </Card>
                </CardContent>
            </Card>
        </div>
    );
}

export default DashboardPage;
