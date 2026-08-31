import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Eye,
  Megaphone,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  XCircle,
  PieChart,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  HeaderAction,
  HeaderCombinedQuery,
  HeaderFilters,
  HeaderSearch,
} from '@/components/layout/DesktopHeaderTools';
import { PageLayout } from '@/components/layout/PageLayout';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { FramedSection } from '@/components/ui/framed-section';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { OnboardingModal } from '@/components/OnboardingModal';
import { StatCard } from '@/components/StatCard';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { campaignQueryKeys } from '@/services/campaignQueryKeys';
import {
  deleteCampaign,
  duplicateCampaign,
  getCampaigns,
  pauseCampaign,
  previewCampaign,
  resumeCampaign,
  sendCampaign,
  type EmailCampaign,
} from '@/services/campaignsApi';
import type { Campaign } from '@/types/campaigns';
import { CAMPAIGN_SUMMARY_VISUALS, getCampaignStatusVisual } from './constants/campaignVisuals';

const CAMPAIGN_STATUSES: Array<{ value: Campaign['status']; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sending', label: 'Sending' },
  { value: 'paused', label: 'Paused' },
  { value: 'sent', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];
const PAGE_SIZE = 20;

function toCampaignListItem(campaign: EmailCampaign): Campaign {
  return {
    id: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    status: campaign.status,
    recipient_count: campaign.total_recipients ?? 0,
    sent_count: campaign.total_sent ?? 0,
    open_rate: campaign.open_rate,
    click_rate: campaign.click_rate,
    scheduled_at: campaign.scheduled_at,
    sent_at: campaign.completed_at,
    created_at: campaign.created_at,
  };
}

function formatCampaignDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function CampaignsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const onboarding = useOnboardingTrigger('campaigns');
  const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({
    onError: () => 'Failed to initialize.',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [campaignToSend, setCampaignToSend] = useState<Campaign | null>(null);
  const [workingCampaignId, setWorkingCampaignId] = useState<number | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const queueQuery = useQuery({
    queryKey: campaignQueryKeys.queue(organizationId, {
      search: debouncedSearch,
      status: statusFilter,
      page,
      limit: PAGE_SIZE,
    }),
    queryFn: ({ signal }) => getCampaigns({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: statusFilter as EmailCampaign['status'] | 'all',
    }, organizationId as number, signal),
    enabled: organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
    placeholderData: keepPreviousData,
  });
  const campaigns = useMemo(
    () => (queueQuery.data?.campaigns ?? []).map(toCampaignListItem),
    [queueQuery.data?.campaigns],
  );
  const pagination = queueQuery.data?.pagination ?? { page, limit: PAGE_SIZE, total: 0, totalPages: 0 };
  const stats = queueQuery.data?.stats ?? { total: 0, failed: 0, draft: 0, inProgress: 0, delivered: 0 };
  const loading = orgLoading || (organizationId !== null && queueQuery.isPending);
  const loadError = queueQuery.error && !queueQuery.data
    ? 'We could not load your campaigns. Existing campaigns have not been changed.'
    : null;

  useEffect(() => {
    if (!queueQuery.data) return;
    const lastAvailablePage = Math.max(1, queueQuery.data.pagination.totalPages);
    if (page > lastAvailablePage) setPage(lastAvailablePage);
  }, [page, queueQuery.data]);

  const sendPreviewQuery = useQuery({
    queryKey: campaignQueryKeys.audiencePreview(organizationId, campaignToSend?.id ?? null),
    queryFn: ({ signal }) => previewCampaign(
      campaignToSend?.id as number,
      organizationId as number,
      signal,
    ),
    enabled: campaignToSend !== null && organizationId !== null,
    staleTime: 0,
    retry: shouldRetryQuery,
  });
  const sendPreview = sendPreviewQuery.data ?? null;
  const sendPreviewLoading = sendPreviewQuery.isPending && sendPreviewQuery.fetchStatus !== 'idle';
  const sendPreviewError = sendPreviewQuery.isError
    ? 'Recipient eligibility could not be verified. Sending is disabled until the preview succeeds.'
    : null;

  const hasQuery = Boolean(searchQuery.trim()) || statusFilter !== 'all';
  const clearQuery = () => {
    setSearchQuery('');
    setStatusFilter('all');
  };

  const statusSelect = (compact = false) => (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger aria-label="Campaign status" className={compact ? 'w-full' : 'w-[140px] bg-muted/20'}>
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {CAMPAIGN_STATUSES.map(status => (
          <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const refreshQueue = () => queryClient.invalidateQueries({
    queryKey: campaignQueryKeys.queues(organizationId),
  });

  const handleDuplicate = async (campaign: Campaign) => {
    if (!organizationId) return;
    setWorkingCampaignId(campaign.id);
    try {
      await duplicateCampaign(campaign.id, organizationId);
      await refreshQueue();
      toast({ title: 'Duplicated', description: 'Campaign duplicated as a draft.' });
    } catch (error) {
      toast({ title: 'Unable to duplicate', description: 'The campaign was not duplicated.', variant: 'destructive' });
    } finally {
      setWorkingCampaignId(null);
    }
  };

  const handlePause = async (campaign: Campaign) => {
    if (!organizationId) return;
    setWorkingCampaignId(campaign.id);
    try {
      await pauseCampaign(campaign.id, organizationId);
      await refreshQueue();
      toast({ title: 'Paused', description: 'Campaign delivery has been paused.' });
    } catch (error) {
      toast({ title: 'Unable to pause', description: 'Campaign delivery is unchanged.', variant: 'destructive' });
    } finally {
      setWorkingCampaignId(null);
    }
  };

  const handleResume = async (campaign: Campaign) => {
    if (!organizationId) return;
    setWorkingCampaignId(campaign.id);
    try {
      await resumeCampaign(campaign.id, organizationId);
      await refreshQueue();
      toast({ title: 'Resumed', description: 'Campaign delivery has resumed.' });
    } catch (error) {
      toast({ title: 'Unable to resume', description: 'Campaign delivery remains paused.', variant: 'destructive' });
    } finally {
      setWorkingCampaignId(null);
    }
  };

  const requestSend = async (campaign: Campaign) => {
    if (!organizationId) return;
    setCampaignToSend(campaign);
  };

  const confirmSend = async () => {
    if (!organizationId || !campaignToSend || !sendPreview || sendPreview.recipientCount < 1) return;
    const campaign = campaignToSend;
    setWorkingCampaignId(campaign.id);
    try {
      const result = await sendCampaign(campaign.id, organizationId);
      queryClient.removeQueries({
        queryKey: campaignQueryKeys.audiencePreview(organizationId, campaign.id),
      });
      await refreshQueue();
      setCampaignToSend(null);
      toast({
        title: 'Campaign started',
        description: `Sending to ${result.recipientCount} eligible recipient${result.recipientCount === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      toast({ title: 'Unable to send', description: 'The campaign remains unchanged.', variant: 'destructive' });
    } finally {
      setWorkingCampaignId(null);
    }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!organizationId || !campaignToDelete) return false;
    try {
      await deleteCampaign(campaignToDelete.id, organizationId);
      queryClient.removeQueries({
        queryKey: campaignQueryKeys.bootstrap(organizationId, campaignToDelete.id),
      });
      queryClient.removeQueries({
        queryKey: campaignQueryKeys.audiencePreview(organizationId, campaignToDelete.id),
      });
      await refreshQueue();
      setCampaignToDelete(null);
      return true;
    } catch (error) {
      return false;
    }
  };

  if (initError) {
    return (
      <PageLayout title="CAMPAIGNS" icon={<Megaphone className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}>
        <OrganizationErrorState title="Unable to load campaigns" icon={Megaphone} />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="CAMPAIGNS"
      icon={<Megaphone className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
      headerTools={{
        search: (
          <HeaderSearch label="Search campaigns" placeholder="Search campaigns..." value={searchQuery} onChange={setSearchQuery} width="wide" />
        ),
        filters: (
          <HeaderFilters label="Filter campaigns by status" activeCount={Number(statusFilter !== 'all')} compactChildren={statusSelect(true)} preferExpanded="when-roomy">
            {statusSelect()}
          </HeaderFilters>
        ),
        combinedQuery: (
          <HeaderCombinedQuery
            label="Search and filter campaigns"
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={setSearchQuery}
            activeCount={Number(Boolean(searchQuery.trim())) + Number(statusFilter !== 'all')}
          >
            {statusSelect(true)}
          </HeaderCombinedQuery>
        ),
        primaryAction: (
          <HeaderAction label="New campaign" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/campaigns/new')} />
        ),
      }}
    >
      <OnboardingModal isOpen={onboarding.showModal} onClose={onboarding.handleClose} onComplete={onboarding.handleComplete} onDismiss={onboarding.handleDismiss} content={ONBOARDING_CONTENT.campaigns} />

      {!loadError && (
        <FramedSection title="Overview" icon={PieChart} className="mb-6">
          <ResponsiveCardRail label="Campaign status summary" desktopColumns="md:grid-cols-2 lg:grid-cols-5" className="responsive-stat-summary mb-0">
            <StatCard title="Campaigns needing attention" badgeText="Not completed" value={stats.failed} icon={XCircle} description={`${stats.failed} failed or cancelled`} colorTheme="red" isLoading={loading} />
            <StatCard title="Total campaigns" badgeText="Total" value={stats.total} icon={Megaphone} description={`${stats.total} configured`} colorTheme="blue" isLoading={loading} />
            <StatCard title="Draft campaigns" badgeText="Draft" value={stats.draft} icon={CAMPAIGN_SUMMARY_VISUALS.draft.icon} description="Being prepared" colorTheme={CAMPAIGN_SUMMARY_VISUALS.draft.theme} isLoading={loading} />
            <StatCard title="Campaigns in progress" badgeText="In progress" value={stats.inProgress} icon={CAMPAIGN_SUMMARY_VISUALS.inProgress.icon} description="Scheduled, sending, or paused" colorTheme={CAMPAIGN_SUMMARY_VISUALS.inProgress.theme} isLoading={loading} />
            <StatCard title="Delivered campaigns" badgeText="Delivered" value={stats.delivered} icon={CAMPAIGN_SUMMARY_VISUALS.delivered.icon} description="Successfully sent" colorTheme={CAMPAIGN_SUMMARY_VISUALS.delivered.theme} isLoading={loading} />
          </ResponsiveCardRail>
        </FramedSection>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-4 p-6">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
          ) : loadError ? (
            <ErrorState title="Campaigns unavailable" description={loadError} icon={Megaphone} onAction={() => void queueQuery.refetch()} className="p-12" />
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              kind={hasQuery ? 'results' : 'collection'}
              title={hasQuery ? 'No matching campaigns' : 'No campaigns yet'}
              description={hasQuery ? 'Try a different search or clear the current filters.' : 'Create a campaign draft to begin preparing your message.'}
              actionLabel={hasQuery ? 'Clear filters' : 'New campaign'}
              onAction={hasQuery ? clearQuery : () => navigate('/campaigns/new')}
              className="p-12"
            />
          ) : (
            <div className="divide-y">
              {campaigns.map(campaign => {
                const visual = getCampaignStatusVisual(campaign.status);
                const StatusIcon = visual.icon;
                const working = workingCampaignId === campaign.id;
                const scheduledDate = formatCampaignDate(campaign.scheduled_at);
                const sentDate = formatCampaignDate(campaign.sent_at);
                return (
                  <div
                    key={campaign.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`${campaign.status === 'draft' || campaign.status === 'scheduled' ? 'Edit' : 'View'} ${campaign.name}`}
                    className="group flex cursor-pointer items-center gap-3 px-3 py-4 interaction-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
                    onClick={() => navigate(`/campaigns/${campaign.id}`)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/campaigns/${campaign.id}`);
                      }
                    }}
                  >
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}>
                      <StatusIcon className={cn('h-5 w-5', visual.iconClass)} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="truncate text-sm font-medium md:text-base">{campaign.name}</h3>
                        <Badge className={cn('shrink-0 text-xs', visual.badgeClass)}>{visual.label}</Badge>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{campaign.subject}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{campaign.sent_count}/{campaign.recipient_count} sent</span>
                        {campaign.open_rate !== undefined && <span>{campaign.open_rate}% opened</span>}
                        {campaign.click_rate !== undefined && <span>{campaign.click_rate}% clicked</span>}
                        {scheduledDate && <span>Scheduled {scheduledDate}</span>}
                        {sentDate && <span>Delivered {sentDate}</span>}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={event => event.stopPropagation()}>
                        <Button variant="ghost" size="iconToolbar" className="shrink-0" disabled={working} aria-label={`More actions for ${campaign.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
                        <DropdownMenuItem onClick={() => navigate(`/campaigns/${campaign.id}`)} className="group/menu">
                          {campaign.status === 'draft' || campaign.status === 'scheduled' ? (
                            <Pencil className="mr-2 h-4 w-4" />
                          ) : (
                            <Eye className="mr-2 h-4 w-4" />
                          )}
                          {campaign.status === 'draft' || campaign.status === 'scheduled' ? 'Edit campaign' : 'View campaign'}
                        </DropdownMenuItem>
                        {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
                          <DropdownMenuItem onClick={() => void requestSend(campaign)} className="group/menu">
                            <Send className="mr-2 h-4 w-4" />Send now
                          </DropdownMenuItem>
                        )}
                        {campaign.status === 'sending' && (
                          <DropdownMenuItem onClick={() => void handlePause(campaign)}><Pause className="mr-2 h-4 w-4" />Pause delivery</DropdownMenuItem>
                        )}
                        {campaign.status === 'paused' && (
                          <DropdownMenuItem onClick={() => void handleResume(campaign)} className="group/menu"><Play className="mr-2 h-4 w-4" />Resume delivery</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => void handleDuplicate(campaign)} className="group/menu"><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem>
                        {campaign.status !== 'sending' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setCampaignToDelete(campaign)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {pagination.totalPages > 1 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} campaigns
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(current => Math.max(1, current - 1))}
              disabled={queueQuery.isFetching || pagination.page <= 1}
            >
              Previous
            </Button>
            <span className="min-w-20 text-center text-sm text-muted-foreground">
              {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(current => Math.min(pagination.totalPages, current + 1))}
              disabled={queueQuery.isFetching || pagination.page >= pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={Boolean(campaignToSend)} onOpenChange={open => !open && setCampaignToSend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {campaignToSend?.name} now?</AlertDialogTitle>
            <AlertDialogDescription>
              {sendPreviewLoading
                ? 'Checking the eligible audience…'
                : sendPreviewError
                  ? sendPreviewError
                  : sendPreview
                    ? `This will start delivery to ${sendPreview.recipientCount} eligible recipient${sendPreview.recipientCount === 1 ? '' : 's'}. This action cannot be undone after delivery begins.`
                    : 'Recipient eligibility must be verified before sending.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={workingCampaignId === campaignToSend?.id}>Keep draft</AlertDialogCancel>
            <AlertDialogAction
              disabled={sendPreviewLoading || Boolean(sendPreviewError) || !sendPreview || sendPreview.recipientCount < 1 || workingCampaignId === campaignToSend?.id}
              onClick={event => {
                event.preventDefault();
                void confirmSend();
              }}
            >
              Send campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteDialog open={Boolean(campaignToDelete)} onOpenChange={open => !open && setCampaignToDelete(null)} onConfirm={handleDelete} itemType="campaign" itemTitle={campaignToDelete?.name} />
    </PageLayout>
  );
}

export default CampaignsPage;
