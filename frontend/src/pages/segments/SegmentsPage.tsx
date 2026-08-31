import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getCatalogStatusVisual } from '@/pages/campaigns/constants/campaignVisuals';
import { calculateSegment, deleteSegment, getSegments, type Segment } from '@/services/segmentsApi';

type StatusFilter = 'all' | 'active' | 'inactive';

export function SegmentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const onboarding = useRouteOnboarding();
  const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [segmentToDelete, setSegmentToDelete] = useState<Segment | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const requestRef = useRef(0);

  const fetchSegments = useCallback(async () => {
    if (orgLoading) return setLoading(true);
    if (!organizationId) { setSegments([]); setLoading(false); return; }
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const next = await getSegments({}, organizationId);
      if (requestId === requestRef.current) setSegments(next);
    } catch (error) {
      console.error('Error fetching segments:', error);
      if (requestId === requestRef.current) setLoadError('We could not load your segments. Existing segments have not been changed.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [organizationId, orgLoading]);

  useEffect(() => { void fetchSegments(); }, [fetchSegments]);

  const stats = useMemo(() => ({
    total: segments.length,
    dynamic: segments.filter(segment => segment.segment_type === 'dynamic').length,
    staticCount: segments.filter(segment => segment.segment_type === 'static').length,
    contacts: segments.reduce((sum, segment) => sum + (segment.contact_count || 0), 0),
  }), [segments]);

  const filteredSegments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return segments.filter(segment => {
      const matchesQuery = !query || segment.name.toLowerCase().includes(query) || segment.description?.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || segment.is_active === (statusFilter === 'active');
      return matchesQuery && matchesStatus;
    });
  }, [searchQuery, segments, statusFilter]);

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
      setSegments(current => current.map(item => item.id === updated.id ? updated : item));
      toast({ title: 'Recalculated', description: `${updated.contact_count} contacts match this segment.` });
    } catch {
      toast({ title: 'Unable to recalculate', description: 'The saved segment is unchanged.', variant: 'destructive' });
    } finally { setWorkingId(null); }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!organizationId || !segmentToDelete) return false;
    try {
      await deleteSegment(segmentToDelete.id, organizationId);
      setSegments(current => current.filter(segment => segment.id !== segmentToDelete.id));
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
          : loadError ? <ErrorState title="Segments unavailable" description={loadError} icon={Filter} onAction={() => void fetchSegments()} className="p-12" />
          : filteredSegments.length === 0 ? <EmptyState icon={Filter} kind={hasQuery ? 'results' : 'collection'} title={hasQuery ? 'No matching segments' : 'No segments yet'} description={hasQuery ? undefined : 'Create a segment to group and target contacts.'} actionLabel={hasQuery ? 'Clear filters' : 'New segment'} onAction={hasQuery ? clearQuery : () => navigate('/segments/new')} className="p-12" />
          : <div className="divide-y">{filteredSegments.map(segment => {
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

      {onboarding.featureKey && ONBOARDING_CONTENT[onboarding.featureKey] && <OnboardingModal isOpen={onboarding.showModal} onClose={onboarding.handleClose} onComplete={onboarding.handleComplete} onDismiss={onboarding.handleDismiss} content={ONBOARDING_CONTENT[onboarding.featureKey]} />}
      <DeleteDialog open={Boolean(segmentToDelete)} onOpenChange={open => !open && setSegmentToDelete(null)} onConfirm={handleDelete} itemType="segment" itemTitle={segmentToDelete?.name} />
    </PageLayout>
  );
}

export default SegmentsPage;
