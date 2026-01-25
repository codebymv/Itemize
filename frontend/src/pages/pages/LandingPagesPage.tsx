import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Plus, Search, Layout, MoreHorizontal, Trash2, Copy, ExternalLink, Eye, EyeOff, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import { getPages, updatePage, deletePage, duplicatePage, createPage } from '@/services/pagesApi';

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

    const [pages, setPages] = useState<LandingPage[]>([]);
    const [loading, setLoading] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <Layout className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        LANDING PAGES
                    </h1>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative hidden md:block w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search pages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[120px] h-9 hidden sm:flex">
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
                        <Plus className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">New Page</span>
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, statusFilter, theme, setHeaderContent]);

    useEffect(() => {
        const initOrg = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);
            } catch (error: any) {
                setInitError('Failed to initialize.');
                setLoading(false);
            }
        };
        initOrg();
    }, []);

    const fetchPages = useCallback(async () => {
        if (!organizationId) return;
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
            toast({ title: 'Error', description: 'Failed to load pages', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, statusFilter]);

    useEffect(() => {
        fetchPages();
    }, [fetchPages]);

    const handleCreatePage = async () => {
        if (!organizationId) return;
        try {
            const newPage = await createPage({ name: 'New Page' }, organizationId);
            navigate(`/pages/${newPage.id}`);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to create page', variant: 'destructive' });
        }
    };

    const handleToggleStatus = async (page: LandingPage, newStatus: 'published' | 'draft') => {
        if (!organizationId) return;
        try {
            await updatePage(page.id, { status: newStatus }, organizationId);
            setPages(prev => prev.map(p => p.id === page.id ? { ...p, status: newStatus } : p));
            toast({ title: newStatus === 'published' ? 'Page published' : 'Page unpublished' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update page', variant: 'destructive' });
        }
    };

    const handleDuplicate = async (id: number) => {
        if (!organizationId) return;
        try {
            const copy = await duplicatePage(id, organizationId);
            setPages(prev => [copy, ...prev]);
            toast({ title: 'Duplicated', description: 'Page duplicated successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to duplicate', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await deletePage(id, organizationId);
            setPages(prev => prev.filter(p => p.id !== id));
            toast({ title: 'Deleted', description: 'Page deleted successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        }
    };

    const copyPageLink = (slug: string) => {
        navigator.clipboard.writeText(`${window.location.origin}/p/${slug}`);
        toast({ title: 'Link Copied', description: 'Page link copied to clipboard' });
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
            <div className="container mx-auto p-6 max-w-7xl">
                <Card className="max-w-lg mx-auto mt-12">
                    <CardContent className="pt-6 text-center">
                        <p className="text-muted-foreground">{initError}</p>
                        <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
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
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredPages.map((page) => (
                                <Card key={page.id} className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/pages/${page.id}`)}>
                                    <div className="h-32 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 flex items-center justify-center">
                                        <Layout className="h-12 w-12 text-blue-600/50" />
                                    </div>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <CardTitle className="text-lg truncate">{page.name}</CardTitle>
                                                {page.description && <CardDescription className="line-clamp-1">{page.description}</CardDescription>}
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenuItem onClick={() => navigate(`/pages/${page.id}`)}>Edit</DropdownMenuItem>
                                                    {page.status === 'published' ? (
                                                        <DropdownMenuItem onClick={() => handleToggleStatus(page, 'draft')}>
                                                            <EyeOff className="h-4 w-4 mr-2" />Unpublish
                                                        </DropdownMenuItem>
                                                    ) : (
                                                        <DropdownMenuItem onClick={() => handleToggleStatus(page, 'published')}>
                                                            <Eye className="h-4 w-4 mr-2" />Publish
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => copyPageLink(page.slug)}>
                                                        <Copy className="h-4 w-4 mr-2" />Copy Link
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDuplicate(page.id)}>
                                                        <Copy className="h-4 w-4 mr-2" />Duplicate
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleDelete(page.id)} className="text-destructive">
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            <Badge className={`text-xs ${getStatusBadge(page.status)}`}>{page.status}</Badge>
                                        </div>
                                        <div className="flex items-center justify-between pt-3 border-t text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <BarChart3 className="h-3 w-3" />
                                                {page.views} views
                                            </span>
                                            <span>{page.conversions} conversions</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default LandingPagesPage;
