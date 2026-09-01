import { useCallback, useEffect, useState } from 'react';
import { MoreHorizontal, Plus, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import {
    disconnectChannel,
    getChannels,
    getFacebookConnectUrl,
    SocialChannel,
} from '@/services/socialApi';
import { PageLayout } from '@/components/layout/PageLayout';
import { HeaderAction, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { cn } from '@/lib/utils';
import { getCommunicationAvailabilityVisual } from '@/pages/communications/constants/communicationVisuals';
import { IntegrationProviderMark } from '@/components/brand/IntegrationProviderMark';
import { useKeyedSingleFlightAction, useSingleFlightAction } from '@/hooks/useSingleFlightAction';

export function SocialPage() {
    const { toast } = useToast();
    const {
        showModal: showOnboarding,
        handleComplete: completeOnboarding,
        handleDismiss: dismissOnboarding,
        handleClose: closeOnboarding,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [channels, setChannels] = useState<SocialChannel[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [loadError, setLoadError] = useState('');
    const { pending: connectPending, run: runConnect } = useSingleFlightAction();
    const { isPending: isChannelPending, run: runChannelAction } = useKeyedSingleFlightAction<number>();

    const fetchData = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setLoadError('');
        try {
            setChannels(await getChannels({}, organizationId));
        } catch {
            setLoadError('We could not load your connected accounts.');
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        if (initError) setLoading(false);
    }, [initError]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    const handleConnectFacebook = async () => {
        if (!organizationId) return;
        await runConnect(async () => {
            try {
                const { auth_url } = await getFacebookConnectUrl(organizationId);
                window.location.href = auth_url;
            } catch {
                toast({ title: 'Connection unavailable', description: 'Try connecting the account again.', variant: 'destructive' });
            }
        });
    };

    const handleDisconnect = async (id: number) => {
        if (!organizationId) return;
        await runChannelAction(id, async () => {
            try {
                await disconnectChannel(id, organizationId);
                await fetchData();
                toast({ title: 'Account disconnected' });
            } catch {
                toast({ title: 'Account not disconnected', description: 'Try again.', variant: 'destructive' });
            }
        });
    };

    const filteredChannels = channels.filter((channel) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;
        return channel.name.toLowerCase().includes(query)
            || channel.channel_type.toLowerCase().includes(query)
            || (channel.username || '').toLowerCase().includes(query);
    });
    const pageError = initError || loadError;

    return (
        <PageLayout
            title="CONNECTED ACCOUNTS"
            icon={<Share2 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
            headerTools={{
                search: (
                    <HeaderSearch
                        label="Search connected accounts"
                        placeholder="Search accounts..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        width="wide"
                    />
                ),
                primaryAction: (
                    <HeaderAction
                        label="Connect account"
                        icon={<Plus className="h-4 w-4" />}
                        onClick={() => void handleConnectFacebook()}
                        busy={connectPending}
                    />
                ),
            }}
        >
            {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] ? (
                <OnboardingModal
                    isOpen={showOnboarding}
                    onClose={closeOnboarding}
                    onComplete={completeOnboarding}
                    onDismiss={dismissOnboarding}
                    content={ONBOARDING_CONTENT[onboardingFeatureKey]}
                />
            ) : null}

            {pageError ? (
                initError ? (
                    <OrganizationErrorState title="Unable to load connected accounts" icon={Share2} />
                ) : (
                    <ErrorState
                        kind="section"
                        title="Unable to load connected accounts"
                        description={pageError}
                        icon={Share2}
                        onAction={() => void fetchData()}
                    />
                )
            ) : (
                <Card>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="space-y-4 p-6">
                                {[0, 1].map((item) => <Skeleton key={item} className="h-20" />)}
                            </div>
                        ) : filteredChannels.length === 0 ? (
                            <EmptyState
                                icon={Share2}
                                kind={searchQuery ? 'results' : 'collection'}
                                title={searchQuery ? 'No matching accounts' : 'No accounts connected yet'}
                                description={searchQuery ? undefined : 'Connect an account to receive and reply to its messages in Inbox.'}
                                actionLabel={searchQuery ? 'Clear search' : undefined}
                                onAction={searchQuery ? () => setSearchQuery('') : undefined}
                                action={!searchQuery ? (
                                    <Button onClick={() => void handleConnectFacebook()} disabled={connectPending} aria-busy={connectPending ? 'true' : undefined} className="bg-blue-600 text-white interaction-button--primary">
                                        <IntegrationProviderMark provider="facebook" className="mr-2 h-4 w-4" />
                                        Connect Facebook
                                    </Button>
                                ) : undefined}
                                className="p-12"
                            />
                        ) : (
                            <div className="divide-y">
                                {filteredChannels.map((channel) => {
                                    const available = channel.is_active && channel.is_connected;
                                    const statusVisual = getCommunicationAvailabilityVisual(available);
                                    const provider = channel.channel_type === 'instagram' ? 'instagram' : 'facebook';
                                    const working = isChannelPending(channel.id);
                                    return (
                                        <div key={channel.id} aria-busy={working ? 'true' : undefined} className="flex items-center justify-between gap-3 p-4">
                                            <div className="flex min-w-0 items-center gap-4">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                                                    <IntegrationProviderMark provider={provider} className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">{channel.name}</p>
                                                    <p className="truncate text-sm text-muted-foreground">
                                                        {channel.channel_type === 'instagram' ? 'Instagram' : 'Facebook'}
                                                        {channel.username ? ` · @${channel.username.replace(/^@/, '')}` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                                                <Badge className={cn('pointer-events-none', statusVisual.badgeClass)}>
                                                    {statusVisual.label}
                                                </Badge>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" disabled={working} aria-label={`Actions for ${channel.name}`}>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onClick={() => void handleDisconnect(channel.id)}
                                                            className="text-destructive focus:text-destructive"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />Disconnect
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </PageLayout>
    );
}

export default SocialPage;
