import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Code2, Copy, LayoutGrid, MoreHorizontal, Pause, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { OnboardingModal } from '@/components/OnboardingModal';
import { StatCard } from '@/components/StatCard';
import { ListRowSkeleton } from '@/components/ui/loading-skeletons';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { deleteReviewWidget, getReviewWidgets, getWidgetEmbedCode, type ReviewWidget } from '@/services/reputationApi';
import { getReputationPlatformLabel, getReviewWidgetAvailabilityVisual } from './constants/reputationVisuals';

const WIDGET_TYPES: Array<ReviewWidget['widget_type'] | 'all'> = ['all', 'carousel', 'grid', 'list', 'badge', 'floating'];

export function ReputationWidgetsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
  const { showModal: showOnboarding, handleComplete, handleDismiss, handleClose, featureKey } = useRouteOnboarding();
  const [widgets, setWidgets] = useState<ReviewWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [widgetToDelete, setWidgetToDelete] = useState<ReviewWidget | null>(null);

  useEffect(() => { if (initError) setLoading(false); }, [initError]);

  const fetchWidgets = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setLoadError(false);
    try {
      setWidgets(await getReviewWidgets(organizationId));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void fetchWidgets(); }, [fetchWidgets]);

  const filteredWidgets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return widgets.filter(widget => (!query || widget.name.toLowerCase().includes(query)) && (typeFilter === 'all' || widget.widget_type === typeFilter));
  }, [searchQuery, typeFilter, widgets]);

  const copyEmbedCode = async (widget: ReviewWidget) => {
    if (!organizationId) return;
    try {
      const result = await getWidgetEmbedCode(widget.id, organizationId);
      await navigator.clipboard.writeText(result.embed_code);
      toast({ title: 'Embed code copied' });
    } catch {
      toast({ title: 'Could not copy embed code', variant: 'destructive' });
    }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!organizationId || !widgetToDelete) return false;
    try {
      await deleteReviewWidget(widgetToDelete.id, organizationId);
      setWidgets(current => current.filter(widget => widget.id !== widgetToDelete.id));
      setWidgetToDelete(null);
      return true;
    } catch {
      return false;
    }
  };

  const typeSelect = (className = 'w-36') => (
    <Select value={typeFilter} onValueChange={setTypeFilter}>
      <SelectTrigger className={cn('h-11', className)} aria-label="Filter review widgets by type"><SelectValue placeholder="Type" /></SelectTrigger>
      <SelectContent>{WIDGET_TYPES.map(type => <SelectItem key={type} value={type}>{type === 'all' ? 'All types' : getReputationPlatformLabel(type)}</SelectItem>)}</SelectContent>
    </Select>
  );

  if (initError) {
    return (
      <PageLayout title="WIDGETS" icon={<LayoutGrid className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}>
        <OrganizationErrorState title="Unable to load review widgets" icon={LayoutGrid} />
      </PageLayout>
    );
  }

  const availableCount = widgets.filter(widget => widget.is_active).length;

  return (
    <PageLayout
      title="WIDGETS"
      icon={<LayoutGrid className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
      headerTools={{
        search: <HeaderSearch value={searchQuery} onChange={setSearchQuery} label="Search review widgets" placeholder="Search widgets..." />,
        filters: <HeaderFilters label="Widget filters" activeCount={typeFilter === 'all' ? 0 : 1} preferExpanded>{typeSelect()}</HeaderFilters>,
        primaryAction: <HeaderAction label="New widget" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/review-widgets/new')} />,
      }}
    >
      {!loadError ? <ResponsiveCardRail label="Widget summary" desktopColumns="md:grid-cols-3" className="responsive-stat-summary">
        <StatCard title="Total widgets" badgeText="Total" value={widgets.length} icon={LayoutGrid} description="Configured widgets" colorTheme="blue" isLoading={loading} />
        <StatCard title="Available widgets" badgeText="Available" value={availableCount} icon={Code2} description="Rendering when installed" colorTheme="blue" isLoading={loading} />
        <StatCard title="Unavailable widgets" badgeText="Unavailable" value={widgets.length - availableCount} icon={Pause} description="Retained for later" colorTheme="orange" isLoading={loading} />
      </ResponsiveCardRail> : null}

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-6"><ListRowSkeleton count={3} height="h-20" /></div> : loadError ? (
            <ErrorState
              kind="section"
              icon={LayoutGrid}
              title="Unable to load review widgets"
              description="We couldn't load your review widgets. Try again."
              onRetry={() => void fetchWidgets()}
            />
          ) : filteredWidgets.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              kind={searchQuery || typeFilter !== 'all' ? 'results' : 'collection'}
              title={searchQuery || typeFilter !== 'all' ? 'No matching widgets' : 'No review widgets yet'}
              description={searchQuery || typeFilter !== 'all' ? undefined : 'Create a widget to display customer reviews on your website.'}
              actionLabel={searchQuery || typeFilter !== 'all' ? 'Clear filters' : 'New widget'}
              onAction={() => {
                if (searchQuery || typeFilter !== 'all') { setSearchQuery(''); setTypeFilter('all'); }
                else navigate('/review-widgets/new');
              }}
              className="p-12"
            />
          ) : (
            <div className="divide-y">
              {filteredWidgets.map(widget => {
                const visual = getReviewWidgetAvailabilityVisual(widget.is_active);
                const StatusIcon = visual.icon;
                return (
                  <div key={widget.id} role="button" tabIndex={0} className="group flex cursor-pointer items-center gap-3 px-3 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4" onClick={() => navigate(`/review-widgets/${widget.id}`)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/review-widgets/${widget.id}`); } }}>
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}><StatusIcon className={cn('h-5 w-5', visual.iconClass)} aria-hidden="true" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2"><h3 className="truncate font-medium">{widget.name}</h3><Badge className={cn('shrink-0 text-xs', visual.badgeClass)}>{visual.label}</Badge></div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{getReputationPlatformLabel(widget.widget_type)}</span><span>{widget.min_rating}+ stars</span><span>Up to {widget.max_reviews} reviews</span></div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`More actions for ${widget.name}`} onClick={event => event.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
                        <DropdownMenuItem onClick={() => navigate(`/review-widgets/${widget.id}`)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void copyEmbedCode(widget)}><Copy className="mr-2 h-4 w-4" />Copy embed code</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setWidgetToDelete(widget)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteDialog open={Boolean(widgetToDelete)} onOpenChange={open => { if (!open) setWidgetToDelete(null); }} onConfirm={handleDelete} itemType="widget" itemTitle={widgetToDelete?.name} />
      {featureKey && ONBOARDING_CONTENT[featureKey] ? <OnboardingModal isOpen={showOnboarding} onClose={handleClose} onComplete={handleComplete} onDismiss={handleDismiss} content={ONBOARDING_CONTENT[featureKey]} /> : null}
    </PageLayout>
  );
}

export default ReputationWidgetsPage;
