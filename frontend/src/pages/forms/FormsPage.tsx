import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, MoreHorizontal, Trash2, Copy, Eye, EyeOff, BarChart3, Pencil, Archive, ChevronDown, Maximize2, Loader2, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { Form } from '@/types';
import { getFormPage, getForm, updateForm, deleteForm, duplicateForm, createForm } from '@/services/formsApi';
import { useOrganization } from '@/hooks/useOrganization';
import { PageLayout } from '@/components/layout/PageLayout';
import { HeaderAction, HeaderCombinedQuery, HeaderFilters, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { FramedSection } from '@/components/ui/framed-section';
import { StatCard } from '@/components/StatCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { cn } from '@/lib/utils';
import { getContentStatusVisual } from '@/pages/contentVisuals';
import { ExpandedRowActionLabel, ExpandedRowActions } from '@/components/ui/expanded-row';
import { FormPreviewCanvas } from '@/components/forms/FormPreviewCanvas';
import { FormPreviewDialog } from '@/components/forms/FormPreviewDialog';
import { publicFormPath } from '@/lib/publicContentRoutes';
import { formQueryKeys } from '@/services/formQueryKeys';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';

const PAGE_SIZE = 20;

export function FormsPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Route-aware onboarding (will show 'pages' onboarding for Pages & Forms group)
    const {
        showModal: showOnboarding,
        handleComplete: completeOnboarding,
        handleDismiss: dismissOnboarding,
        handleClose: closeOnboarding,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [page, setPage] = useState(1);
    const [formToDelete, setFormToDelete] = useState<Form | null>(null);
    const [expandedFormId, setExpandedFormId] = useState<number | null>(null);
    const [expandedFormData, setExpandedFormData] = useState<Form | null>(null);
    const [loadingExpandedId, setLoadingExpandedId] = useState<number | null>(null);
    const [previewForm, setPreviewForm] = useState<Form | null>(null);
    const previewRequestId = useRef(0);

    const handleCreateForm = useCallback(async () => {
        if (!organizationId) return;
        try {
            const newForm = await createForm({ name: 'New Form', organization_id: organizationId });
            navigate(`/forms/${newForm.id}`);
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToCreate('form'), variant: 'destructive' });
        }
    }, [navigate, organizationId, toast]);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [searchQuery]);

    useEffect(() => {
        setPage(1);
        setExpandedFormId(null);
        setExpandedFormData(null);
    }, [debouncedSearch, statusFilter]);

    const listParams = {
        status: statusFilter,
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE,
    };
    const formsQuery = useQuery({
        queryKey: formQueryKeys.page(organizationId, listParams),
        queryFn: ({ signal }) => getFormPage({
            status: statusFilter as Form['status'] | 'all',
            search: debouncedSearch || undefined,
            page,
            limit: PAGE_SIZE,
        }, organizationId!, signal),
        enabled: Boolean(organizationId) && !initError,
        staleTime: QUERY_STALE_TIME_MS,
        retry: shouldRetryQuery,
        placeholderData: keepPreviousData,
    });
    const forms = formsQuery.data?.forms ?? [];
    const pagination = formsQuery.data?.pagination ?? {
        page, limit: PAGE_SIZE, total: 0, totalPages: 0,
    };
    const stats = formsQuery.data?.stats ?? {
        total: 0, draft: 0, published: 0, archived: 0,
    };
    const loading = orgLoading || (Boolean(organizationId) && formsQuery.isPending);
    const loadError = formsQuery.isError ? toastMessages.failedToLoad('forms') : null;

    useEffect(() => {
        if (!formsQuery.data) return;
        const lastAvailablePage = Math.max(1, pagination.totalPages);
        if (page > lastAvailablePage) setPage(lastAvailablePage);
    }, [formsQuery.data, page, pagination.totalPages]);

    const handleToggleStatus = async (form: Form, newStatus: 'published' | 'draft') => {
        if (!organizationId) return;
        try {
            await updateForm(form.id, { status: newStatus }, organizationId);
            await queryClient.invalidateQueries({
                queryKey: formQueryKeys.pages(organizationId),
            });
            setExpandedFormData(current => current?.id === form.id ? { ...current, status: newStatus } : current);
            setPreviewForm(current => current?.id === form.id ? { ...current, status: newStatus } : current);
            toast({ title: newStatus === 'published' ? 'Form published' : 'Form unpublished' });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToUpdate('form'), variant: 'destructive' });
        }
    };

    const handleDuplicate = async (id: number) => {
        if (!organizationId) return;
        try {
            await duplicateForm(id, organizationId);
            await queryClient.invalidateQueries({
                queryKey: formQueryKeys.pages(organizationId),
            });
            toast({ title: 'Duplicated', description: toastMessages.duplicated('form') });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToDuplicate('form'), variant: 'destructive' });
        }
    };

    const handleDelete = async (): Promise<boolean> => {
        if (!organizationId || !formToDelete) return false;
        try {
            await deleteForm(formToDelete.id, organizationId);
            await queryClient.invalidateQueries({
                queryKey: formQueryKeys.pages(organizationId),
            });
            setExpandedFormId(current => current === formToDelete.id ? null : current);
            setExpandedFormData(current => current?.id === formToDelete.id ? null : current);
            setFormToDelete(null);
            return true;
        } catch (error) {
            return false;
        }
    };

    const copyFormLink = (identifier: string) => {
        navigator.clipboard.writeText(`${window.location.origin}${publicFormPath(identifier)}`);
        toast({ title: 'Link Copied', description: toastMessages.copiedToClipboard('form link') });
    };

    const toggleExpanded = async (form: Form) => {
        if (expandedFormId === form.id) {
            previewRequestId.current += 1;
            setExpandedFormId(null);
            setExpandedFormData(null);
            setLoadingExpandedId(null);
            return;
        }
        const requestId = previewRequestId.current + 1;
        previewRequestId.current = requestId;
        setExpandedFormId(form.id);
        setExpandedFormData(null);
        setLoadingExpandedId(form.id);
        try {
            const fullForm = form.fields ? form : await getForm(form.id, organizationId || undefined);
            if (previewRequestId.current === requestId) setExpandedFormData(fullForm);
        } catch {
            if (previewRequestId.current === requestId) {
                setExpandedFormId(null);
                toast({ title: 'Preview unavailable', description: 'The form preview could not be loaded.', variant: 'destructive' });
            }
        } finally {
            if (previewRequestId.current === requestId) setLoadingExpandedId(null);
        }
    };

    const openFullPreview = async (form: Form) => {
        if (expandedFormData?.id === form.id) {
            setPreviewForm(expandedFormData);
            return;
        }
        try {
            const fullForm = form.fields ? form : await getForm(form.id, organizationId || undefined);
            setPreviewForm(fullForm);
        } catch {
            toast({ title: 'Preview unavailable', description: 'The form preview could not be loaded.', variant: 'destructive' });
        }
    };

    const normalizedQuery = searchQuery.trim();
    const hasQuery = Boolean(normalizedQuery || statusFilter !== 'all');
    const clearQuery = () => {
        setSearchQuery('');
        setStatusFilter('all');
    };
    const statusSelect = (compact = false) => (
        <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className={compact ? 'h-11 w-full' : 'h-9 w-[9rem]'} aria-label="Filter forms by status">
                <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
        </Select>
    );

    if (initError) {
        return (
            <PageLayout
                title="FORMS"
                icon={<FileText className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
            >
                <OrganizationErrorState title="Unable to load forms" icon={FileText} />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="FORMS"
            icon={<FileText className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
            headerTools={{
                search: <HeaderSearch label="Search forms" placeholder="Search forms..." value={searchQuery} onChange={setSearchQuery} width="wide" />,
                filters: <HeaderFilters label="Filter forms by status" activeCount={Number(statusFilter !== 'all')} compactChildren={statusSelect(true)} preferExpanded="when-roomy">{statusSelect()}</HeaderFilters>,
                combinedQuery: <HeaderCombinedQuery label="Search and filter forms" placeholder="Search forms..." value={searchQuery} onChange={setSearchQuery} activeCount={Number(Boolean(normalizedQuery)) + Number(statusFilter !== 'all')}>{statusSelect(true)}</HeaderCombinedQuery>,
                primaryAction: <HeaderAction label="New form" icon={<Plus className="h-4 w-4" />} onClick={handleCreateForm} />,
            }}
        >
            {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
                <OnboardingModal
                    isOpen={showOnboarding}
                    onClose={closeOnboarding}
                    onComplete={completeOnboarding}
                    onDismiss={dismissOnboarding}
                    content={ONBOARDING_CONTENT[onboardingFeatureKey]}
                />
            )}
            {!loadError && (
                <FramedSection title="Overview" icon={PieChart} className="mb-6">
                    <ResponsiveCardRail label="Form status summary" desktopColumns="md:grid-cols-2 lg:grid-cols-4" className="responsive-stat-summary mb-0">
                        <StatCard title="Archived forms" badgeText="Archived" value={stats.archived} icon={Archive} description={`${stats.archived} unavailable`} colorTheme="red" isLoading={loading} />
                        <StatCard title="Total forms" badgeText="Total" value={stats.total} icon={FileText} description={`${stats.total} configured`} colorTheme="blue" isLoading={loading} />
                        <StatCard title="Draft forms" badgeText="Draft" value={stats.draft} icon={Pencil} description={`${stats.draft} being prepared`} colorTheme="blue" isLoading={loading} />
                        <StatCard title="Published forms" badgeText="Published" value={stats.published} icon={Eye} description={`${stats.published} live`} colorTheme="green" isLoading={loading} />
                    </ResponsiveCardRail>
                </FramedSection>
            )}

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="space-y-4 p-6">{[...Array(4)].map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
                    ) : loadError ? (
                        <ErrorState title="Forms unavailable" description={loadError} icon={FileText} onAction={() => void formsQuery.refetch()} className="p-12" />
                    ) : forms.length === 0 ? (
                            <EmptyState
                                icon={FileText}
                                kind={hasQuery ? 'results' : 'collection'}
                                title={hasQuery ? 'No matching forms' : 'No forms yet'}
                                description={hasQuery ? undefined : 'Create a form to start collecting responses.'}
                                actionLabel={hasQuery ? 'Clear filters' : 'New form'}
                                onAction={hasQuery ? clearQuery : handleCreateForm}
                                className="p-12"
                            />
                    ) : (
                        <div className="divide-y">
                            {forms.map((form) => {
                                const visual = getContentStatusVisual(form.status);
                                const StatusIcon = visual.icon;
                                const isExpanded = expandedFormId === form.id;
                                const previewData = isExpanded && expandedFormData?.id === form.id ? expandedFormData : null;
                                return (
                                    <div key={form.id}>
                                        <div role="button" tabIndex={0} aria-expanded={isExpanded} aria-controls={`form-preview-${form.id}`} aria-label={`${isExpanded ? 'Collapse' : 'Preview'} ${form.name}`} className="group flex cursor-pointer items-center gap-3 px-3 py-4 interaction-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4" onClick={() => void toggleExpanded(form)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void toggleExpanded(form); } }}>
                                            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}>
                                                <StatusIcon className={cn('h-5 w-5', visual.iconClass)} aria-hidden="true" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <h3 className="truncate text-sm font-medium md:text-base">{form.name}</h3>
                                                    <Badge className={cn('shrink-0 text-xs', visual.badgeClass)}>{visual.label}</Badge>
                                                </div>
                                                {form.description && <p className="mt-1 truncate text-sm text-muted-foreground">{form.description}</p>}
                                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                    <span>{form.type === 'form' ? 'Form' : form.type === 'survey' ? 'Survey' : 'Quiz'}</span>
                                                    <span>{form.field_count || 0} fields</span>
                                                    <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />{form.submission_count || 0} submissions</span>
                                                    <span className="truncate">{publicFormPath(form.public_id || form.slug)}</span>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1" onClick={event => event.stopPropagation()}>
                                                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`${isExpanded ? 'Collapse' : 'Preview'} ${form.name}`} onClick={() => void toggleExpanded(form)}>
                                                    <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`More actions for ${form.name}`}>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                        <DropdownMenuItem onClick={() => navigate(`/forms/${form.id}`)} className="group/menu">
                                                            <Pencil className="h-4 w-4 mr-2" />Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => void openFullPreview(form)} className="group/menu">
                                                            <Maximize2 className="h-4 w-4 mr-2" />Full preview
                                                        </DropdownMenuItem>
                                                        {form.status === 'published' ? (
                                                            <DropdownMenuItem onClick={() => handleToggleStatus(form, 'draft')} className="group/menu">
                                                                <EyeOff className="h-4 w-4 mr-2" />Unpublish
                                                            </DropdownMenuItem>
                                                        ) : (
                                                            <DropdownMenuItem onClick={() => handleToggleStatus(form, 'published')} className="group/menu">
                                                                <Eye className="h-4 w-4 mr-2" />Publish
                                                            </DropdownMenuItem>
                                                        )}
                                                        {form.status === 'published' && <DropdownMenuItem onClick={() => copyFormLink(form.public_id || form.slug)} className="group/menu">
                                                            <Copy className="h-4 w-4 mr-2" />Copy Link
                                                        </DropdownMenuItem>}
                                                        <DropdownMenuItem onClick={() => handleDuplicate(form.id)} className="group/menu">
                                                            <Copy className="h-4 w-4 mr-2" />Duplicate
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => setFormToDelete(form)} className="text-destructive focus:text-destructive">
                                                            <Trash2 className="h-4 w-4 mr-2" />Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div id={`form-preview-${form.id}`} className="border-t bg-muted/30 px-3 py-6 sm:px-6">
                                                <ExpandedRowActions>
                                                    <Button variant="outline" size="sm" onClick={() => navigate(`/forms/${form.id}`)}>
                                                        <Pencil className="h-4 w-4" /><ExpandedRowActionLabel full="Edit form" compact="Edit" />
                                                    </Button>
                                                    <Button size="sm" className="bg-blue-600 text-white interaction-button--primary" disabled={!previewData} onClick={() => previewData && setPreviewForm(previewData)}>
                                                        <Maximize2 className="h-4 w-4" /><ExpandedRowActionLabel full="Full preview" compact="Preview" />
                                                    </Button>
                                                    <Button size="sm" className="bg-blue-600 text-white interaction-button--primary" onClick={() => handleToggleStatus(form, form.status === 'published' ? 'draft' : 'published')}>
                                                        {form.status === 'published' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                        <ExpandedRowActionLabel full={form.status === 'published' ? 'Unpublish form' : 'Publish form'} compact={form.status === 'published' ? 'Unpublish' : 'Publish'} />
                                                    </Button>
                                                    {form.status === 'published' && <Button size="sm" className="bg-blue-600 text-white interaction-button--primary" onClick={() => copyFormLink(form.public_id || form.slug)}>
                                                        <Copy className="h-4 w-4" /><ExpandedRowActionLabel full="Copy public link" compact="Copy" />
                                                    </Button>}
                                                    <Button size="sm" className="bg-blue-600 text-white interaction-button--primary" onClick={() => handleDuplicate(form.id)}>
                                                        <Copy className="h-4 w-4" /><ExpandedRowActionLabel full="Duplicate form" compact="Duplicate" />
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="border-destructive/30 text-destructive interaction-button--destructive-ghost" onClick={() => setFormToDelete(form)}>
                                                        <Trash2 className="h-4 w-4" /><ExpandedRowActionLabel full="Delete form" compact="Delete" />
                                                    </Button>
                                                </ExpandedRowActions>
                                                {loadingExpandedId === form.id ? (
                                                    <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading preview...</div>
                                                ) : previewData ? (
                                                    <div className="mx-auto max-h-[44rem] max-w-5xl overflow-auto rounded-lg border bg-background shadow-sm">
                                                        <FormPreviewCanvas form={previewData} idPrefix={`form-preview-inline-${form.id}`} />
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
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
                        {pagination.total} form{pagination.total === 1 ? '' : 's'}
                    </p>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <Button variant="outline" size="sm" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={formsQuery.isFetching || pagination.page <= 1}>Previous</Button>
                        <span className="min-w-20 text-center text-sm text-muted-foreground">{pagination.page} of {pagination.totalPages}</span>
                        <Button variant="outline" size="sm" onClick={() => setPage(current => Math.min(pagination.totalPages, current + 1))} disabled={formsQuery.isFetching || pagination.page >= pagination.totalPages}>Next</Button>
                    </div>
                </div>
            )}
            <DeleteDialog
                open={Boolean(formToDelete)}
                onOpenChange={(open) => { if (!open) setFormToDelete(null); }}
                onConfirm={handleDelete}
                itemType="form"
                itemTitle={formToDelete?.name}
            />
            {previewForm && <FormPreviewDialog open={Boolean(previewForm)} onOpenChange={open => { if (!open) setPreviewForm(null); }} form={previewForm} />}
        </PageLayout>
    );
}

export default FormsPage;
