import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, MessageSquareText, MessagesSquare, MoreHorizontal, Plus, RotateCw, Send, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { HeaderAction, HeaderFilters, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { PageLayout } from '@/components/layout/PageLayout';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ListRowSkeleton } from '@/components/ui/loading-skeletons';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { deleteReviewRequest, getReviewRequests, resendReviewRequest, type ReviewRequest } from '@/services/reputationApi';
import { SendReviewRequestModal } from './SendReviewRequestModal';
import { getReviewRequestStatusVisual } from './constants/reputationVisuals';

const REQUEST_STATUSES: Array<ReviewRequest['status'] | 'all'> = ['all', 'pending', 'sent', 'opened', 'clicked', 'completed', 'failed', 'unsubscribed'];

const contactName = (request: ReviewRequest) => request.contact_name
  || [request.first_name, request.last_name].filter(Boolean).join(' ')
  || request.contact_email
  || request.contact_phone
  || 'Unknown recipient';

const channelLabel = (channel: ReviewRequest['channel']) => channel === 'both' ? 'Email and SMS' : channel === 'sms' ? 'SMS' : 'Email';

export function ReputationRequestsPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
  const { showModal: showOnboarding, handleComplete, handleDismiss, handleClose, featureKey } = useRouteOnboarding();
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showSendModal, setShowSendModal] = useState(searchParams.get('compose') === '1');
  const [requestToDelete, setRequestToDelete] = useState<ReviewRequest | null>(null);

  useEffect(() => { if (initError) setLoading(false); }, [initError]);

  const fetchRequests = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await getReviewRequests({
        status: statusFilter === 'all' ? undefined : statusFilter as ReviewRequest['status'],
      }, organizationId);
      setRequests(response.requests ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId, statusFilter]);

  useEffect(() => { void fetchRequests(); }, [fetchRequests]);

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return requests;
    return requests.filter(request => [contactName(request), request.contact_email, request.contact_phone]
      .some(value => value?.toLowerCase().includes(query)));
  }, [requests, searchQuery]);

  const closeComposer = () => {
    setShowSendModal(false);
    if (searchParams.has('compose')) {
      const next = new URLSearchParams(searchParams);
      next.delete('compose');
      setSearchParams(next, { replace: true });
    }
  };

  const handleResend = async (request: ReviewRequest) => {
    if (!organizationId) return;
    try {
      const result = await resendReviewRequest(request.id, organizationId);
      toast({
        title: result.status === 'sent' ? 'Request resent' : result.status === 'failed' ? 'Delivery failed' : 'Resend accepted',
        variant: result.status === 'failed' ? 'destructive' : 'default',
      });
      await fetchRequests();
    } catch {
      toast({ title: 'Could not resend request', variant: 'destructive' });
    }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!organizationId || !requestToDelete) return false;
    try {
      await deleteReviewRequest(requestToDelete.id, organizationId);
      setRequests(current => current.filter(request => request.id !== requestToDelete.id));
      setRequestToDelete(null);
      return true;
    } catch {
      return false;
    }
  };

  const statusSelect = (className = 'w-36') => (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className={cn('h-11', className)} aria-label="Filter review requests by status"><SelectValue placeholder="Status" /></SelectTrigger>
      <SelectContent>
        {REQUEST_STATUSES.map(status => (
          <SelectItem key={status} value={status}>{status === 'all' ? 'All statuses' : getReviewRequestStatusVisual(status).label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (initError) {
    return (
      <PageLayout title="REQUESTS" icon={<Send className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}>
        <OrganizationErrorState title="Unable to load review requests" icon={Send} />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="REQUESTS"
      icon={<Send className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
      headerTools={{
        search: <HeaderSearch value={searchQuery} onChange={setSearchQuery} label="Search review requests" placeholder="Search requests..." />,
        filters: <HeaderFilters label="Request filters" activeCount={statusFilter === 'all' ? 0 : 1} preferExpanded>{statusSelect()}</HeaderFilters>,
        primaryAction: <HeaderAction label="Send request" icon={<Plus className="h-4 w-4" />} onClick={() => setShowSendModal(true)} />,
      }}
    >
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><ListRowSkeleton count={3} height="h-20" /></div>
          ) : loadError ? (
            <ErrorState
              kind="section"
              icon={Send}
              title="Unable to load review requests"
              description="We couldn't load your review requests. Try again."
              onRetry={() => void fetchRequests()}
            />
          ) : filteredRequests.length === 0 ? (
            <EmptyState
              icon={Send}
              kind={searchQuery || statusFilter !== 'all' ? 'results' : 'collection'}
              title={searchQuery || statusFilter !== 'all' ? 'No matching requests' : 'No review requests yet'}
              description={searchQuery || statusFilter !== 'all' ? undefined : 'Send a request when you are ready to collect feedback.'}
              actionLabel={searchQuery || statusFilter !== 'all' ? 'Clear filters' : 'Send request'}
              onAction={() => {
                if (searchQuery || statusFilter !== 'all') { setSearchQuery(''); setStatusFilter('all'); }
                else setShowSendModal(true);
              }}
              className="p-12"
            />
          ) : (
            <div className="divide-y">
              {filteredRequests.map(request => {
                const visual = getReviewRequestStatusVisual(request.status);
                const StatusIcon = visual.icon;
                const ChannelIcon = request.channel === 'both' ? MessagesSquare : request.channel === 'sms' ? MessageSquareText : Mail;
                const activityDate = request.review_submitted_at || request.clicked_at || request.email_opened_at || request.email_sent_at || request.sms_sent_at || request.created_at;
                return (
                  <article key={request.id} className="flex items-start gap-3 px-3 py-4 sm:px-4">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}><StatusIcon className={cn('h-5 w-5', visual.iconClass)} aria-hidden="true" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 truncate font-medium">{contactName(request)}</h3><Badge className={cn('text-xs', visual.badgeClass)}>{visual.label}</Badge></div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><ChannelIcon className="h-3.5 w-3.5" />{channelLabel(request.channel)}</span>
                        {request.contact_email ? <span className="truncate">{request.contact_email}</span> : null}
                        {request.contact_phone ? <span>{request.contact_phone}</span> : null}
                        <time dateTime={activityDate}>{new Date(activityDate).toLocaleDateString()}</time>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`More actions for ${contactName(request)}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void handleResend(request)}><RotateCw className="mr-2 h-4 w-4" />Resend</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setRequestToDelete(request)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {showSendModal && organizationId ? <SendReviewRequestModal organizationId={organizationId} onClose={closeComposer} onSent={() => { closeComposer(); void fetchRequests(); }} /> : null}
      {featureKey && ONBOARDING_CONTENT[featureKey] ? <OnboardingModal isOpen={showOnboarding} onClose={handleClose} onComplete={handleComplete} onDismiss={handleDismiss} content={ONBOARDING_CONTENT[featureKey]} /> : null}
      <DeleteDialog open={Boolean(requestToDelete)} onOpenChange={open => { if (!open) setRequestToDelete(null); }} onConfirm={handleDelete} itemType="review-request" itemTitle={requestToDelete ? contactName(requestToDelete) : undefined} />
    </PageLayout>
  );
}

export default ReputationRequestsPage;
