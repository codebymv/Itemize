import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Layout, MoreHorizontal, Trash2, Copy, Eye, EyeOff, BarChart3, Pencil, Archive, ChevronDown, Maximize2, Loader2, PieChart } from 'lucide-react';
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
import { useOrganization } from '@/hooks/useOrganization';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { getPages, getPage, updatePage, deletePage, duplicatePage, createPage, type Page } from '@/services/pagesApi';
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
import { LandingPagePreviewFrame } from '@/components/LandingPagePreviewFrame';
import { PagePreviewDialog } from '@/components/PagePreviewDialog';
import { landingPageQueryKeys } from '@/services/landingPageQueryKeys';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';

type LandingPage = Page & {
    conversions: number;
};

const PAGE_SIZE = 20;

export function LandingPagesPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    // Onboarding
    const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('pages');

    const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [page, setPage] = useState(1);
    const [pageToDelete, setPageToDelete] = useState<LandingPage | null>(null);
    const [expandedPageId, setExpandedPageId] = useState<number | null>(null);
    const [expandedPageData, setExpandedPageData] = useState<LandingPage | null>(null);
    const [loadingExpandedId, setLoadingExpandedId] = useState<number | null>(null);
    const [previewPage, setPreviewPage] = useState<LandingPage | null>(null);
    const previewRequestId = useRef(0);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [searchQuery]);

    useEffect(() => {
        setPage(1);
        setExpandedPageId(null);
        setExpandedPageData(null);
    }, [debouncedSearch, statusFilter]);

    const listParams = {
        status: statusFilter,
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE,
    };
    const pagesQuery = useQuery({
        queryKey: landingPageQueryKeys.page(organizationId, listParams),
        queryFn: ({ signal }) => getPages({
            status: statusFilter as Page['status'] | 'all',
            search: debouncedSearch || undefined,
            page,
            limit: PAGE_SIZE,
        }, organizationId!, signal),
        enabled: Boolean(organizationId) && !initError,
        staleTime: QUERY_STALE_TIME_MS,
        retry: shouldRetryQuery,
        placeholderData: keepPreviousData,
    });
    const pages: LandingPage[] = (pagesQuery.data?.pages ?? []).map((entry) => ({
        ...entry,
        conversions: 0,
    }));
    const pagination = pagesQuery.data?.pagination ?? {
        page, limit: PAGE_SIZE, total: 0, totalPages: 0,
    };
    const stats = pagesQuery.data?.stats ?? {
        total: 0, draft: 0, published: 0, archived: 0,
    };
    const loading = orgLoading || (Boolean(organizationId) && pagesQuery.isPending);
    const loadError = pagesQuery.isError ? toastMessages.failedToLoad('pages') : null;

    useEffect(() => {
        if (!pagesQuery.data) return;
        const lastAvailablePage = Math.max(1, pagination.totalPages);
        if (page > lastAvailablePage) setPage(lastAvailablePage);
    }, [page, pagesQuery.data, pagination.totalPages]);

    const handleCreatePage = async () => {
        if (!organizationId) return;
        try {
            const newPage = await createPage({ name: 'New Page' }, organizationId);
            navigate(`/pages/${newPage.id}`);
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToCreate('page'), variant: 'destructive' });
        }
    };

    const handleToggleStatus = async (page: LandingPage, newStatus: 'published' | 'draft') => {
        if (!organizationId) return;
        try {
            await updatePage(page.id, { status: newStatus }, organizationId);
            await queryClient.invalidateQueries({
                queryKey: landingPageQueryKeys.pages(organizationId),
            });
            setExpandedPageData(current => current?.id === page.id ? { ...current, status: newStatus } : current);
            setPreviewPage(current => current?.id === page.id ? { ...current, status: newStatus } : current);
            toast({ title: newStatus === 'published' ? 'Page published' : 'Page unpublished' });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToUpdate('page'), variant: 'destructive' });
        }
    };

