import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { Plus, Search, Code, MoreHorizontal, Trash2, Copy, Eye, Settings } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import { getReviewWidgets, deleteReviewWidget, createReviewWidget, getWidgetEmbedCode } from '@/services/reputationApi';

interface ReviewWidget {
    id: number;
    name: string;
    widget_type: 'carousel' | 'grid' | 'list' | 'badge' | 'floating';
    widget_key: string;
    is_active: boolean;
    theme: 'light' | 'dark' | 'auto';
    min_rating: number;
    max_reviews: number;
    created_at: string;
}

export function ReputationWidgetsPage() {
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [widgets, setWidgets] = useState<ReviewWidget[]>([]);
    const [loading, setLoading] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <Code className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        REVIEW WIDGETS
                    </h1>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative hidden md:block w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search widgets..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={handleCreateWidget}
                    >
                        <Plus className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">New Widget</span>
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, theme, setHeaderContent]);

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

    const fetchWidgets = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const widgetsData = await getReviewWidgets(organizationId);
            setWidgets(Array.isArray(widgetsData) ? widgetsData : []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load widgets', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        fetchWidgets();
    }, [fetchWidgets]);

    const handleCreateWidget = async () => {
        if (!organizationId) return;
        try {
            const newWidget = await createReviewWidget({
                name: 'New Widget',
                widget_type: 'carousel',
            }, organizationId);
            setWidgets(prev => [newWidget, ...prev]);
            toast({ title: 'Created', description: 'Widget created successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to create widget', variant: 'destructive' });
        }
    };

    const handleCopyEmbedCode = async (id: number) => {
        if (!organizationId) return;
        try {
            const { embed_code } = await getWidgetEmbedCode(id, organizationId);
            navigator.clipboard.writeText(embed_code);
            toast({ title: 'Copied', description: 'Embed code copied to clipboard' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to get embed code', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await deleteReviewWidget(id, organizationId);
            setWidgets(prev => prev.filter(w => w.id !== id));
            toast({ title: 'Deleted', description: 'Widget deleted successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        }
    };

    const getTypeBadge = (type: string) => {
        switch (type) {
            case 'carousel': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            case 'grid': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
            case 'list': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'badge': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
            default: return '';
        }
    };

    const filteredWidgets = widgets.filter(w =>
        w.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
                    ) : filteredWidgets.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Code className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No review widgets yet</h3>
                            <p className="text-muted-foreground mb-4">Create widgets to display reviews on your website</p>
                            <Button onClick={handleCreateWidget} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="h-4 w-4 mr-2" />Create Widget
                            </Button>
                        </div>
                    ) : (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredWidgets.map((widget) => (
                                <Card key={widget.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                    <div className="h-24 bg-gradient-to-br from-yellow-100 to-orange-100 dark:from-yellow-900/20 dark:to-orange-900/20 flex items-center justify-center">
                                        <Code className="h-10 w-10 text-yellow-600/50" />
                                    </div>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <CardTitle className="text-lg truncate">{widget.name}</CardTitle>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem>
                                                        <Settings className="h-4 w-4 mr-2" />Configure
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem>
                                                        <Eye className="h-4 w-4 mr-2" />Preview
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleCopyEmbedCode(widget.id)}>
                                                        <Copy className="h-4 w-4 mr-2" />Copy Embed Code
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleDelete(widget.id)} className="text-destructive">
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            <Badge className={`text-xs ${getTypeBadge(widget.widget_type)}`}>
                                                {widget.widget_type}
                                            </Badge>
                                            <Badge variant={widget.is_active ? 'default' : 'secondary'}>
                                                {widget.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Shows {widget.max_reviews} reviews, min {widget.min_rating}★
                                        </p>
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

export default ReputationWidgetsPage;
