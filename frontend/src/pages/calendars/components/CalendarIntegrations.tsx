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
import { useNavigate } from 'react-router-dom';
import {
    RefreshCw,
    Trash2,
    CheckCircle,
    AlertCircle,
    Calendar as CalendarIcon,
    Loader2,
    AlertTriangle,
} from 'lucide-react';
import { IntegrationProviderMark } from '@/components/brand/IntegrationProviderMark';
import {
    getCalendarConnections,
    getGoogleAuthUrl,
    disconnectCalendar,
    updateCalendarConnection,
    syncCalendar,
    type CalendarConnection,
} from '@/services/calendarIntegrationsApi';

interface CalendarIntegrationsProps {
    organizationId: number;
}

export function CalendarIntegrations({ organizationId }: CalendarIntegrationsProps) {
    const { toast } = useToast();
    const navigate = useNavigate();
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
                title: data.created ? 'Sync Queued' : 'Sync Already Queued',
                description: 'Calendar sync will continue in the background.',
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
                return <IntegrationProviderMark provider="google-calendar" className="h-5 w-5" />;
            case 'outlook':
                return <IntegrationProviderMark provider="outlook-calendar" className="h-5 w-5" />;
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
    }, [queryClient, toast]);

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle className="text-base">Calendar Integrations</CardTitle>
                <CardDescription>
                    Connect external calendars to sync your bookings.{' '}
                    <button
                        type="button"
                        className="text-blue-600 hover:underline"
                        onClick={() => navigate('/settings/integrations')}
                    >
                        Manage all integrations
                    </button>
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
                                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
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
                                        <IntegrationProviderMark provider="google-calendar" className="h-5 w-5" />
                                    )}
                                    Connect Google Calendar
                                </Button>
                            )}
                            {/* Outlook coming soon */}
                            <Button variant="outline" disabled className="gap-2">
                                <IntegrationProviderMark provider="outlook-calendar" className="h-5 w-5" />
                                Connect Outlook
                                <Badge variant="secondary" className="ml-1 text-xs">
                                    Soon
                                </Badge>
                            </Button>
                        </div>

                        {connections && connections.length === 0 && (
                            <p className="text-sm text-muted-foreground mt-2">
                                Sync Itemize bookings with an external calendar.
                            </p>
                        )}
                    </div>
                )}

                {/* Disconnect confirmation dialog */}
                <AlertDialog open={disconnectingId !== null} onOpenChange={() => setDisconnectingId(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                                <AlertTriangle className="h-5 w-5 text-red-500" />
                                Disconnect Calendar?
                            </AlertDialogTitle>
                            <AlertDialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                                This will stop syncing your bookings with this calendar. Previously synced events will not be removed from the external calendar.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel style={{ fontFamily: '"Raleway", sans-serif' }}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => disconnectingId && disconnectMutation.mutate(disconnectingId)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                                style={{ fontFamily: '"Raleway", sans-serif' }}
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
