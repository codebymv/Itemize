import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Plus, Search, Layout, MoreHorizontal, Trash2, Copy, Eye, EyeOff, BarChart3, Pencil } from 'lucide-react';
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
import { useHeader } from '@/contexts/HeaderContext';
import { useOrganization } from '@/hooks/useOrganization';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { getPages, updatePage, deletePage, duplicatePage, createPage } from '@/services/pagesApi';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';

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

export function LandingPagesPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    // Onboarding
    const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('pages');

    const [pages, setPages] = useState<LandingPage[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0 flex-1">
                    <Layout className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className={`text-xl font-semibold italic truncate min-w-0 font-raleway ${theme === 'dark' ? 'text-white' : 'text-black'}`}
                    >
                        LANDING PAGES
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4 flex-shrink-0">
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
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, statusFilter, theme, setHeaderContent]);

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
                { status: statusFilter !== 'all' ? statusFilter as any : undefined },
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
            setPages(prev => [copy, ...prev]);
            toast({ title: 'Duplicated', description: toastMessages.duplicated('page') });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToDuplicate('page'), variant: 'destructive' });
        }
    };

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await deletePage(id, organizationId);
            setPages(prev => prev.filter(p => p.id !== id));
            toast({ title: 'Deleted', description: toastMessages.deleted('page') });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToDelete('page'), variant: 'destructive' });
        }
    };

    const copyPageLink = (slug: string) => {
        navigator.clipboard.writeText(`${window.location.origin}/p/${slug}`);
        toast({ title: 'Link Copied', description: toastMessages.copiedToClipboard('page link') });
    };

    const filteredPages = pages.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'published': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'draft': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'archived': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
            default: return '';
        }
    };

    if (initError) {
        return (
            <PageContainer>
                <PageSurface className="max-w-lg mx-auto mt-12" contentClassName="pt-6 text-center">
                    <p className="text-muted-foreground">{initError}</p>
                    <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
                </PageSurface>
            </PageContainer>
        );
    }

    return (
        <>
            {/* Onboarding Modal */}
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={closeOnboarding}
                onComplete={completeOnboarding}
                onDismiss={dismissOnboarding}
                content={ONBOARDING_CONTENT.pages}
            />

            <MobileControlsBar className="flex-col items-stretch">
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
            </MobileControlsBar>
            <PageContainer>
                <PageSurface>
                <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                        </div>
                    ) : filteredPages.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Layout className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No landing pages yet</h3>
                            <p className="text-muted-foreground mb-4">Create beautiful landing pages to capture leads</p>
                            <Button onClick={handleCreatePage} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="h-4 w-4 mr-2" />Create Page
                            </Button>
                        </div>
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
                                                        <Pencil className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Edit
                                                    </DropdownMenuItem>
                                                    {page.status === 'published' ? (
                                                        <DropdownMenuItem onClick={() => handleToggleStatus(page, 'draft')} className="group/menu">
                                                            <EyeOff className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Unpublish
                                                        </DropdownMenuItem>
                                                    ) : (
                                                        <DropdownMenuItem onClick={() => handleToggleStatus(page, 'published')} className="group/menu">
                                                            <Eye className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Publish
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => copyPageLink(page.slug)} className="group/menu">
                                                        <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Copy Link
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDuplicate(page.id)} className="group/menu">
                                                        <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Duplicate
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleDelete(page.id)} className="text-destructive">
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
                                        <Badge className={`text-xs ${getStatusBadge(page.status)}`}>{page.status}</Badge>
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
                </CardContent>
            </Card>
            </PageSurface>
        </PageContainer>
        </>
    );
}

export default LandingPagesPage;
