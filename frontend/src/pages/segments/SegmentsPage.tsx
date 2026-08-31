import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Users, PieChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { HeaderAction, HeaderCombinedQuery, HeaderFilters, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { PageLayout } from '@/components/layout/PageLayout';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { FramedSection } from '@/components/ui/framed-section';
import { OnboardingModal } from '@/components/OnboardingModal';
import { StatCard } from '@/components/StatCard';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { useOrganization } from '@/hooks/useOrganization';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { getCatalogStatusVisual } from '@/pages/campaigns/constants/campaignVisuals';
import { calculateSegment, deleteSegment, type Segment } from '@/services/segmentsApi';
import { segmentQueryKeys } from '@/services/segmentQueryKeys';
import { getSegmentPageViaGraphql } from '@/services/segmentsGraphql';

type StatusFilter = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 20;

export function SegmentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const onboarding = useRouteOnboarding();
  const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [segmentToDelete, setSegmentToDelete] = useState<Segment | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const catalogQueryKey = segmentQueryKeys.page(organizationId, {
    search: debouncedSearch,
    status: statusFilter,
    page,
    limit: PAGE_SIZE,
  });
  const catalogQuery = useQuery({
    queryKey: catalogQueryKey,
    queryFn: ({ signal }) => getSegmentPageViaGraphql({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
    }, organizationId as number, signal),
    enabled: organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
    placeholderData: keepPreviousData,
  });
  const segments = catalogQuery.data?.segments ?? [];
  const pagination = catalogQuery.data?.pagination ?? {
    page, limit: PAGE_SIZE, total: 0, totalPages: 0,
  };
  const loading = orgLoading || (organizationId !== null && catalogQuery.isPending);
  const loadError = catalogQuery.error && !catalogQuery.data
    ? 'We could not load your segments. Existing segments have not been changed.'
    : null;

  const stats = catalogQuery.data?.stats ?? { total: 0, dynamic: 0, staticCount: 0, contacts: 0 };

  useEffect(() => {
    if (!catalogQuery.data) return;
    const lastAvailablePage = Math.max(1, catalogQuery.data.pagination.totalPages);
    if (page > lastAvailablePage) setPage(lastAvailablePage);
  }, [catalogQuery.data, page]);

  const statusSelect = (compact = false) => (
    <Select value={statusFilter} onValueChange={value => setStatusFilter(value as StatusFilter)}>
      <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[132px] bg-muted/20'}><SelectValue placeholder="Status" /></SelectTrigger>
      <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Available</SelectItem><SelectItem value="inactive">Unavailable</SelectItem></SelectContent>
    </Select>
  );

  const handleRecalculate = async (segment: Segment) => {
    if (!organizationId) return;
    setWorkingId(segment.id);
    try {
      const updated = await calculateSegment(segment.id, organizationId);
      await queryClient.invalidateQueries({ queryKey: segmentQueryKeys.catalog(organizationId) });
      void queryClient.invalidateQueries({ queryKey: ['campaign-editor-bootstrap'] });
      toast({ title: 'Recalculated', description: `${updated.contact_count} contacts match this segment.` });
    } catch {
      toast({ title: 'Unable to recalculate', description: 'The saved segment is unchanged.', variant: 'destructive' });
    } finally { setWorkingId(null); }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!organizationId || !segmentToDelete) return false;
    try {
      await deleteSegment(segmentToDelete.id, organizationId);
      await queryClient.invalidateQueries({ queryKey: segmentQueryKeys.catalog(organizationId) });
      void queryClient.invalidateQueries({ queryKey: ['campaign-editor-bootstrap'] });
      setSegmentToDelete(null);
      return true;
    } catch { return false; }
  };

  const hasQuery = Boolean(searchQuery.trim()) || statusFilter !== 'all';
  const clearQuery = () => { setSearchQuery(''); setStatusFilter('all'); };

  if (initError) return <PageLayout title="SEGMENTS" icon={<Filter className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}><OrganizationErrorState title="Unable to load segments" icon={Filter} /></PageLayout>;

  return (
    <PageLayout
      title="SEGMENTS"
      icon={<Filter className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
      headerTools={{
        search: <HeaderSearch label="Search segments" placeholder="Search segments..." value={searchQuery} onChange={setSearchQuery} width="wide" />,
        filters: <HeaderFilters label="Filter segments by status" activeCount={Number(statusFilter !== 'all')} compactChildren={statusSelect(true)} preferExpanded="when-roomy">{statusSelect()}</HeaderFilters>,
        combinedQuery: <HeaderCombinedQuery label="Search and filter segments" placeholder="Search segments..." value={searchQuery} onChange={setSearchQuery} activeCount={Number(Boolean(searchQuery.trim())) + Number(statusFilter !== 'all')}>{statusSelect(true)}</HeaderCombinedQuery>,
        primaryAction: <HeaderAction label="New segment" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/segments/new')} />,
      }}
    >
      {!loadError && <FramedSection title="Overview" icon={PieChart} className="mb-6">
        <ResponsiveCardRail label="Segment summary" desktopColumns="md:grid-cols-2 lg:grid-cols-4" className="responsive-stat-summary mb-0">
        <StatCard title="Total segments" badgeText="Total" value={stats.total} icon={Filter} description={`${stats.total} configured`} colorTheme="blue" isLoading={loading} />
        <StatCard title="Dynamic segments" badgeText="Dynamic" value={stats.dynamic} icon={RefreshCw} description="Rule-based audiences" colorTheme="blue" isLoading={loading} />
        <StatCard title="Static segments" badgeText="Static" value={stats.staticCount} icon={Users} description="Saved contact groups" colorTheme="blue" isLoading={loading} />
        <StatCard title="Segment contacts" badgeText="Contacts" value={stats.contacts} icon={Users} description="Across all segments" colorTheme="blue" isLoading={loading} />
        </ResponsiveCardRail>
      </FramedSection>}

      <Card><CardContent className="p-0">
        {loading ? <div className="space-y-4 p-6">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
          : loadError ? <ErrorState title="Segments unavailable" description={loadError} icon={Filter} onAction={() => void catalogQuery.refetch()} className="p-12" />
          : segments.length === 0 ? <EmptyState icon={Filter} kind={hasQuery ? 'results' : 'collection'} title={hasQuery ? 'No matching segments' : 'No segments yet'} description={hasQuery ? undefined : 'Create a segment to group and target contacts.'} actionLabel={hasQuery ? 'Clear filters' : 'New segment'} onAction={hasQuery ? clearQuery : () => navigate('/segments/new')} className="p-12" />
          : <div className="divide-y">{segments.map(segment => {
            const visual = getCatalogStatusVisual(segment.is_active);
            const TypeIcon = segment.segment_type === 'dynamic' ? RefreshCw : Users;
            return <div
              key={segment.id}
              role="button"
              tabIndex={0}
              aria-label={`Edit ${segment.name}`}
              className="group flex cursor-pointer items-center gap-3 px-3 py-4 interaction-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
              onClick={() => navigate(`/segments/${segment.id}`)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(`/segments/${segment.id}`);
                }
              }}
            >
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}><TypeIcon className={cn('h-5 w-5', visual.iconClass)} /></div>
              <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-medium md:text-base">{segment.name}</h3><Badge className={cn('shrink-0 text-xs', visual.badgeClass)}>{visual.label}</Badge></div>{segment.description && <p className="mt-1 truncate text-sm text-muted-foreground">{segment.description}</p>}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{segment.segment_type === 'dynamic' ? 'Dynamic' : 'Static'}</span><span>{segment.contact_count} contact{segment.contact_count === 1 ? '' : 's'}</span>{segment.used_in_campaigns > 0 && <span>{segment.used_in_campaigns} campaign{segment.used_in_campaigns === 1 ? '' : 's'}</span>}{segment.used_in_automations > 0 && <span>{segment.used_in_automations} automation{segment.used_in_automations === 1 ? '' : 's'}</span>}</div></div>
              <DropdownMenu><DropdownMenuTrigger asChild onClick={event => event.stopPropagation()}><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={workingId === segment.id} aria-label={`More actions for ${segment.name}`}><MoreHorizontal className={cn('h-4 w-4', workingId === segment.id && 'animate-pulse')} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" onClick={event => event.stopPropagation()}><DropdownMenuItem onClick={() => navigate(`/segments/${segment.id}`)} className="group/menu"><Pencil className="mr-2 h-4 w-4" />Edit segment</DropdownMenuItem>{segment.segment_type === 'dynamic' && <DropdownMenuItem onClick={() => void handleRecalculate(segment)}><RefreshCw className="mr-2 h-4 w-4" />Recalculate</DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem onClick={() => setSegmentToDelete(segment)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </div>;
          })}</div>}
      </CardContent></Card>

      {pagination.totalPages > 1 && <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} segments</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={catalogQuery.isFetching || pagination.page <= 1}>Previous</Button>
          <span className="min-w-20 text-center text-sm text-muted-foreground">{pagination.page} of {pagination.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(current => Math.min(pagination.totalPages, current + 1))} disabled={catalogQuery.isFetching || pagination.page >= pagination.totalPages}>Next</Button>
        </div>
      </div>}

      {onboarding.featureKey && ONBOARDING_CONTENT[onboarding.featureKey] && <OnboardingModal isOpen={onboarding.showModal} onClose={onboarding.handleClose} onComplete={onboarding.handleComplete} onDismiss={onboarding.handleDismiss} content={ONBOARDING_CONTENT[onboarding.featureKey]} />}
      <DeleteDialog open={Boolean(segmentToDelete)} onOpenChange={open => !open && setSegmentToDelete(null)} onConfirm={handleDelete} itemType="segment" itemTitle={segmentToDelete?.name} />
    </PageLayout>
  );
}

export default SegmentsPage;
