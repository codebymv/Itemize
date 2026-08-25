import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Plug } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { PageLayout } from '@/components/layout/PageLayout';
import { ErrorState } from '@/components/ErrorState';
import { IntegrationProviderMark } from '@/components/brand/IntegrationProviderMark';
import { SettingsSectionTitle } from '@/components/settings/SettingsPrimitives';
import {
    getCalendarConnections,
    disconnectCalendar,
    syncCalendar,
    initiateGoogleAuth,
    type CalendarConnection,
} from '@/services/calendarIntegrationsApi';
import { disconnectChannel, getChannels, getFacebookConnectUrl } from '@/services/socialApi';
import { getPaymentSettings } from '@/services/invoicesApi';
import { disconnectStripeConnect, initiateStripeConnect } from '@/services/stripeConnectApi';
import {
    INTEGRATIONS_PATH,
    integrationOAuthToast,
    readIntegrationOAuthResult,
} from '@/lib/integrationOAuthReturn';
import { IntegrationStatusRow } from '@/components/integrations/IntegrationStatusRow';

export function CalendarIntegrationsPage({ embedded = false }: { embedded?: boolean }) {
    const { toast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();

    const [connections, setConnections] = useState<CalendarConnection[]>([]);
    const [facebookChannel, setFacebookChannel] = useState<{ id: number; name: string } | null>(null);
    const [stripeConnected, setStripeConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [syncing, setSyncing] = useState<number | null>(null);
    const [connecting, setConnecting] = useState<'google' | 'facebook' | 'stripe' | null>(null);

    const handleConnectGoogle = useCallback(async () => {
        if (!organizationId) return;
        setConnecting('google');
        try {
            const { authUrl } = await initiateGoogleAuth(organizationId, INTEGRATIONS_PATH);
            window.location.href = authUrl;
        } catch {
            toast({ title: 'Error', description: 'Failed to start Google Calendar connection', variant: 'destructive' });
            setConnecting(null);
        }
    }, [organizationId, toast]);

    const handleConnectFacebook = useCallback(async () => {
        if (!organizationId) return;
        setConnecting('facebook');
        try {
            const { auth_url } = await getFacebookConnectUrl(organizationId);
            window.location.href = auth_url;
        } catch {
            toast({ title: 'Error', description: 'Failed to start Facebook connection', variant: 'destructive' });
            setConnecting(null);
        }
    }, [organizationId, toast]);

    const handleConnectStripe = useCallback(async () => {
        if (!organizationId) return;
        setConnecting('stripe');
        try {
            const { authUrl } = await initiateStripeConnect(organizationId, INTEGRATIONS_PATH);
            window.location.href = authUrl;
        } catch {
            toast({ title: 'Error', description: 'Failed to start Stripe connection', variant: 'destructive' });
            setConnecting(null);
        }
    }, [organizationId, toast]);

    const fetchStatus = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const [calendarRes, channelsRes, paymentRes] = await Promise.all([
                getCalendarConnections(organizationId),
                getChannels({}, organizationId).catch(() => []),
                getPaymentSettings(organizationId).catch(() => ({ stripe_connected: false })),
            ]);
            setConnections(calendarRes || []);
            const channels = Array.isArray(channelsRes) ? channelsRes : [];
            const facebook = channels.find((channel) => channel.channel_type === 'facebook' && channel.is_active);
            setFacebookChannel(facebook ? { id: facebook.id, name: facebook.name } : null);
            setStripeConnected(Boolean(paymentRes?.stripe_connected));
        } catch {
            toast({ title: 'Error', description: 'Failed to load integrations', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, toast]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    useEffect(() => {
        const result = readIntegrationOAuthResult(location.search);
        if (!result) return;
        toast(integrationOAuthToast(result));
        window.history.replaceState({}, document.title, location.pathname);
        if (result.ok) {
            void fetchStatus();
        }
    }, [fetchStatus, location.pathname, location.search, toast]);

    useEffect(() => {
        if (!organizationId && initError) {
            setLoading(false);
        }
    }, [organizationId, initError]);

    const handleSync = async (id: number) => {
        if (!organizationId) return;
        setSyncing(id);
        try {
            await syncCalendar(id, organizationId);
            toast({ title: 'Sync queued', description: 'Calendar sync will continue in the background.' });
            fetchStatus();
        } catch {
            toast({ title: 'Error', description: 'Sync failed', variant: 'destructive' });
        } finally {
            setSyncing(null);
        }
    };

    const handleDisconnect = async (id: number) => {
        if (!organizationId) return;
        try {
            await disconnectCalendar(id, organizationId);
            setConnections((prev) => prev.filter((connection) => connection.id !== id));
            toast({ title: 'Disconnected', description: 'Calendar disconnected successfully' });
        } catch {
            toast({ title: 'Error', description: 'Failed to disconnect', variant: 'destructive' });
        }
    };

    const handleDisconnectFacebook = async () => {
        if (!organizationId || !facebookChannel) return;
        try {
            await disconnectChannel(facebookChannel.id, organizationId);
            setFacebookChannel(null);
            toast({ title: 'Disconnected', description: 'Facebook disconnected successfully' });
        } catch {
            toast({ title: 'Error', description: 'Failed to disconnect Facebook', variant: 'destructive' });
        }
    };

    const handleDisconnectStripe = async () => {
        if (!organizationId) return;
        try {
            await disconnectStripeConnect(organizationId);
            setStripeConnected(false);
            toast({ title: 'Disconnected', description: 'Stripe is no longer connected for invoice payments.' });
        } catch {
            toast({ title: 'Error', description: 'Failed to disconnect Stripe', variant: 'destructive' });
        }
    };

    const googleConnection = connections.find((connection) => connection.provider === 'google' && connection.is_active);

    const formatLastSync = (value: string | null) => {
        if (!value) return 'Not synced yet';
        return `Last synced ${new Date(value).toLocaleString()}`;
    };

    if (initError) {
        const errorState = (
            <ErrorState
                title="Unable to load integrations"
                description={initError}
                onAction={() => void fetchStatus()}
            />
        );
        if (embedded) return errorState;
        return (
            <PageLayout
                title="INTEGRATIONS"
                icon={<Plug className="h-5 w-5 text-blue-600 flex-shrink-0" />}
            >
                {errorState}
            </PageLayout>
        );
    }

    const content = (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader>
                    <SettingsSectionTitle icon={Plug}>Connections</SettingsSectionTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="divide-y rounded-lg border">
                            {[0, 1, 2, 3, 4].map((index) => (
                                <div key={index} className="flex items-center gap-3 p-4">
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-full max-w-sm" />
                                    </div>
                                    <Skeleton className="h-9 w-20" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="divide-y rounded-lg border">
                            <IntegrationStatusRow
                                name="Google Calendar"
                                description="Sync availability and bookings with Google Calendar."
                                status={googleConnection ? 'connected' : 'disconnected'}
                                detail={googleConnection?.provider_email || undefined}
                                icon={<IntegrationProviderMark provider="google-calendar" />}
                                primaryLabel={googleConnection ? 'Add account' : 'Connect'}
                                onPrimary={() => void handleConnectGoogle()}
                                busy={connecting === 'google'}
                            />
                            <IntegrationStatusRow
                                name="Facebook"
                                description="Bring Page messages into the Itemize inbox."
                                status={facebookChannel ? 'connected' : 'disconnected'}
                                detail={facebookChannel?.name || undefined}
                                icon={<IntegrationProviderMark provider="facebook" />}
                                primaryLabel={facebookChannel ? 'Reconnect' : 'Connect'}
                                secondaryLabel="Inbox"
                                onPrimary={() => void handleConnectFacebook()}
                                onSecondary={() => navigate('/social')}
                                onDisconnect={facebookChannel ? () => void handleDisconnectFacebook() : undefined}
                                busy={connecting === 'facebook'}
                            />
                            <IntegrationStatusRow
                                name="Stripe"
                                description="Accept card payments on invoices to your Stripe account."
                                status={stripeConnected ? 'connected' : 'disconnected'}
                                icon={<IntegrationProviderMark provider="stripe" />}
                                primaryLabel={stripeConnected ? 'Reconnect' : 'Connect'}
                                secondaryLabel="Payments"
                                onPrimary={() => void handleConnectStripe()}
                                onSecondary={() => navigate('/payment-settings')}
                                onDisconnect={stripeConnected ? () => void handleDisconnectStripe() : undefined}
                                busy={connecting === 'stripe'}
                            />
                            <IntegrationStatusRow
                                name="Webhooks"
                                description="Send events to other tools from automations."
                                status="available"
                                icon={<IntegrationProviderMark provider="webhooks" />}
                                primaryLabel="Open automations"
                                onPrimary={() => navigate('/automations')}
                            />
                            <IntegrationStatusRow
                                name="Outlook Calendar"
                                description="Sync Outlook calendars for bookings."
                                status="soon"
                                icon={<IntegrationProviderMark provider="outlook-calendar" />}
                                primaryLabel="Coming soon"
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            {!loading && connections.length > 0 ? (
                <Card>
                    <CardHeader>
                        <SettingsSectionTitle icon={CalendarDays}>Calendar accounts</SettingsSectionTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="divide-y rounded-lg border">
                            {connections.map((connection) => (
                                <IntegrationStatusRow
                                    key={connection.id}
                                    name={connection.provider_email || 'Calendar account'}
                                    description={`${connection.provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'} · ${formatLastSync(connection.last_sync_at)}`}
                                    status={connection.is_active ? 'connected' : 'inactive'}
                                    detail={connection.error_message || undefined}
                                    icon={(
                                        <IntegrationProviderMark
                                            provider={connection.provider === 'outlook' ? 'outlook-calendar' : 'google-calendar'}
                                        />
                                    )}
                                    primaryLabel="Sync"
                                    primaryVariant="outline"
                                    onPrimary={() => void handleSync(connection.id)}
                                    onDisconnect={() => void handleDisconnect(connection.id)}
                                    busy={syncing === connection.id}
                                />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
    if (embedded) return <div className="space-y-6">{content}</div>;
    return (
        <PageLayout
            title="INTEGRATIONS"
            icon={<Plug className="h-5 w-5 text-blue-600 flex-shrink-0" />}
            surfaceClassName="space-y-6"
        >
            {content}
        </PageLayout>
    );
}

export default CalendarIntegrationsPage;
