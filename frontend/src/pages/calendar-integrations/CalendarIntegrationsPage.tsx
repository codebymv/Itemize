import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Plug } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { useSubscriptionState } from '@/contexts/SubscriptionContext';
import { PageLayout } from '@/components/layout/PageLayout';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { IntegrationProviderMark } from '@/components/brand/IntegrationProviderMark';
import { SettingsPlanGate, SettingsSectionTitle } from '@/components/settings/SettingsPrimitives';
import {
    disconnectCalendar,
    syncCalendar,
    initiateGoogleAuth,
} from '@/services/calendarIntegrationsApi';
import { disconnectChannel, getFacebookConnectUrl } from '@/services/socialApi';
import { disconnectStripeConnect, initiateStripeConnect } from '@/services/stripeConnectApi';
import {
    getIntegrationOverviewViaGraphql,
    type IntegrationOverview,
} from '@/services/integrationOverviewGraphql';
import {
    INTEGRATIONS_PATH,
    integrationOAuthToast,
    readIntegrationOAuthResult,
} from '@/lib/integrationOAuthReturn';
import { IntegrationStatusRow } from '@/components/integrations/IntegrationStatusRow';
import { AVAILABLE_PLANS_PATH } from '@/lib/settingsNavigation';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';

export function CalendarIntegrationsPage({ embedded = false }: { embedded?: boolean }) {
    const { toast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const { isLoading: subscriptionLoading, isSubscribed } = useSubscriptionState();
    const queryClient = useQueryClient();

    const {
        organizationId,
        isLoading: organizationLoading,
        error: initError,
    } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [syncing, setSyncing] = useState<number | null>(null);
    const [connecting, setConnecting] = useState<'google' | 'facebook' | 'stripe' | null>(null);
    const overviewQueryKey = ['integration-overview', organizationId] as const;
    const overviewQuery = useQuery({
        queryKey: overviewQueryKey,
        queryFn: ({ signal }) => getIntegrationOverviewViaGraphql(
            organizationId as number,
            signal,
        ),
        enabled: organizationId !== null && !subscriptionLoading && isSubscribed,
        staleTime: QUERY_STALE_TIME_MS,
        retry: shouldRetryQuery,
    });
    const overview = overviewQuery.data;
    const connections = overview?.calendarConnections ?? [];
    const facebookChannel = overview?.facebookChannel ?? null;
    const stripeConnected = overview?.stripeConnected ?? false;
    const loading = subscriptionLoading
        || organizationLoading
        || (isSubscribed && overviewQuery.isPending);
    const loadError = Boolean(overviewQuery.error && !overviewQuery.data);

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

    useEffect(() => {
        const result = readIntegrationOAuthResult(location.search);
        if (!result) return;
        toast(integrationOAuthToast(result));
        window.history.replaceState({}, document.title, location.pathname);
    }, [location.pathname, location.search, toast]);

    const handleSync = async (id: number) => {
        if (!organizationId) return;
        setSyncing(id);
        try {
            await syncCalendar(id, organizationId);
            toast({ title: 'Sync queued', description: 'Calendar sync will continue in the background.' });
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
            queryClient.setQueryData<IntegrationOverview>(
                overviewQueryKey,
                (current) => current
                    ? {
                        ...current,
                        calendarConnections: current.calendarConnections.filter(
                            (connection) => connection.id !== id,
                        ),
                    }
                    : current,
            );
            toast({ title: 'Disconnected', description: 'Calendar disconnected successfully' });
        } catch {
            toast({ title: 'Error', description: 'Failed to disconnect', variant: 'destructive' });
        }
    };

    const handleDisconnectFacebook = async () => {
        if (!organizationId || !facebookChannel) return;
        try {
            await disconnectChannel(facebookChannel.id, organizationId);
            queryClient.setQueryData<IntegrationOverview>(
                overviewQueryKey,
                (current) => current
                    ? { ...current, facebookChannel: null, facebookStatusAvailable: true }
                    : current,
            );
            toast({ title: 'Disconnected', description: 'Facebook disconnected successfully' });
        } catch {
            toast({ title: 'Error', description: 'Failed to disconnect Facebook', variant: 'destructive' });
        }
    };

    const handleDisconnectStripe = async () => {
        if (!organizationId) return;
        try {
            await disconnectStripeConnect(organizationId);
            queryClient.setQueryData<IntegrationOverview>(
                overviewQueryKey,
                (current) => current
                    ? { ...current, stripeConnected: false, stripeStatusAvailable: true }
                    : current,
            );
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

    if (!subscriptionLoading && !isSubscribed) {
        const planGate = (
            <SettingsPlanGate
                title="Unlock integrations"
                description="Solo unlocks calendar, social, and payment connections."
                onViewPlans={() => navigate(AVAILABLE_PLANS_PATH)}
            />
        );

        if (embedded) return planGate;
        return (
            <PageLayout
                title="INTEGRATIONS"
                icon={<Plug className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
            >
                {planGate}
            </PageLayout>
        );
    }

    if (initError) {
        const errorState = (
            <OrganizationErrorState
                title="Unable to load integrations"
                icon={Plug}
                kind={embedded ? 'section' : 'page'}
            />
        );
        if (embedded) return errorState;
        return (
            <PageLayout
                title="INTEGRATIONS"
                icon={<Plug className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
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
                <CardContent surface="inset">
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
                    ) : loadError ? (
                        <ErrorState
                            kind="section"
                            icon={Plug}
                            title="Unable to load integrations"
                            description="We couldn't load your connection status. Try again."
                            onRetry={() => void overviewQuery.refetch()}
                        />
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
                                status={!overview?.facebookStatusAvailable
                                    ? 'unavailable'
                                    : facebookChannel ? 'connected' : 'disconnected'}
                                detail={facebookChannel?.name || undefined}
                                icon={<IntegrationProviderMark provider="facebook" />}
                                primaryLabel={!overview?.facebookStatusAvailable
                                    ? 'Retry'
                                    : facebookChannel ? 'Reconnect' : 'Connect'}
                                secondaryLabel="Inbox"
                                onPrimary={!overview?.facebookStatusAvailable
                                    ? () => void overviewQuery.refetch()
                                    : () => void handleConnectFacebook()}
                                onSecondary={() => navigate('/social')}
                                onDisconnect={facebookChannel ? () => void handleDisconnectFacebook() : undefined}
                                busy={connecting === 'facebook'}
                            />
                            <IntegrationStatusRow
                                name="Stripe"
                                description="Accept card payments on invoices to your Stripe account."
                                status={!overview?.stripeStatusAvailable
                                    ? 'unavailable'
                                    : stripeConnected ? 'connected' : 'disconnected'}
                                icon={<IntegrationProviderMark provider="stripe" />}
                                primaryLabel={!overview?.stripeStatusAvailable
                                    ? 'Retry'
                                    : stripeConnected ? 'Reconnect' : 'Connect'}
                                secondaryLabel="Payments"
                                onPrimary={!overview?.stripeStatusAvailable
                                    ? () => void overviewQuery.refetch()
                                    : () => void handleConnectStripe()}
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

            {!loading && !loadError && connections.length > 0 ? (
                <Card>
                    <CardHeader>
                        <SettingsSectionTitle icon={CalendarDays}>Calendar accounts</SettingsSectionTitle>
                    </CardHeader>
                    <CardContent surface="inset">
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
            icon={<Plug className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
            surfaceClassName="space-y-6"
        >
            {content}
        </PageLayout>
    );
}

export default CalendarIntegrationsPage;