const handleDuplicate = async (id: number) => {
        if (!organizationId) return;
        try {
            await duplicatePage(id, organizationId);
            await queryClient.invalidateQueries({
                queryKey: landingPageQueryKeys.pages(organizationId),
            });
            toast({ title: 'Duplicated', description: toastMessages.duplicated('page') });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToDuplicate('page'), variant: 'destructive' });
        }
    };

    const handleDelete = async (): Promise<boolean> => {
        if (!organizationId || !pageToDelete) return false;
        try {
            await deletePage(pageToDelete.id, organizationId);
            await queryClient.invalidateQueries({
                queryKey: landingPageQueryKeys.pages(organizationId),
            });
            setExpandedPageId(current => current === pageToDelete.id ? null : current);
            setExpandedPageData(current => current?.id === pageToDelete.id ? null : current);
            setPageToDelete(null);
            return true;
        } catch (error) {
            return false;
        }
    };

    const copyPageLink = (slug: string) => {
        navigator.clipboard.writeText(`${window.location.origin}/p/${slug}`);
        toast({ title: 'Link Copied', description: toastMessages.copiedToClipboard('page link') });
    };

    const loadFullPage = async (page: LandingPage): Promise<LandingPage> => {
        if (page.sections && page.sections.length > 0) return page;
        const fullPage = await getPage(page.id, organizationId || undefined);
        return { ...fullPage, conversions: page.conversions };
    };

    const toggleExpanded = async (page: LandingPage) => {
        if (expandedPageId === page.id) {
            previewRequestId.current += 1;
            setExpandedPageId(null);
            setExpandedPageData(null);
            setLoadingExpandedId(null);
            return;
        }
        const requestId = previewRequestId.current + 1;
        previewRequestId.current = requestId;
        setExpandedPageId(page.id);
        setExpandedPageData(null);
        setLoadingExpandedId(page.id);
        try {
            const fullPage = await loadFullPage(page);
            if (previewRequestId.current === requestId) setExpandedPageData(fullPage);
        } catch {
            if (previewRequestId.current === requestId) {
                setExpandedPageId(null);
                toast({ title: 'Preview unavailable', description: 'The page preview could not be loaded.', variant: 'destructive' });
            }
        } finally {
            if (previewRequestId.current === requestId) setLoadingExpandedId(null);
        }
    };

    const openFullPreview = async (page: LandingPage) => {
        if (expandedPageData?.id === page.id) {
            setPreviewPage(expandedPageData);
            return;
        }
        try {
            setPreviewPage(await loadFullPage(page));
        } catch {
            toast({ title: 'Preview unavailable', description: 'The page preview could not be loaded.', variant: 'destructive' });
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
            <SelectTrigger className={compact ? 'h-11 w-full' : 'h-9 w-[9rem]'} aria-label="Filter pages by status">
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
                title="LANDING PAGES"
                icon={<Layout className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
            >
                <OrganizationErrorState title="Unable to load pages" icon={Layout} />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="PAGES"
            icon={<Layout className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
            headerTools={{
                search: <HeaderSearch label="Search pages" placeholder="Search pages..." value={searchQuery} onChange={setSearchQuery} width="wide" />,
                filters: <HeaderFilters label="Filter pages by status" activeCount={Number(statusFilter !== 'all')} compactChildren={statusSelect(true)} preferExpanded="when-roomy">{statusSelect()}</HeaderFilters>,
                combinedQuery: <HeaderCombinedQuery label="Search and filter pages" placeholder="Search pages..." value={searchQuery} onChange={setSearchQuery} activeCount={Number(Boolean(normalizedQuery)) + Number(statusFilter !== 'all')}>{statusSelect(true)}</HeaderCombinedQuery>,
                primaryAction: <HeaderAction label="New page" icon={<Plus className="h-4 w-4" />} onClick={handleCreatePage} />,
            }}
        >
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={closeOnboarding}
                onComplete={completeOnboarding}
                onDismiss={dismissOnboarding}
                content={ONBOARDING_CONTENT.pages}
            />
            {!loadError && (
                <FramedSection title="Overview" icon={PieChart} className="mb-6">
                <ResponsiveCardRail label="Page status summary" desktopColumns="md:grid-cols-2 lg:grid-cols-4" className="responsive-stat-summary mb-0">
                    <StatCard title="Archived pages" badgeText="Archived" value={stats.archived} icon={Archive} description={`${stats.archived} unavailable`} colorTheme="red" isLoading={loading} />
                    <StatCard title="Total pages" badgeText="Total" value={stats.total} icon={Layout} description={`${stats.total} configured`} colorTheme="blue" isLoading={loading} />
                    <StatCard title="Draft pages" badgeText="Draft" value={stats.draft} icon={Pencil} description={`${stats.draft} being prepared`} colorTheme="blue" isLoading={loading} />
                    <StatCard title="Published pages" badgeText="Published" value={stats.published} icon={Eye} description={`${stats.published} live`} colorTheme="green" isLoading={loading} />
                </ResponsiveCardRail>
                </FramedSection>
            )}

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="space-y-4 p-6">{[...Array(4)].map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
                    ) : loadError ? (
                        <ErrorState title="Pages unavailable" description={loadError} icon={Layout} onAction={() => void pagesQuery.refetch()} className="p-12" />
                    ) : pages.length === 0 ? (
                        <EmptyState
                            icon={Layout}
                            kind={hasQuery ? 'results' : 'collection'}
                            title={hasQuery ? 'No matching pages' : 'No pages yet'}
                            description={hasQuery ? undefined : 'Create a page to publish content and capture leads.'}
                            actionLabel={hasQuery ? 'Clear filters' : 'New page'}
                            onAction={hasQuery ? clearQuery : handleCreatePage}
                            className="p-12"
                        />
                    ) : (
                        <div className="divide-y">
                            {pages.map((page) => {
                                const visual = getContentStatusVisual(page.status);
                                const StatusIcon = visual.icon;
                                const isExpanded = expandedPageId === page.id;
                                const previewData = isExpanded && expandedPageData?.id === page.id ? expandedPageData : null;
                                return (
                                <div key={page.id}>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        aria-expanded={isExpanded}
                                        aria-controls={`page-preview-${page.id}`}
                                        aria-label={`${isExpanded ? 'Collapse' : 'Preview'} ${page.name}`}
                                        className="group flex cursor-pointer items-center gap-3 px-3 py-4 interaction-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
                                        onClick={() => void toggleExpanded(page)}
                                        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void toggleExpanded(page); } }}
                                    >
                                        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}>
                                            <StatusIcon className={cn('h-5 w-5', visual.iconClass)} aria-hidden="true" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <h3 className="truncate text-sm font-medium md:text-base">{page.name}</h3>
                                                <Badge className={cn('shrink-0 text-xs', visual.badgeClass)}>{visual.label}</Badge>
                                            </div>
                                            {page.description && <p className="mt-1 truncate text-sm text-muted-foreground">{page.description}</p>}
                                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />{page.view_count || 0} views</span>
                                                <span>{page.conversions} conversions</span>
                                                <span className="truncate">/p/{page.slug}</span>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`${isExpanded ? 'Collapse' : 'Preview'} ${page.name}`} onClick={() => void toggleExpanded(page)}>
                                                <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`More actions for ${page.name}`}>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenuItem onClick={() => navigate(`/pages/${page.id}`)} className="group/menu">
                                                        <Pencil className="h-4 w-4 mr-2" />Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => void openFullPreview(page)} className="group/menu">
                                                        <Maximize2 className="h-4 w-4 mr-2" />Full preview
                                                    </DropdownMenuItem>
                                                    {page.status === 'published' ? (
                                                        <DropdownMenuItem onClick={() => handleToggleStatus(page, 'draft')} className="group/menu">
                                                            <EyeOff className="h-4 w-4 mr-2" />Unpublish
                                                        </DropdownMenuItem>
                                                    ) : (
                                                        <DropdownMenuItem onClick={() => handleToggleStatus(page, 'published')} className="group/menu">
                                                            <Eye className="h-4 w-4 mr-2" />Publish
                                                        </DropdownMenuItem>
                                                    )}
                                                    {page.status === 'published' && <DropdownMenuItem onClick={() => copyPageLink(page.slug)} className="group/menu">
                                                        <Copy className="h-4 w-4 mr-2" />Copy link
                                                    </DropdownMenuItem>}
                                                    <DropdownMenuItem onClick={() => handleDuplicate(page.id)} className="group/menu">
                                                        <Copy className="h-4 w-4 mr-2" />Duplicate
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => setPageToDelete(page)} className="text-destructive focus:text-destructive">
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div id={`page-preview-${page.id}`} className="border-t bg-muted/30 px-3 py-6 sm:px-6">
                                            <ExpandedRowActions>
                                                <Button variant="outline" size="sm" onClick={() => navigate(`/pages/${page.id}`)}>
                                                    <Pencil className="h-4 w-4" /><ExpandedRowActionLabel full="Edit page" compact="Edit" />
                                                </Button>
                                                <Button size="sm" className="bg-blue-600 text-white interaction-button--primary" disabled={!previewData} onClick={() => previewData && setPreviewPage(previewData)}>
                                                    <Maximize2 className="h-4 w-4" /><ExpandedRowActionLabel full="Full preview" compact="Preview" />
                                                </Button>
                                                <Button size="sm" className="bg-blue-600 text-white interaction-button--primary" onClick={() => handleToggleStatus(page, page.status === 'published' ? 'draft' : 'published')}>
                                                    {page.status === 'published' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    <ExpandedRowActionLabel full={page.status === 'published' ? 'Unpublish page' : 'Publish page'} compact={page.status === 'published' ? 'Unpublish' : 'Publish'} />
                                                </Button>
                                                {page.status === 'published' && <Button size="sm" className="bg-blue-600 text-white interaction-button--primary" onClick={() => copyPageLink(page.slug)}>
                                                    <Copy className="h-4 w-4" /><ExpandedRowActionLabel full="Copy public link" compact="Copy" />
                                                </Button>}
                                                <Button size="sm" className="bg-blue-600 text-white interaction-button--primary" onClick={() => handleDuplicate(page.id)}>
                                                    <Copy className="h-4 w-4" /><ExpandedRowActionLabel full="Duplicate page" compact="Duplicate" />
                                                </Button>
                                                <Button size="sm" variant="outline" className="border-destructive/30 text-destructive interaction-button--destructive-ghost" onClick={() => setPageToDelete(page)}>
                                                    <Trash2 className="h-4 w-4" /><ExpandedRowActionLabel full="Delete page" compact="Delete" />
                                                </Button>
                                            </ExpandedRowActions>
                                            {loadingExpandedId === page.id ? (
                                                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading preview...</div>
                                            ) : previewData ? (
                                                <div className="mx-auto h-[clamp(24rem,62vh,44rem)] max-w-5xl overflow-hidden rounded-lg border bg-white shadow-sm">
                                                    <LandingPagePreviewFrame page={previewData} title={`${page.name} inline preview`} />
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
                        {pagination.total} page{pagination.total === 1 ? '' : 's'}
                    </p>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <Button variant="outline" size="sm" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={pagesQuery.isFetching || pagination.page <= 1}>Previous</Button>
                        <span className="min-w-20 text-center text-sm text-muted-foreground">{pagination.page} of {pagination.totalPages}</span>
                        <Button variant="outline" size="sm" onClick={() => setPage(current => Math.min(pagination.totalPages, current + 1))} disabled={pagesQuery.isFetching || pagination.page >= pagination.totalPages}>Next</Button>
                    </div>
                </div>
            )}
            <DeleteDialog
                open={Boolean(pageToDelete)}
                onOpenChange={(open) => { if (!open) setPageToDelete(null); }}
                onConfirm={handleDelete}
                itemType="page"
                itemTitle={pageToDelete?.name}
            />
            {previewPage && organizationId && (
                <PagePreviewDialog open={Boolean(previewPage)} onOpenChange={open => { if (!open) setPreviewPage(null); }} page={previewPage} organizationId={organizationId} />
            )}
        </PageLayout>
    );
}

export default LandingPagesPage;
