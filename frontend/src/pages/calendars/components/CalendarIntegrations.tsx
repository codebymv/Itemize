/**
 * Calendar Integrations Component
 * Displays connected external calendars and allows connecting new ones
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
    RefreshCw,
    Trash2,
    CheckCircle,
    AlertCircle,
    Calendar as CalendarIcon,
    Loader2,
} from 'lucide-react';
import {
    getCalendarConnections,
    getGoogleAuthUrl,
    disconnectCalendar,
    updateCalendarConnection,
    syncCalendar,
    type CalendarConnection,
} from '@/services/calendarIntegrationsApi';

// Google logo SVG
const GoogleLogo = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
        />
        <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
        />
        <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
        />
        <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
        />
    </svg>
);

// Outlook logo SVG
const OutlookLogo = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path
            fill="#0078D4"
            d="M24 7.387v10.478c0 .23-.08.424-.238.576-.16.154-.352.23-.576.23h-8.547v-6.959l1.6 1.229c.102.086.221.127.357.127.14 0 .26-.041.358-.127l6.766-5.178c.156.134.23.337.23.616v8.293c0 .23-.076.424-.228.576a.78.78 0 01-.576.23H14.64v-3.508h6.77V7.44l-8.547 6.545-8.547-6.545v5.733h6.77v3.508H2.538a.78.78 0 01-.576-.23.778.778 0 01-.228-.576v-8.98l.51-.51 9.619 7.365 9.618-7.365.52.51V5.86c0-.259-.086-.475-.256-.648a.878.878 0 00-.647-.257H0V3.11c0-.23.076-.424.228-.576.153-.154.346-.23.576-.23h22.638c.23 0 .424.076.576.23.152.152.228.345.228.575v4.278z"
        />
    </svg>
);

interface CalendarIntegrationsProps {
    organizationId: number;
}

export function CalendarIntegrations({ organizationId }: CalendarIntegrationsProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [disconnectingId, setDisconnectingId] = useState<number | null>(null);
    const [syncingId, setSyncingId] = useState<number | null>(null);

    // Fetch connections
    const { data: connections, isLoading } = useQuery({
        queryKey: ['calendarConnections', organizationId],
        queryFn: () => getCalendarConnections(organizationId),
        staleTime: 1000 * 60 * 5,
    });

    // Connect Google mutation
    const connectGoogleMutation = useMutation({
        mutationFn: () => getGoogleAuthUrl('/calendars', organizationId),
        onSuccess: (data) => {
            // Redirect to Google OAuth
            window.location.href = data.authUrl;
        },
        onError: () => {
            toast({
                title: 'Error',
                description: 'Failed to initiate Google connection',
                variant: 'destructive',
            });
        },
    });

    // Disconnect mutation
    const disconnectMutation = useMutation({
        mutationFn: (connectionId: number) => disconnectCalendar(connectionId, organizationId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calendarConnections'] });
            toast({
                title: 'Disconnected',
                description: 'Calendar disconnected successfully',
            });
            setDisconnectingId(null);
        },
        onError: () => {
            toast({
                title: 'Error',
                description: 'Failed to disconnect calendar',
                variant: 'destructive',
            });
            setDisconnectingId(null);
        },
    });

    // Toggle sync mutation
    const toggleSyncMutation = useMutation({
        mutationFn: ({ connectionId, enabled }: { connectionId: number; enabled: boolean }) =>
            updateCalendarConnection(connectionId, { sync_enabled: enabled }, organizationId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calendarConnections'] });
        },
    });

    // Sync now mutation
    const syncNowMutation = useMutation({
        mutationFn: (connectionId: number) => syncCalendar(connectionId, organizationId),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['calendarConnections'] });
            toast({
                title: 'Sync Complete',
                description: `Created: ${data.results.created}, Updated: ${data.results.updated}${data.results.failed > 0 ? `, Failed: ${data.results.failed}` : ''
                    }`,
            });
            setSyncingId(null);
        },
        onError: () => {
            toast({
                title: 'Sync Failed',
                description: 'Failed to sync calendar',
                variant: 'destructive',
            });
            setSyncingId(null);
        },
    });

    const handleSyncNow = async (connectionId: number) => {
        setSyncingId(connectionId);
        syncNowMutation.mutate(connectionId);
    };

    const formatLastSync = (dateStr: string | null) => {
        if (!dateStr) return 'Never';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const getProviderLogo = (provider: string) => {
        switch (provider) {
            case 'google':
                return <GoogleLogo />;
            case 'outlook':
                return <OutlookLogo />;
            default:
                return <CalendarIcon className="h-5 w-5" />;
        }
    };

    const getProviderName = (provider: string) => {
        switch (provider) {
            case 'google':
                return 'Google Calendar';
            case 'outlook':
                return 'Outlook Calendar';
            default:
                return provider;
        }
    };

    // Check for google_connected query param (after OAuth redirect)
    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('google_connected') === 'true') {
            toast({
                title: 'Google Calendar Connected',
                description: 'Your Google Calendar is now linked',
            });
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            queryClient.invalidateQueries({ queryKey: ['calendarConnections'] });
        } else if (urlParams.get('error')) {
            toast({
                title: 'Connection Failed',
                description: 'Failed to connect Google Calendar',
                variant: 'destructive',
            });
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle className="text-base">Calendar Integrations</CardTitle>
                <CardDescription>
                    Connect external calendars to sync your bookings
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Connected calendars */}
                        {connections && connections.length > 0 && (
                            <div className="space-y-3">
                                {connections.map((connection) => (
                                    <div
                                        key={connection.id}
                                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/20"
                                    >
                                        <div className="flex items-center gap-3">
                                            {getProviderLogo(connection.provider)}
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">
                                                        {getProviderName(connection.provider)}
                                                    </span>
                                                    {connection.is_active ? (
                                                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            Connected
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                                                            <AlertCircle className="h-3 w-3 mr-1" />
                                                            Error
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {connection.provider_email}
                                                    <span className="mx-2">•</span>
                                                    Last sync: {formatLastSync(connection.last_sync_at)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-2 mr-2">
                                                <span className="text-xs text-muted-foreground">Sync</span>
                                                <Switch
                                                    checked={connection.sync_enabled}
                                                    onCheckedChange={(enabled) =>
                                                        toggleSyncMutation.mutate({
                                                            connectionId: connection.id,
                                                            enabled,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleSyncNow(connection.id)}
                                                disabled={syncingId === connection.id || !connection.sync_enabled}
                                            >
                                                {syncingId === connection.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="h-4 w-4" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setDisconnectingId(connection.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Connect buttons */}
                        <div className="flex flex-wrap gap-3 pt-2">
                            {!connections?.some((c) => c.provider === 'google') && (
                                <Button
                                    variant="outline"
                                    onClick={() => connectGoogleMutation.mutate()}
                                    disabled={connectGoogleMutation.isPending}
                                    className="gap-2"
                                >
                                    {connectGoogleMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <GoogleLogo />
                                    )}
                                    Connect Google Calendar
                                </Button>
                            )}
                            {/* Outlook coming soon */}
                            <Button variant="outline" disabled className="gap-2">
                                <OutlookLogo />
                                Connect Outlook
                                <Badge variant="secondary" className="ml-1 text-xs">
                                    Soon
                                </Badge>
                            </Button>
                        </div>

                        {connections && connections.length === 0 && (
                            <p className="text-sm text-muted-foreground mt-2">
                                Connect an external calendar to automatically sync your Itemize bookings.
                            </p>
                        )}
                    </div>
                )}

                {/* Disconnect confirmation dialog */}
                <AlertDialog open={disconnectingId !== null} onOpenChange={() => setDisconnectingId(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Disconnect Calendar?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will stop syncing your bookings with this calendar. Previously synced events will not be removed from the external calendar.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => disconnectingId && disconnectMutation.mutate(disconnectingId)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Disconnect
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}

export default CalendarIntegrations;
