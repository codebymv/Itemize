import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

type StatusFilter = 'all' | 'active' | 'inactive';

export function SMSTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const onboarding = useRouteOnboarding();
  const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [templateToDelete, setTemplateToDelete] = useState<SmsTemplate | null>(null);
  const [testTemplate, setTestTemplate] = useState<SmsTemplate | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [workingId, setWorkingId] = useState<number | null>(null);
  const templatesQueryKey = templateCatalogQueryKeys.sms(organizationId);
  const templatesQuery = useQuery({
    queryKey: templatesQueryKey,
    queryFn: ({ signal }) => getSmsTemplatesViaGraphql({}, organizationId as number, signal),
    enabled: organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const templates = useMemo(() => templatesQuery.data?.templates ?? [], [templatesQuery.data]);
  const loading = orgLoading || (organizationId !== null && templatesQuery.isPending);
  const loadError = templatesQuery.error && !templatesQuery.data
    ? 'We could not load your SMS templates. Existing templates have not been changed.'
    : null;

  const categories = useMemo(() => Array.from(new Set(templates.map(template => template.category).filter(Boolean))).sort(), [templates]);
  const stats = useMemo(() => ({ total: templates.length, active: templates.filter(template => template.is_active).length, inactive: templates.filter(template => !template.is_active).length, categories: categories.length }), [categories.length, templates]);
  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return templates.filter(template => {
      const matchesQuery = !query || template.name.toLowerCase().includes(query) || template.message.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || template.is_active === (statusFilter === 'active');
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, searchQuery, statusFilter, templates]);

  const filters = (compact = false) => <div className={cn('flex gap-2', compact && 'flex-col')}>
    <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[142px] bg-muted/20'}><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select>
    <Select value={statusFilter} onValueChange={value => setStatusFilter(value as StatusFilter)}><SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[126px] bg-muted/20'}><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Available</SelectItem><SelectItem value="inactive">Unavailable</SelectItem></SelectContent></Select>
  </div>;

  const handleDuplicate = async (template: SmsTemplate) => {
    if (!organizationId) return;
    setWorkingId(template.id);
    try {
      const copy = await duplicateSmsTemplate(template.id, organizationId);
      queryClient.setQueryData<{ templates: SmsTemplate[]; total: number }>(templatesQueryKey, current => current ? {
        templates: [copy, ...current.templates.filter(item => item.id !== copy.id)],
        total: current.templates.some(item => item.id === copy.id) ? current.total : current.total + 1,
      } : current);
      toast({ title: 'Duplicated', description: 'Template duplicated successfully.' });
    }
    catch { toast({ title: 'Unable to duplicate', description: 'The template was not duplicated.', variant: 'destructive' }); }
    finally { setWorkingId(null); }
  };

  const handleSendTest = async () => {
    if (!organizationId || !testTemplate || !testPhone.trim()) return;
    setWorkingId(testTemplate.id);
    try {
      await sendTestSms(testTemplate.id, testPhone.trim(), organizationId);
      toast({ title: 'Test SMS queued', description: `Sending to ${testPhone.trim()}.` });
      setTestTemplate(null);
      setTestPhone('');
    } catch { toast({ title: 'Unable to send test', description: 'The test SMS was not queued.', variant: 'destructive' }); }
    finally { setWorkingId(null); }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!organizationId || !templateToDelete) return false;
    try {
      await deleteSmsTemplate(templateToDelete.id, organizationId);
      queryClient.setQueryData<{ templates: SmsTemplate[]; total: number }>(templatesQueryKey, current => {
        if (!current?.templates.some(template => template.id === templateToDelete.id)) return current;
        return {
          templates: current.templates.filter(template => template.id !== templateToDelete.id),
          total: Math.max(0, current.total - 1),
        };
      });
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
      : filteredTemplates.length === 0 ? <EmptyState icon={MessageSquare} kind={hasQuery ? 'results' : 'collection'} title={hasQuery ? 'No matching SMS templates' : 'No SMS templates yet'} description={hasQuery ? undefined : 'Create a reusable template for campaign messages.'} actionLabel={hasQuery ? 'Clear filters' : 'New template'} onAction={hasQuery ? clearQuery : () => navigate('/sms-templates/new')} className="p-12" />
      : <div className="divide-y">{filteredTemplates.map(template => {
        const visual = getCatalogStatusVisual(template.is_active);
        const characterCount = template.message.length;
        const segmentCount = Math.max(1, Math.ceil(characterCount / 160));
        return <div key={template.id} role="link" tabIndex={0} aria-label={`Open ${template.name}`} className="group flex cursor-pointer items-center gap-3 px-3 py-4 interaction-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4" onClick={() => navigate(`/sms-templates/${template.id}`)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/sms-templates/${template.id}`); } }}><div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}><MessageSquare className={cn('h-5 w-5', visual.iconClass)} /></div><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-medium md:text-base">{template.name}</h3><Badge className={cn('shrink-0 text-xs', visual.badgeClass)}>{visual.label}</Badge></div><p className="mt-1 truncate text-sm text-muted-foreground">{template.message}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{template.category && <span>{template.category}</span>}<span>{characterCount} characters</span><span>{segmentCount} SMS segment{segmentCount === 1 ? '' : 's'}</span></div></div><DropdownMenu><DropdownMenuTrigger asChild onClick={event => event.stopPropagation()}><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={workingId === template.id} aria-label={`More actions for ${template.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" onClick={event => event.stopPropagation()}><DropdownMenuItem onClick={() => navigate(`/sms-templates/${template.id}`)} className="group/menu"><Pencil className="mr-2 h-4 w-4" />Edit template</DropdownMenuItem><DropdownMenuItem onClick={() => { setTestTemplate(template); setTestPhone(''); }}><Send className="mr-2 h-4 w-4" />Send test</DropdownMenuItem><DropdownMenuItem onClick={() => void handleDuplicate(template)}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setTemplateToDelete(template)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
      })}</div>}
    </CardContent></Card>
    {onboarding.featureKey && ONBOARDING_CONTENT[onboarding.featureKey] && <OnboardingModal isOpen={onboarding.showModal} onClose={onboarding.handleClose} onComplete={onboarding.handleComplete} onDismiss={onboarding.handleDismiss} content={ONBOARDING_CONTENT[onboarding.featureKey]} />}
    <Dialog open={Boolean(testTemplate)} onOpenChange={open => { if (!open && workingId !== testTemplate?.id) { setTestTemplate(null); setTestPhone(''); } }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Send a test SMS</DialogTitle><DialogDescription>Send {testTemplate?.name} to a phone number before using it in a campaign.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="test-sms-phone">Destination phone number</Label><Input id="test-sms-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 555 555 0100" value={testPhone} onChange={event => setTestPhone(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void handleSendTest(); }} /></div><DialogFooter><Button variant="outline" onClick={() => { setTestTemplate(null); setTestPhone(''); }} disabled={workingId === testTemplate?.id}>Cancel</Button><Button className="bg-blue-600 text-white interaction-button--primary" onClick={() => void handleSendTest()} disabled={!testPhone.trim() || workingId === testTemplate?.id}><Send className="mr-2 h-4 w-4" />Send test</Button></DialogFooter></DialogContent></Dialog>
    <DeleteDialog open={Boolean(templateToDelete)} onOpenChange={open => !open && setTemplateToDelete(null)} onConfirm={handleDelete} itemType="sms-template" itemTitle={templateToDelete?.name} />
  </PageLayout>;
}

export default SMSTemplatesPage;
