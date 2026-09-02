import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Copy, FolderOpen, MessageSquare, MoreHorizontal, Pencil, Plus, Send, Trash2, PieChart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { deleteSmsTemplate, duplicateSmsTemplate, sendTestSms, type SmsTemplate } from '@/services/smsApi';
import { getSmsTemplatesViaGraphql } from '@/services/smsTemplatesGraphql';
import { templateCatalogQueryKeys } from '@/services/templateCatalogQueryKeys';
import { useKeyedSingleFlightAction } from '@/hooks/useSingleFlightAction';
import { useKeyedStableMutationKey } from '@/hooks/useStableMutationKey';

type StatusFilter = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 20;

export function SMSTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const onboarding = useRouteOnboarding();
  const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [templateToDelete, setTemplateToDelete] = useState<SmsTemplate | null>(null);
  const [testTemplate, setTestTemplate] = useState<SmsTemplate | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const { isPending: isTemplatePending, run: runTemplateAction } = useKeyedSingleFlightAction<number>();
  const { begin: beginDuplicateAttempt, release: releaseDuplicateAttempt, reset: resetDuplicateAttempt } =
    useKeyedStableMutationKey<number>('sms-template-duplicate');
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, debouncedSearch, statusFilter]);

  const templatesQueryKey = templateCatalogQueryKeys.smsPage(organizationId, {
    search: debouncedSearch,
    category: categoryFilter,
    status: statusFilter,
    page,
    limit: PAGE_SIZE,
  });
  const templatesQuery = useQuery({
    queryKey: templatesQueryKey,
    queryFn: ({ signal }) => getSmsTemplatesViaGraphql({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
    }, organizationId as number, signal),
    enabled: organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
    placeholderData: keepPreviousData,
  });
  const templates = templatesQuery.data?.templates ?? [];
  const pagination = templatesQuery.data?.pagination ?? {
    page, limit: PAGE_SIZE, total: 0, totalPages: 0,
  };
  const loading = orgLoading || (organizationId !== null && templatesQuery.isPending);
  const loadError = templatesQuery.error && !templatesQuery.data
    ? 'We could not load your SMS templates. Existing templates have not been changed.'
    : null;

  const categories = (templatesQuery.data?.categories ?? []).map(item => item.category);
  const stats = templatesQuery.data?.stats ?? { total: 0, active: 0, inactive: 0, categories: 0 };

  useEffect(() => {
    if (!templatesQuery.data) return;
    const lastAvailablePage = Math.max(1, templatesQuery.data.pagination.totalPages);
    if (page > lastAvailablePage) setPage(lastAvailablePage);
  }, [page, templatesQuery.data]);

  const filters = (compact = false) => <div className={cn('flex gap-2', compact && 'flex-col')}>
    <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[142px] bg-muted/20'}><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select>
    <Select value={statusFilter} onValueChange={value => setStatusFilter(value as StatusFilter)}><SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[126px] bg-muted/20'}><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Available</SelectItem><SelectItem value="inactive">Unavailable</SelectItem></SelectContent></Select>
  </div>;

  const handleDuplicate = async (template: SmsTemplate) => {
    if (!organizationId) return;
    await runTemplateAction(template.id, async () => {
      const idempotencyKey = beginDuplicateAttempt(
        template.id,
        JSON.stringify({ organizationId, templateId: template.id }),
      );
      if (!idempotencyKey) return;
      try {
        await duplicateSmsTemplate(template.id, idempotencyKey, organizationId);
        resetDuplicateAttempt(template.id);
      }
      catch {
        releaseDuplicateAttempt(template.id);
        toast({ title: 'Unable to duplicate', description: 'The template was not duplicated.', variant: 'destructive' });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: templateCatalogQueryKeys.sms(organizationId) }).catch(() => undefined);
      toast({ title: 'Duplicated', description: 'Template duplicated successfully.' });
    });
  };

  const handleSendTest = async () => {
    if (!organizationId || !testTemplate || !testPhone.trim()) return;
    const template = testTemplate;
    await runTemplateAction(template.id, async () => {
      try {
        await sendTestSms(template.id, testPhone.trim(), organizationId);
        toast({ title: 'Test SMS queued', description: `Sending to ${testPhone.trim()}.` });
        setTestTemplate(null);
        setTestPhone('');
      } catch { toast({ title: 'Unable to send test', description: 'The test SMS was not queued.', variant: 'destructive' }); }
    });
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!organizationId || !templateToDelete) return false;
    try {
      await deleteSmsTemplate(templateToDelete.id, organizationId);
      await queryClient.invalidateQueries({ queryKey: templateCatalogQueryKeys.sms(organizationId) });
      setTemplateToDelete(null);
      return true;
    }
    catch { return false; }
  };

  const hasQuery = Boolean(searchQuery.trim()) || categoryFilter !== 'all' || statusFilter !== 'all';
  const clearQuery = () => { setSearchQuery(''); setCategoryFilter('all'); setStatusFilter('all'); };

  if (initError) return <PageLayout title="SMS TEMPLATES" icon={<MessageSquare className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}><OrganizationErrorState title="Unable to load SMS templates" icon={MessageSquare} /></PageLayout>;

  return <PageLayout
    title="SMS TEMPLATES"
    icon={<MessageSquare className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
    headerTools={{
      search: <HeaderSearch label="Search SMS templates" placeholder="Search SMS templates..." value={searchQuery} onChange={setSearchQuery} width="wide" />,
      filters: <HeaderFilters label="Filter SMS templates" activeCount={Number(categoryFilter !== 'all') + Number(statusFilter !== 'all')} compactChildren={filters(true)} preferExpanded="wide-lane">{filters()}</HeaderFilters>,
      combinedQuery: <HeaderCombinedQuery label="Search and filter SMS templates" placeholder="Search SMS templates..." value={searchQuery} onChange={setSearchQuery} activeCount={Number(Boolean(searchQuery.trim())) + Number(categoryFilter !== 'all') + Number(statusFilter !== 'all')}>{filters(true)}</HeaderCombinedQuery>,
      primaryAction: <HeaderAction label="New template" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/sms-templates/new')} />,
    }}
  >
    {!loadError && <FramedSection title="Overview" icon={PieChart} className="mb-6">
      <ResponsiveCardRail label="SMS template summary" desktopColumns="md:grid-cols-2 lg:grid-cols-4" className="responsive-stat-summary mb-0">
      <StatCard title="Total SMS templates" badgeText="Total" value={stats.total} icon={MessageSquare} description={`${stats.total} reusable`} colorTheme="blue" isLoading={loading} />
      <StatCard title="Available SMS templates" badgeText="Available" value={stats.active} icon={MessageSquare} description="Ready for new sends" colorTheme="blue" isLoading={loading} />
      <StatCard title="Unavailable SMS templates" badgeText="Unavailable" value={stats.inactive} icon={MessageSquare} description="Not selectable" colorTheme="orange" isLoading={loading} />
      <StatCard title="SMS template categories" badgeText="Categories" value={stats.categories} icon={FolderOpen} description="Catalog groups" colorTheme="blue" isLoading={loading} />
      </ResponsiveCardRail>
    </FramedSection>}
    <Card><CardContent className="p-0">{loading ? <div className="space-y-4 p-6">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
      : loadError ? <ErrorState title="SMS templates unavailable" description={loadError} icon={MessageSquare} onAction={() => void templatesQuery.refetch()} className="p-12" />
      : templates.length === 0 ? <EmptyState icon={MessageSquare} kind={hasQuery ? 'results' : 'collection'} title={hasQuery ? 'No matching SMS templates' : 'No SMS templates yet'} description={hasQuery ? undefined : 'Create a reusable template for campaign messages.'} actionLabel={hasQuery ? 'Clear filters' : 'New template'} onAction={hasQuery ? clearQuery : () => navigate('/sms-templates/new')} className="p-12" />
      : <div className="divide-y">{templates.map(template => {
        const visual = getCatalogStatusVisual(template.is_active);
        const characterCount = template.message.length;
        const segmentCount = Math.max(1, Math.ceil(characterCount / 160));
        const working = isTemplatePending(template.id);
        return <div key={template.id} role="link" tabIndex={0} aria-busy={working ? 'true' : undefined} aria-label={`Open ${template.name}`} className="group flex cursor-pointer items-center gap-3 px-3 py-4 interaction-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4" onClick={() => navigate(`/sms-templates/${template.id}`)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/sms-templates/${template.id}`); } }}><div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}><MessageSquare className={cn('h-5 w-5', visual.iconClass)} /></div><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-medium md:text-base">{template.name}</h3><Badge className={cn('shrink-0 text-xs', visual.badgeClass)}>{visual.label}</Badge></div><p className="mt-1 truncate text-sm text-muted-foreground">{template.message}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{template.category && <span>{template.category}</span>}<span>{characterCount} characters</span><span>{segmentCount} SMS segment{segmentCount === 1 ? '' : 's'}</span></div></div><DropdownMenu><DropdownMenuTrigger asChild onClick={event => event.stopPropagation()}><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={working} aria-label={`More actions for ${template.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" onClick={event => event.stopPropagation()}><DropdownMenuItem onClick={() => navigate(`/sms-templates/${template.id}`)} className="group/menu"><Pencil className="mr-2 h-4 w-4" />Edit template</DropdownMenuItem><DropdownMenuItem onClick={() => { setTestTemplate(template); setTestPhone(''); }}><Send className="mr-2 h-4 w-4" />Send test</DropdownMenuItem><DropdownMenuItem onClick={() => void handleDuplicate(template)}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setTemplateToDelete(template)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
      })}</div>}
    </CardContent></Card>
    {pagination.totalPages > 1 && <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} templates</p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={templatesQuery.isFetching || pagination.page <= 1}>Previous</Button>
        <span className="min-w-20 text-center text-sm text-muted-foreground">{pagination.page} of {pagination.totalPages}</span>
        <Button variant="outline" size="sm" onClick={() => setPage(current => Math.min(pagination.totalPages, current + 1))} disabled={templatesQuery.isFetching || pagination.page >= pagination.totalPages}>Next</Button>
      </div>
    </div>}
    {onboarding.featureKey && ONBOARDING_CONTENT[onboarding.featureKey] && <OnboardingModal isOpen={onboarding.showModal} onClose={onboarding.handleClose} onComplete={onboarding.handleComplete} onDismiss={onboarding.handleDismiss} content={ONBOARDING_CONTENT[onboarding.featureKey]} />}
    <Dialog open={Boolean(testTemplate)} onOpenChange={open => { if (!open && (!testTemplate || !isTemplatePending(testTemplate.id))) { setTestTemplate(null); setTestPhone(''); } }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Send a test SMS</DialogTitle><DialogDescription>Send {testTemplate?.name} to a phone number before using it in a campaign.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="test-sms-phone">Destination phone number</Label><Input id="test-sms-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 555 555 0100" value={testPhone} onChange={event => setTestPhone(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void handleSendTest(); }} /></div><DialogFooter><Button variant="outline" onClick={() => { if (!testTemplate || !isTemplatePending(testTemplate.id)) { setTestTemplate(null); setTestPhone(''); } }} disabled={testTemplate ? isTemplatePending(testTemplate.id) : false}>Cancel</Button><Button className="bg-blue-600 text-white interaction-button--primary" onClick={() => void handleSendTest()} disabled={!testPhone.trim() || (testTemplate ? isTemplatePending(testTemplate.id) : false)}><Send className="mr-2 h-4 w-4" />Send test</Button></DialogFooter></DialogContent></Dialog>
    <DeleteDialog open={Boolean(templateToDelete)} onOpenChange={open => !open && setTemplateToDelete(null)} onConfirm={handleDelete} itemType="sms-template" itemTitle={templateToDelete?.name} />
  </PageLayout>;
}

export default SMSTemplatesPage;
