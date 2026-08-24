import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Link2, Plus, RefreshCw, Trash2, MoreHorizontal, CheckCircle, XCircle, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
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
import { IntegrationStatusCard } from './IntegrationStatusCard';

const GoogleLogo = () => (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

export function CalendarIntegrationsPage() {
    const { toast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const {
        showModal: showOnboarding,
        handleComplete: handleOnboardingComplete,
        handleDismiss: handleOnboardingDismiss,
        handleClose: handleOnboardingClose,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

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

    if (initError) {
        return (
            <PageLayout
                title="INTEGRATIONS"
                icon={<Plug className="h-5 w-5 text-blue-600 flex-shrink-0" />}
            >
                <ErrorState
                    title="Unable to load integrations"
                    description={initError}
                    onAction={() => void fetchStatus()}
                />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="INTEGRATIONS"
            icon={<Plug className="h-5 w-5 text-blue-600 flex-shrink-0" />}
            surfaceClassName="space-y-6"
        >
                    <div>
                        <h2 className="text-lg font-medium text-foreground">Connected tools</h2>
                        <p className="text-sm text-muted-foreground">
                            Connect calendars, payments, and inbox accounts from one place.
                        </p>
                    </div>

                    {loading ? (
                        <div className="space-y-3">
                            {[0, 1, 2].map((index) => <Skeleton key={index} className="h-28" />)}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <IntegrationStatusCard
                                name="Google Calendar"
                                description="Sync availability and bookings with Google Calendar."
                                status={googleConnection ? 'connected' : 'disconnected'}
                                detail={googleConnection?.provider_email || undefined}
                                icon={<GoogleLogo />}
                                primaryLabel={googleConnection ? 'Reconnect' : 'Connect'}
                                onPrimary={() => void handleConnectGoogle()}
                                onDisconnect={googleConnection ? () => void handleDisconnect(googleConnection.id) : undefined}
                                busy={connecting === 'google'}
                            />
                            <IntegrationStatusCard
                                name="Facebook"
                                description="Bring Page messages into the Itemize inbox."
                                status={facebookChannel ? 'connected' : 'disconnected'}
                                detail={facebookChannel?.name || undefined}
                                icon={<span className="text-blue-600 font-bold text-lg">f</span>}
                                primaryLabel={facebookChannel ? 'Reconnect' : 'Connect'}
                                secondaryLabel="Inbox"
                                onPrimary={() => void handleConnectFacebook()}
                                onSecondary={() => navigate('/social')}
                                onDisconnect={facebookChannel ? () => void handleDisconnectFacebook() : undefined}
                                busy={connecting === 'facebook'}
                            />
                            <IntegrationStatusCard
                                name="Stripe"
                                description="Accept card payments on invoices to your Stripe account."
                                status={stripeConnected ? 'connected' : 'disconnected'}
                                icon={<span className="text-[#635BFF] font-bold text-lg">S</span>}
                                primaryLabel={stripeConnected ? 'Reconnect' : 'Connect'}
                                secondaryLabel="Payments"
                                onPrimary={() => void handleConnectStripe()}
                                onSecondary={() => navigate('/payment-settings')}
                                onDisconnect={stripeConnected ? () => void handleDisconnectStripe() : undefined}
                                busy={connecting === 'stripe'}
                            />
                            <IntegrationStatusCard
                                name="Webhooks"
                                description="Send events to other tools from automations."
                                status="available"
                                icon={<Link2 className="h-5 w-5 text-muted-foreground" />}
                                primaryLabel="Open automations"
                                onPrimary={() => navigate('/automations')}
                            />
                            <IntegrationStatusCard
                                name="Outlook Calendar"
                                description="Sync Outlook calendars for bookings."
                                status="soon"
                                icon={<Link2 className="h-5 w-5 text-[#0078D4]" />}
                                primaryLabel="Coming soon"
                            />
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Calendar connections</CardTitle>
                            <CardDescription>Sync external calendars to manage availability and bookings</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="space-y-4">
                                    {[0, 1].map((index) => <Skeleton key={index} className="h-20" />)}
                                </div>
                            ) : connections.length === 0 ? (
                                <EmptyState
                                    icon={Link2}
                                    title="No calendars connected"
                                    description="Connect Google Calendar to sync availability"
                                    actionLabel="Connect Google Calendar"
                                    onAction={() => { void handleConnectGoogle(); }}
                                    className="p-8"
                                />
                            ) : (
                                <div className="space-y-4">
                                    {connections.map((connection) => (
                                        <div key={connection.id} className="flex items-center justify-between p-4 border rounded-lg gap-3">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                                                    <GoogleLogo />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{connection.provider_email}</p>
                                                    <p className="text-sm text-muted-foreground capitalize">{connection.provider}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <Badge variant={connection.is_active ? 'default' : 'secondary'}>
                                                    {connection.is_active ? (
                                                        <><CheckCircle className="h-3 w-3 mr-1" />Active</>
                                                    ) : (
                                                        <><XCircle className="h-3 w-3 mr-1" />Inactive</>
                                                    )}
                                                </Badge>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => void handleSync(connection.id)}
                                                    disabled={syncing === connection.id}
                                                >
                                                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing === connection.id ? 'animate-spin' : ''}`} />
                                                    Sync
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => void handleDisconnect(connection.id)} className="text-destructive focus:text-destructive">
                                                            <Trash2 className="h-4 w-4 mr-2" />Disconnect
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

            {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
                <OnboardingModal
                    isOpen={showOnboarding}
                    onClose={handleOnboardingClose}
                    onComplete={handleOnboardingComplete}
                    onDismiss={handleOnboardingDismiss}
                    content={ONBOARDING_CONTENT[onboardingFeatureKey]}
                />
            )}
        </PageLayout>
    );
}

export default CalendarIntegrationsPage;
