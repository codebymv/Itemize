import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, MoreHorizontal, Trash2, Copy, Eye, EyeOff, BarChart3, Pencil, Archive, ChevronDown, Maximize2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { getForms, getForm, updateForm, deleteForm, duplicateForm, createForm } from '@/services/formsApi';
import { useOrganization } from '@/hooks/useOrganization';
import { PageLayout } from '@/components/layout/PageLayout';
import { HeaderAction, HeaderCombinedQuery, HeaderFilters, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { MobileQueryBar } from '@/components/layout/MobileQueryBar';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { StatCard } from '@/components/StatCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { cn } from '@/lib/utils';
import { getContentStatusVisual } from '@/pages/contentVisuals';
import { ExpandedRowActionLabel, ExpandedRowActions } from '@/components/ui/expanded-row';
import { FormPreviewCanvas } from '@/components/forms/FormPreviewCanvas';
import { FormPreviewDialog } from '@/components/forms/FormPreviewDialog';
import { publicFormPath } from '@/lib/publicContentRoutes';

export function FormsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();

    // Route-aware onboarding (will show 'pages' onboarding for Pages & Forms group)
    const {
        showModal: showOnboarding,
        handleComplete: completeOnboarding,
        handleDismiss: dismissOnboarding,
        handleClose: closeOnboarding,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const [forms, setForms] = useState<Form[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [formToDelete, setFormToDelete] = useState<Form | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
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
        if (orgLoading) {
            setLoading(true);
            return;
        }

        if (!organizationId) {
            setLoading(false);
        }
    }, [organizationId, initError, orgLoading]);

    const fetchForms = useCallback(async () => {
        if (!organizationId) {
            if (!orgLoading) {
                setForms([]);
                setLoading(false);
            }
            return;
        }
        setLoading(true);
        setLoadError(null);
        try {
            const response = await getForms(organizationId);
            setForms(response.forms);
        } catch (error) {
            setLoadError(toastMessages.failedToLoad('forms'));
        } finally {
            setLoading(false);
        }
    }, [organizationId, orgLoading]);

    useEffect(() => {
        fetchForms();
    }, [fetchForms]);

    const handleToggleStatus = async (form: Form, newStatus: 'published' | 'draft') => {
        if (!organizationId) return;
        try {
            await updateForm(form.id, { status: newStatus }, organizationId);
            setForms(prev => prev.map(f => f.id === form.id ? { ...f, status: newStatus } : f));
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
            const copy = await duplicateForm(id, organizationId);
            setForms(prev => [copy, ...prev]);
            toast({ title: 'Duplicated', description: toastMessages.duplicated('form') });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToDuplicate('form'), variant: 'destructive' });
        }
    };

    const handleDelete = async (): Promise<boolean> => {
        if (!organizationId || !formToDelete) return false;
        try {
            await deleteForm(formToDelete.id, organizationId);
            setForms(prev => prev.filter(f => f.id !== formToDelete.id));
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

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredForms = forms.filter(form =>
        (statusFilter === 'all' || form.status === statusFilter) &&
        (!normalizedQuery || form.name.toLowerCase().includes(normalizedQuery) || form.description?.toLowerCase().includes(normalizedQuery))
    );
    const hasQuery = Boolean(normalizedQuery || statusFilter !== 'all');
    const clearQuery = () => {
        setSearchQuery('');
        setStatusFilter('all');
    };
    const stats = {
        archived: forms.filter(form => form.status === 'archived').length,
        total: forms.length,
        draft: forms.filter(form => form.status === 'draft').length,
        published: forms.filter(form => form.status === 'published').length,
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
                icon={<FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />}
            >
                <ErrorState
                    description={initError}
                    icon={FileText}
                    onAction={() => void fetchForms()}
                />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="FORMS"
            icon={<FileText className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
            mobileClassName="items-stretch"
            desktopTools={{
                search: <HeaderSearch label="Search forms" placeholder="Search forms..." value={searchQuery} onChange={setSearchQuery} width="wide" />,
                filters: <HeaderFilters label="Filter forms by status" activeCount={Number(statusFilter !== 'all')} compactChildren={statusSelect(true)} preferExpanded="when-roomy">{statusSelect()}</HeaderFilters>,
                combinedQuery: <HeaderCombinedQuery label="Search and filter forms" placeholder="Search forms..." value={searchQuery} onChange={setSearchQuery} activeCount={Number(Boolean(normalizedQuery)) + Number(statusFilter !== 'all')}>{statusSelect(true)}</HeaderCombinedQuery>,
                primaryAction: <HeaderAction label="New form" icon={<Plus className="h-4 w-4" />} onClick={handleCreateForm} />,
            }}
            mobileActions={
                <MobileQueryBar
                    search={<div className="relative min-w-0 flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            aria-label="Search forms"
                            placeholder="Search forms..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-11 w-full bg-muted/20 pl-10"
                        />
                    </div>}
                    filters={<HeaderCombinedQuery label="Search and filter forms" placeholder="Search forms..." value={searchQuery} onChange={setSearchQuery} activeCount={Number(Boolean(normalizedQuery)) + Number(statusFilter !== 'all')}>{statusSelect(true)}</HeaderCombinedQuery>}
                    actions={<Button size="icon" aria-label="New form" className="h-11 w-11 shrink-0 bg-blue-600 text-white hover:bg-blue-700" onClick={handleCreateForm}><Plus className="h-4 w-4" /></Button>}
                />
            }
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
                <ResponsiveCardRail label="Form status summary" desktopColumns="md:grid-cols-2 lg:grid-cols-4" className="responsive-stat-summary">
                    <StatCard title="Archived forms" badgeText="Archived" value={stats.archived} icon={Archive} description={`${stats.archived} unavailable`} colorTheme="red" isLoading={loading} />
                    <StatCard title="Total forms" badgeText="Total" value={stats.total} icon={FileText} description={`${stats.total} configured`} colorTheme="blue" isLoading={loading} />
                    <StatCard title="Draft forms" badgeText="Draft" value={stats.draft} icon={Pencil} description={`${stats.draft} being prepared`} colorTheme="blue" isLoading={loading} />
                    <StatCard title="Published forms" badgeText="Published" value={stats.published} icon={Eye} description={`${stats.published} live`} colorTheme="green" isLoading={loading} />
                </ResponsiveCardRail>
            )}

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="space-y-4 p-6">{[...Array(4)].map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
                    ) : loadError ? (
                        <ErrorState title="Forms unavailable" description={loadError} icon={FileText} onAction={() => void fetchForms()} className="p-12" />
                    ) : filteredForms.length === 0 ? (
                            <EmptyState
                                icon={FileText}
                                title={hasQuery ? 'No matching forms' : 'No forms yet'}
                                description={hasQuery ? 'Try a different search or clear the current filters.' : 'Create a form to start collecting responses.'}
                                actionLabel={hasQuery ? 'Clear filters' : 'New form'}
                                onAction={hasQuery ? clearQuery : handleCreateForm}
                                className="p-12"
                            />
                    ) : (
                        <div className="divide-y">
                            {filteredForms.map((form) => {
                                const visual = getContentStatusVisual(form.status);
                                const StatusIcon = visual.icon;
                                const isExpanded = expandedFormId === form.id;
                                const previewData = isExpanded && expandedFormData?.id === form.id ? expandedFormData : null;
                                return (
                                    <div key={form.id}>
                                        <div role="button" tabIndex={0} aria-expanded={isExpanded} aria-controls={`form-preview-${form.id}`} aria-label={`${isExpanded ? 'Collapse' : 'Preview'} ${form.name}`} className="group flex cursor-pointer items-center gap-3 px-3 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4" onClick={() => void toggleExpanded(form)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void toggleExpanded(form); } }}>
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
                                                            <Pencil className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => void openFullPreview(form)} className="group/menu">
                                                            <Maximize2 className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Full preview
                                                        </DropdownMenuItem>
                                                        {form.status === 'published' ? (
                                                            <DropdownMenuItem onClick={() => handleToggleStatus(form, 'draft')} className="group/menu">
                                                                <EyeOff className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Unpublish
                                                            </DropdownMenuItem>
                                                        ) : (
                                                            <DropdownMenuItem onClick={() => handleToggleStatus(form, 'published')} className="group/menu">
                                                                <Eye className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Publish
                                                            </DropdownMenuItem>
                                                        )}
                                                        {form.status === 'published' && <DropdownMenuItem onClick={() => copyFormLink(form.public_id || form.slug)} className="group/menu">
                                                            <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Copy Link
                                                        </DropdownMenuItem>}
                                                        <DropdownMenuItem onClick={() => handleDuplicate(form.id)} className="group/menu">
                                                            <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Duplicate
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
                                                    <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" disabled={!previewData} onClick={() => previewData && setPreviewForm(previewData)}>
                                                        <Maximize2 className="h-4 w-4" /><ExpandedRowActionLabel full="Full preview" compact="Preview" />
                                                    </Button>
                                                    <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => handleToggleStatus(form, form.status === 'published' ? 'draft' : 'published')}>
                                                        {form.status === 'published' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                        <ExpandedRowActionLabel full={form.status === 'published' ? 'Unpublish form' : 'Publish form'} compact={form.status === 'published' ? 'Unpublish' : 'Publish'} />
                                                    </Button>
                                                    {form.status === 'published' && <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => copyFormLink(form.public_id || form.slug)}>
                                                        <Copy className="h-4 w-4" /><ExpandedRowActionLabel full="Copy public link" compact="Copy" />
                                                    </Button>}
                                                    <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => handleDuplicate(form.id)}>
                                                        <Copy className="h-4 w-4" /><ExpandedRowActionLabel full="Duplicate form" compact="Duplicate" />
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setFormToDelete(form)}>
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
