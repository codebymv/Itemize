import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plug } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
import { useSubscriptionState } from '@/contexts/SubscriptionContext';
import { PageLayout } from '@/components/layout/PageLayout';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { IntegrationProviderMark } from '@/components/brand/IntegrationProviderMark';
import {
  SettingsPlanGate,
  SettingsSectionTitle,
} from '@/components/settings/SettingsPrimitives';
import {
  disconnectCalendar,
  initiateGoogleAuth,
} from '@/services/calendarIntegrationsApi';
import { disconnectChannel, getFacebookConnectUrl } from '@/services/socialApi';
import {
  disconnectStripeConnect,
  initiateStripeConnect,
} from '@/services/stripeConnectApi';
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
import { CalendarAccountRow } from '@/components/integrations/CalendarAccountRow';
import { GleamIntegration } from '@/components/integrations/GleamIntegration';

export function CalendarIntegrationsPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading: subscriptionLoading, isSubscribed } =
    useSubscriptionState();
  const queryClient = useQueryClient();

  const {
    organizationId,
    isLoading: organizationLoading,
    error: initError,
  } = useOrganization({ onError: () => 'Failed to initialize.' });
  const [activeIntegrationAction, setActiveIntegrationAction] = useState<
    string | null
  >(null);
  const [expandedIntegration, setExpandedIntegration] = useState<string | null>(
    'gleam',
  );
  const { pending: integrationPending, run: runIntegration } =
    useSingleFlightAction();
  const connecting =
    integrationPending && activeIntegrationAction?.startsWith('connect-')
      ? (activeIntegrationAction.slice('connect-'.length) as
          'google' | 'facebook' | 'stripe')
      : null;
  const overviewQueryKey = ['integration-overview', organizationId] as const;
  const overviewQuery = useQuery({
    queryKey: overviewQueryKey,
    queryFn: ({ signal }) =>
      getIntegrationOverviewViaGraphql(organizationId as number, signal),
    enabled: organizationId !== null && !subscriptionLoading && isSubscribed,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const overview = overviewQuery.data;
  const connections = overview?.calendarConnections ?? [];
  const facebookChannel = overview?.facebookChannel ?? null;
  const stripeConnected = overview?.stripeConnected ?? false;
  const loading =
    subscriptionLoading ||
    organizationLoading ||
    (isSubscribed && overviewQuery.isPending);
  const loadError = Boolean(overviewQuery.error && !overviewQuery.data);

  const runIntegrationAction = useCallback(
    async (actionKey: string, action: () => Promise<void>) => {
      await runIntegration(async () => {
        setActiveIntegrationAction(actionKey);
        try {
          await action();
        } finally {
          setActiveIntegrationAction(null);
        }
      });
    },
    [runIntegration],
  );

  const handleConnectGoogle = useCallback(async () => {
    if (!organizationId) return;
    await runIntegrationAction('connect-google', async () => {
      try {
        const { authUrl } = await initiateGoogleAuth(
          organizationId,
          INTEGRATIONS_PATH,
        );
        window.location.href = authUrl;
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to start Google Calendar connection',
          variant: 'destructive',
        });
      }
    });
  }, [organizationId, runIntegrationAction, toast]);

  const handleConnectFacebook = useCallback(async () => {
    if (!organizationId) return;
    await runIntegrationAction('connect-facebook', async () => {
      try {
        const { auth_url } = await getFacebookConnectUrl(organizationId);
        window.location.href = auth_url;
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to start Facebook connection',
          variant: 'destructive',
        });
      }
    });
  }, [organizationId, runIntegrationAction, toast]);

  const handleConnectStripe = useCallback(async () => {
    if (!organizationId) return;
    await runIntegrationAction('connect-stripe', async () => {
      try {
        const { authUrl } = await initiateStripeConnect(
          organizationId,
          INTEGRATIONS_PATH,
        );
        window.location.href = authUrl;
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to start Stripe connection',
          variant: 'destructive',
        });
      }
    });
  }, [organizationId, runIntegrationAction, toast]);

  useEffect(() => {
    const result = readIntegrationOAuthResult(location.search);
    if (!result) return;
    toast(integrationOAuthToast(result));
    window.history.replaceState({}, document.title, location.pathname);
  }, [location.pathname, location.search, toast]);

  const handleDisconnect = async (id: number) => {
    if (!organizationId) return;
    await runIntegrationAction(`disconnect-calendar-${id}`, async () => {
      try {
        await disconnectCalendar(id, organizationId);
        queryClient.setQueryData<IntegrationOverview>(
          overviewQueryKey,
          (current) =>
            current
              ? {
                  ...current,
                  calendarConnections: current.calendarConnections.filter(
                    (connection) => connection.id !== id,
                  ),
                }
              : current,
        );
        toast({
          title: 'Disconnected',
          description: 'Calendar disconnected successfully',
        });
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to disconnect',
          variant: 'destructive',
        });
      }
    });
  };

  const handleDisconnectFacebook = async () => {
    if (!organizationId || !facebookChannel) return;
    await runIntegrationAction('disconnect-facebook', async () => {
      try {
        await disconnectChannel(facebookChannel.id, organizationId);
        queryClient.setQueryData<IntegrationOverview>(
          overviewQueryKey,
          (current) =>
            current
              ? {
                  ...current,
                  facebookChannel: null,
                  facebookStatusAvailable: true,
                }
              : current,
        );
        toast({
          title: 'Disconnected',
          description: 'Facebook disconnected successfully',
        });
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to disconnect Facebook',
          variant: 'destructive',
        });
      }
    });
  };

  const handleDisconnectStripe = async () => {
    if (!organizationId) return;
    await runIntegrationAction('disconnect-stripe', async () => {
      try {
        await disconnectStripeConnect(organizationId);
        queryClient.setQueryData<IntegrationOverview>(
          overviewQueryKey,
          (current) =>
            current
              ? {
                  ...current,
                  stripeConnected: false,
                  stripeStatusAvailable: true,
                }
              : current,
        );
        toast({
          title: 'Disconnected',
          description: 'Stripe is no longer connected for invoice payments.',
        });
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to disconnect Stripe',
          variant: 'destructive',
        });
      }
    });
  };

  const googleConnection = connections.find(
    (connection) => connection.provider === 'google' && connection.is_active,
  );
  const googleConnections = connections.filter(
    (connection) => connection.provider === 'google',
  );
  const outlookConnections = connections.filter(
    (connection) => connection.provider === 'outlook',
  );
  const toggleIntegration = (integration: string) => {
    setExpandedIntegration((current) =>
      current === integration ? null : integration,
    );
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
        icon={<Plug className="h-5 w-5 text-icon-accent flex-shrink-0" />}
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
        icon={<Plug className="h-5 w-5 text-icon-accent flex-shrink-0" />}
      >
        {errorState}
      </PageLayout>
    );
  }

  const content = (
    <Card>
      <CardHeader>
        <SettingsSectionTitle icon={Plug}>Connections</SettingsSectionTitle>
      </CardHeader>
      <CardContent surface="inset">
        {loading ? (
          <div className="divide-y rounded-lg border">
            {[0, 1, 2, 3, 4, 5].map((index) => (
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
          <div className="overflow-hidden rounded-lg border">
            {organizationId && (
              <GleamIntegration
                key={organizationId}
                organizationId={organizationId}
                expanded={expandedIntegration === 'gleam'}
                onToggle={() => toggleIntegration('gleam')}
              />
            )}

            <div className="border-b">
              <IntegrationStatusRow
                name="Google Calendar"
                description="Sync availability and bookings with Google Calendar."
                status={googleConnection ? 'connected' : 'disconnected'}
                detail={googleConnection?.provider_email || undefined}
                icon={<IntegrationProviderMark provider="google-calendar" />}
                primaryLabel={googleConnection ? 'Add account' : 'Connect'}
                onPrimary={() => void handleConnectGoogle()}
                busy={connecting === 'google'}
                expanded={expandedIntegration === 'google'}
                onToggle={() => toggleIntegration('google')}
                controlsId="google-integration-details"
              />
              {expandedIntegration === 'google' ? (
                <div
                  id="google-integration-details"
                  className="border-t bg-muted/10 p-4 sm:p-5"
                >
                  <p className="text-sm font-medium">Calendar accounts</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Connected accounts supply availability and receive Itemize
                    bookings.
                  </p>
                  {googleConnections.length > 0 ? (
                    <div className="mt-4 divide-y overflow-hidden rounded-lg border bg-card">
                      {googleConnections.map((connection) => (
                        <CalendarAccountRow
                          key={connection.id}
                          connection={connection}
                          organizationId={organizationId as number}
                          onDisconnect={() =>
                            void handleDisconnect(connection.id)
                          }
                          externalBusy={
                            integrationPending &&
                            activeIntegrationAction ===
                              `disconnect-calendar-${connection.id}`
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      No Google Calendar account is connected yet.
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="border-b">
              <IntegrationStatusRow
                name="Facebook"
                description="Bring Page messages into the Itemize inbox."
                status={
                  !overview?.facebookStatusAvailable
                    ? 'unavailable'
                    : facebookChannel
                      ? 'connected'
                      : 'disconnected'
                }
                detail={facebookChannel?.name || undefined}
                icon={<IntegrationProviderMark provider="facebook" />}
                primaryLabel={
                  !overview?.facebookStatusAvailable
                    ? 'Retry'
                    : facebookChannel
                      ? 'Reconnect'
                      : 'Connect'
                }
                secondaryLabel="Inbox"
                onPrimary={
                  !overview?.facebookStatusAvailable
                    ? () => void overviewQuery.refetch()
                    : () => void handleConnectFacebook()
                }
                onSecondary={() => navigate('/social')}
                onDisconnect={
                  facebookChannel
                    ? () => void handleDisconnectFacebook()
                    : undefined
                }
                busy={
                  connecting === 'facebook' ||
                  activeIntegrationAction === 'disconnect-facebook'
                }
                expanded={expandedIntegration === 'facebook'}
                onToggle={() => toggleIntegration('facebook')}
                controlsId="facebook-integration-details"
              />
              {expandedIntegration === 'facebook' ? (
                <div
                  id="facebook-integration-details"
                  className="grid gap-3 border-t bg-muted/10 p-4 text-sm sm:grid-cols-2 sm:p-5"
                >
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Connected Page
                    </p>
                    <p className="mt-2 font-medium">
                      {facebookChannel?.name || 'No Page connected'}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Message destination
                    </p>
                    <p className="mt-2 font-medium">Itemize Inbox</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-b">
              <IntegrationStatusRow
                name="Stripe"
                description="Accept card payments on invoices to your Stripe account."
                status={
                  !overview?.stripeStatusAvailable
                    ? 'unavailable'
                    : stripeConnected
                      ? 'connected'
                      : 'disconnected'
                }
                icon={<IntegrationProviderMark provider="stripe" />}
                primaryLabel={
                  !overview?.stripeStatusAvailable
                    ? 'Retry'
                    : stripeConnected
                      ? 'Reconnect'
                      : 'Connect'
                }
                secondaryLabel="Payments"
                onPrimary={
                  !overview?.stripeStatusAvailable
                    ? () => void overviewQuery.refetch()
                    : () => void handleConnectStripe()
                }
                onSecondary={() => navigate('/payment-settings')}
                onDisconnect={
                  stripeConnected
                    ? () => void handleDisconnectStripe()
                    : undefined
                }
                busy={
                  connecting === 'stripe' ||
                  activeIntegrationAction === 'disconnect-stripe'
                }
                expanded={expandedIntegration === 'stripe'}
                onToggle={() => toggleIntegration('stripe')}
                controlsId="stripe-integration-details"
              />
              {expandedIntegration === 'stripe' ? (
                <div
                  id="stripe-integration-details"
                  className="border-t bg-muted/10 p-4 sm:p-5"
                >
                  <p className="text-sm font-medium">Invoice payments</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stripeConnected
                      ? 'Stripe is ready to process card payments from Itemize invoices.'
                      : 'Connect Stripe to add secure card payment options to invoices.'}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="border-b">
              <IntegrationStatusRow
                name="Webhooks"
                description="Send events to other tools from automations."
                status="available"
                icon={<IntegrationProviderMark provider="webhooks" />}
                primaryLabel="Open automations"
                onPrimary={() => navigate('/automations')}
                expanded={expandedIntegration === 'webhooks'}
                onToggle={() => toggleIntegration('webhooks')}
                controlsId="webhooks-integration-details"
              />
              {expandedIntegration === 'webhooks' ? (
                <div
                  id="webhooks-integration-details"
                  className="border-t bg-muted/10 p-4 sm:p-5"
                >
                  <p className="text-sm font-medium">Automation delivery</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose an Itemize event, add your endpoint, and control the
                    payload from the automation builder.
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <IntegrationStatusRow
                name="Outlook Calendar"
                description="Sync Outlook calendars for bookings."
                status={
                  outlookConnections.some((connection) => connection.is_active)
                    ? 'connected'
                    : 'soon'
                }
                icon={<IntegrationProviderMark provider="outlook-calendar" />}
                primaryLabel={
                  outlookConnections.length > 0 ? undefined : 'Coming soon'
                }
                expanded={expandedIntegration === 'outlook'}
                onToggle={() => toggleIntegration('outlook')}
                controlsId="outlook-integration-details"
              />
              {expandedIntegration === 'outlook' ? (
                <div
                  id="outlook-integration-details"
                  className="border-t bg-muted/10 p-4 sm:p-5"
                >
                  {outlookConnections.length > 0 ? (
                    <div className="divide-y overflow-hidden rounded-lg border bg-card">
                      {outlookConnections.map((connection) => (
                        <CalendarAccountRow
                          key={connection.id}
                          connection={connection}
                          organizationId={organizationId as number}
                          onDisconnect={() =>
                            void handleDisconnect(connection.id)
                          }
                          externalBusy={
                            integrationPending &&
                            activeIntegrationAction ===
                              `disconnect-calendar-${connection.id}`
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Outlook Calendar connection support is coming soon.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
  if (embedded) return <div className="space-y-6">{content}</div>;
  return (
    <PageLayout
      title="INTEGRATIONS"
      icon={<Plug className="h-5 w-5 text-icon-accent flex-shrink-0" />}
      surfaceClassName="space-y-6"
    >
      {content}
    </PageLayout>
  );
}

export default CalendarIntegrationsPage;
