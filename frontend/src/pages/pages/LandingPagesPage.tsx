import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Layout, MoreHorizontal, Trash2, Copy, Eye, EyeOff, BarChart3, Pencil, Monitor, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { getStatusBadgeClass } from '@/lib/badge-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { useOrganization } from '@/hooks/useOrganization';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { getPages, updatePage, deletePage, duplicatePage, createPage } from '@/services/pagesApi';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { formatStatus, titleCase } from '@/utils/textUtils';

interface LandingPage {
    id: number;
    name: string;
    slug: string;
    description?: string;
    status: 'draft' | 'published' | 'archived';
    views: number;
    conversions: number;
    created_at: string;
    updated_at: string;
}

type LandingPageStatus = LandingPage['status'];

const LANDING_PAGE_STATUSES: LandingPageStatus[] = ['draft', 'published', 'archived'];

const isLandingPageStatus = (value: string): value is LandingPageStatus =>
    LANDING_PAGE_STATUSES.includes(value as LandingPageStatus);

export function LandingPagesPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    // Onboarding
    const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('pages');

    const [pages, setPages] = useState<LandingPage[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [pageToDelete, setPageToDelete] = useState<LandingPage | null>(null);

    useEffect(() => {
        if (orgLoading) {
            setLoading(true);
            return;
        }

        if (!organizationId) {
            setLoading(false);
        }
    }, [organizationId, initError, orgLoading]);

    const fetchPages = useCallback(async () => {
        if (!organizationId) {
            if (!orgLoading) {
                setPages([]);
                setLoading(false);
            }
            return;
        }
        setLoading(true);
        try {
            const response = await getPages(
                { status: statusFilter !== 'all' && isLandingPageStatus(statusFilter) ? statusFilter : undefined },
                organizationId
            );
            setPages((response.pages || []).map(p => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                description: p.description,
                status: p.status,
                views: p.view_count || 0,
                conversions: 0, // Would come from analytics
                created_at: p.created_at,
                updated_at: p.updated_at,
            })));
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToLoad('pages'), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, orgLoading, statusFilter, toast]);

    useEffect(() => {
        fetchPages();
    }, [fetchPages]);

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
            setPages(prev => prev.map(p => p.id === page.id ? { ...p, status: newStatus } : p));
            toast({ title: newStatus === 'published' ? 'Page published' : 'Page unpublished' });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToUpdate('page'), variant: 'destructive' });
        }
    };

const handleDuplicate = async (id: number) => {
        if (!organizationId) return;
        try {
            const copy = await duplicatePage(id, organizationId);
            setPages(prev => [{
                id: copy.id,
                name: copy.name,
                slug: copy.slug,
                description: copy.description,
                status: copy.status,
                views: copy.view_count || 0,
                conversions: 0,
                created_at: copy.created_at,
                updated_at: copy.updated_at,
            } as LandingPage, ...prev]);
            toast({ title: 'Duplicated', description: toastMessages.duplicated('page') });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToDuplicate('page'), variant: 'destructive' });
        }
    };

    const handleDelete = async (): Promise<boolean> => {
        if (!organizationId || !pageToDelete) return false;
        try {
            await deletePage(pageToDelete.id, organizationId);
            setPages(prev => prev.filter(p => p.id !== pageToDelete.id));
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

    const filteredPages = pages.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (initError) {
        return (
            <PageLayout
                title="LANDING PAGES"
                icon={<Layout className="h-5 w-5 text-blue-600 flex-shrink-0" />}
            >
                <ErrorState
                    description={initError}
                    icon={Layout}
                    onAction={() => void fetchPages()}
                />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="LANDING PAGES"
            icon={<Layout className="h-5 w-5 text-blue-600 flex-shrink-0" />}
            mobileClassName="flex-col items-stretch"
            pageActions={
                <>
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search pages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                            aria-label="Search landing pages"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[120px] h-9">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="published">Published</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={handleCreatePage}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Page
                    </Button>
                </>
            }
            mobileActions={
                <>
                    <div className="flex items-center gap-2 w-full">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                            <Input
                                placeholder="Search pages..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
                            />
                        </div>
                        <Button
                            size="icon"
                            className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9"
                            onClick={handleCreatePage}
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="flex items-center gap-2 w-full">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="flex-1 h-9">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="published">Published</SelectItem>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="archived">Archived</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </>
            }
        >
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={closeOnboarding}
                onComplete={completeOnboarding}
                onDismiss={dismissOnboarding}
                content={ONBOARDING_CONTENT.pages}
            />

                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                        </div>
                    ) : filteredPages.length === 0 ? (
                        <EmptyState
                            icon={Layout}
                            title="No landing pages yet"
                            description="Create beautiful landing pages to capture leads"
                            actionLabel="Create Page"
                            onAction={handleCreatePage}
                            className="p-12"
                        />
                    ) : (
                        <div className="divide-y">
                            {filteredPages.map((page) => (
                                <div
                                    key={page.id}
                                    className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => navigate(`/pages/${page.id}`)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4 min-w-0 flex-1">
                                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                                <Layout className="h-4 w-4 text-blue-600" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-sm md:text-base truncate">{page.name}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenuItem onClick={() => navigate(`/pages/${page.id}`)} className="group/menu">
                                                        <Pencil className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Edit
                                                    </DropdownMenuItem>
                                                    {page.status === 'published' ? (
                                                        <DropdownMenuItem onClick={() => handleToggleStatus(page, 'draft')} className="group/menu">
                                                            <EyeOff className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Unpublish
                                                        </DropdownMenuItem>
                                                    ) : (
                                                        <DropdownMenuItem onClick={() => handleToggleStatus(page, 'published')} className="group/menu">
                                                            <Eye className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Publish
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => copyPageLink(page.slug)} className="group/menu">
                                                        <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Copy Link
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDuplicate(page.id)} className="group/menu">
                                                        <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Duplicate
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => setPageToDelete(page)} className="text-destructive focus:text-destructive">
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                    <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                        {page.description && (
                                            <span className="text-sm text-muted-foreground truncate max-w-full">{page.description}</span>
                                        )}
                                        <Badge className={`text-xs ${getStatusBadgeClass(page.status)}`}>{formatStatus(page.status)}</Badge>
                                    </div>
                                    <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <BarChart3 className="h-3 w-3" />
                                            {page.views} views
                                        </span>
                                        <span>{page.conversions} conversions</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
            <DeleteDialog
                open={Boolean(pageToDelete)}
                onOpenChange={(open) => { if (!open) setPageToDelete(null); }}
                onConfirm={handleDelete}
                itemType="page"
                itemTitle={pageToDelete?.name}
            />
        </PageLayout>
    );
}

export default LandingPagesPage;
