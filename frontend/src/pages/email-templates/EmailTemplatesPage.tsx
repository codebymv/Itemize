import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileText, FolderOpen, Mail, MoreHorizontal, Pencil, Plus, Send, Trash2, PieChart } from 'lucide-react';
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
import { useAuthState } from '@/contexts/AuthContext';
import { useOrganization } from '@/hooks/useOrganization';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { getCatalogStatusVisual } from '@/pages/campaigns/constants/campaignVisuals';
import { DRAFT_EMAIL_TEMPLATE_VISUAL } from './constants/emailTemplateVisuals';
import { deleteEmailTemplate, duplicateEmailTemplate, sendTestEmail, type EmailTemplate } from '@/services/emailApi';
import { getEmailTemplatesViaGraphql } from '@/services/emailTemplatesGraphql';
import { templateCatalogQueryKeys } from '@/services/templateCatalogQueryKeys';
import { useKeyedSingleFlightAction } from '@/hooks/useSingleFlightAction';

type StatusFilter = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 20;

export function EmailTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser } = useAuthState();
  const onboarding = useRouteOnboarding();
  const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);
  const { isPending: isTemplatePending, run: runTemplateAction } = useKeyedSingleFlightAction<number>();
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, debouncedSearch, statusFilter]);

  const templatesQueryKey = templateCatalogQueryKeys.emailPage(organizationId, {
    search: debouncedSearch,
    category: categoryFilter,
    status: statusFilter,
    page,
    limit: PAGE_SIZE,
  });
  const templatesQuery = useQuery({
    queryKey: templatesQueryKey,
    queryFn: ({ signal }) => getEmailTemplatesViaGraphql({
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
    ? 'We could not load your email templates. Existing templates have not been changed.'
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

  const handleDuplicate = async (template: EmailTemplate) => {
    if (!organizationId) return;
    await runTemplateAction(template.id, async () => {
      try {
        await duplicateEmailTemplate(template.id, organizationId);
        await queryClient.invalidateQueries({ queryKey: templateCatalogQueryKeys.email(organizationId) });
        toast({ title: 'Duplicated', description: 'Template duplicated successfully.' });
      } catch { toast({ title: 'Unable to duplicate', description: 'The template was not duplicated.', variant: 'destructive' }); }
    });
  };

  const handleSendTest = async (template: EmailTemplate) => {
    if (!organizationId || !currentUser?.email) return;
    await runTemplateAction(template.id, async () => {
      try {
        await sendTestEmail(template.id, organizationId, currentUser.email);
        toast({ title: 'Test email queued', description: `Sending to ${currentUser.email}.` });
      } catch { toast({ title: 'Unable to send test', description: 'The test email was not queued.', variant: 'destructive' }); }
    });
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!organizationId || !templateToDelete) return false;
    try {
      await deleteEmailTemplate(templateToDelete.id, organizationId);
      await queryClient.invalidateQueries({ queryKey: templateCatalogQueryKeys.email(organizationId) });
      setTemplateToDelete(null);
      return true;
    }
    catch { return false; }
  };

  const hasQuery = Boolean(searchQuery.trim()) || categoryFilter !== 'all' || statusFilter !== 'all';
  const clearQuery = () => { setSearchQuery(''); setCategoryFilter('all'); setStatusFilter('all'); };

  if (initError) return <PageLayout title="EMAIL TEMPLATES" icon={<FileText className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}><OrganizationErrorState title="Unable to load email templates" icon={FileText} /></PageLayout>;

  return <PageLayout
    title="EMAIL TEMPLATES"
    icon={<FileText className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
    headerTools={{
      search: <HeaderSearch label="Search email templates" placeholder="Search email templates..." value={searchQuery} onChange={setSearchQuery} width="wide" />,
      filters: <HeaderFilters label="Filter email templates" activeCount={Number(categoryFilter !== 'all') + Number(statusFilter !== 'all')} compactChildren={filters(true)} preferExpanded="wide-lane">{filters()}</HeaderFilters>,
      combinedQuery: <HeaderCombinedQuery label="Search and filter email templates" placeholder="Search email templates..." value={searchQuery} onChange={setSearchQuery} activeCount={Number(Boolean(searchQuery.trim())) + Number(categoryFilter !== 'all') + Number(statusFilter !== 'all')}>{filters(true)}</HeaderCombinedQuery>,
      primaryAction: <HeaderAction label="New template" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/email-templates/new')} />,
    }}
  >
    {!loadError && <FramedSection title="Overview" icon={PieChart} className="mb-6">
      <ResponsiveCardRail label="Email template summary" desktopColumns="md:grid-cols-2 lg:grid-cols-4" className="responsive-stat-summary mb-0">
      <StatCard title="Total email templates" badgeText="Total" value={stats.total} icon={FileText} description={`${stats.total} reusable`} colorTheme="blue" isLoading={loading} />
      <StatCard title="Available email templates" badgeText="Available" value={stats.active} icon={Mail} description="Ready for new sends" colorTheme="blue" isLoading={loading} />
      <StatCard title="Unavailable email templates" badgeText="Unavailable" value={stats.inactive} icon={FileText} description="Not selectable" colorTheme="orange" isLoading={loading} />
      <StatCard title="Email template categories" badgeText="Categories" value={stats.categories} icon={FolderOpen} description="Catalog groups" colorTheme="blue" isLoading={loading} />
      </ResponsiveCardRail>
    </FramedSection>}
    <Card><CardContent className="p-0">{loading ? <div className="space-y-4 p-6">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
      : loadError ? <ErrorState title="Email templates unavailable" description={loadError} icon={FileText} onAction={() => void templatesQuery.refetch()} className="p-12" />
      : templates.length === 0 ? <EmptyState icon={FileText} kind={hasQuery ? 'results' : 'collection'} title={hasQuery ? 'No matching email templates' : 'No email templates yet'} description={hasQuery ? undefined : 'Create a reusable template for campaign and automation emails.'} actionLabel={hasQuery ? 'Clear filters' : 'New template'} onAction={hasQuery ? clearQuery : () => navigate('/email-templates/new')} className="p-12" />
      : <div className="divide-y">{templates.map(template => {
        const visual = getCatalogStatusVisual(template.is_active);
        const working = isTemplatePending(template.id);
        return <div key={template.id} role="link" tabIndex={0} aria-busy={working ? 'true' : undefined} aria-label={`Edit ${template.name}`} className="group flex cursor-pointer items-center gap-3 px-3 py-4 interaction-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4" onClick={() => navigate(`/email-templates/${template.id}`)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/email-templates/${template.id}`); } }}><div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}><Mail className={cn('h-5 w-5', visual.iconClass)} /></div><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-medium md:text-base">{template.name}</h3><Badge className={cn('shrink-0 text-xs', visual.badgeClass)}>{visual.label}</Badge>{template.has_unpublished_changes && <Badge className={cn('shrink-0 text-xs', DRAFT_EMAIL_TEMPLATE_VISUAL.badgeClass)}>{DRAFT_EMAIL_TEMPLATE_VISUAL.label}</Badge>}</div><p className="mt-1 truncate text-sm text-muted-foreground">{template.subject}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{template.category && <span>{template.category}</span>}<span>{template.variables.length} variable{template.variables.length === 1 ? '' : 's'}</span></div></div><DropdownMenu><DropdownMenuTrigger asChild onClick={event => event.stopPropagation()}><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={working} aria-label={`More actions for ${template.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" onClick={event => event.stopPropagation()}><DropdownMenuItem onClick={() => navigate(`/email-templates/${template.id}`)} className="group/menu"><Pencil className="mr-2 h-4 w-4" />Edit template</DropdownMenuItem><DropdownMenuItem onClick={() => void handleSendTest(template)} disabled={!template.published_version || Boolean(template.has_unpublished_changes)}><Send className="mr-2 h-4 w-4" />Send published test</DropdownMenuItem><DropdownMenuItem onClick={() => void handleDuplicate(template)}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setTemplateToDelete(template)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
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
    <DeleteDialog open={Boolean(templateToDelete)} onOpenChange={open => !open && setTemplateToDelete(null)} onConfirm={handleDelete} itemType="email-template" itemTitle={templateToDelete?.name} />
  </PageLayout>;
}

export default EmailTemplatesPage;
