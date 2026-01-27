import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Plus, Search, Filter, MoreHorizontal, Trash2, Copy, Users, RefreshCw } from 'lucide-react';
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
import { getSegments, deleteSegment, calculateSegment } from '@/services/segmentsApi';
import { CreateSegmentModal } from './CreateSegmentModal';
import { MobileControlsBar } from '@/components/MobileControlsBar';

interface Segment {
    id: number;
    name: string;
    description?: string;
    type: 'dynamic' | 'static';
    contact_count: number;
    filters?: any;
    created_at: string;
    updated_at: string;
}

export function SegmentsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [segments, setSegments] = useState<Segment[]>([]);
    const [loading, setLoading] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <Filter className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SEGMENTS
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search segments..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Segment
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

    const fetchSegments = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const segments = await getSegments({}, organizationId);
            setSegments(Array.isArray(segments) ? segments : []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load segments', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, toast]);

    useEffect(() => {
        fetchSegments();
    }, [fetchSegments]);

    const handleRecalculate = async (id: number) => {
        if (!organizationId) return;
        try {
            const result = await calculateSegment(id, organizationId);
            setSegments(prev => prev.map(s => s.id === id ? { ...s, contact_count: result.contact_count } : s));
            toast({ title: 'Recalculated', description: `${result.contact_count} contacts match this segment` });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to recalculate', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await deleteSegment(id, organizationId);
            setSegments(prev => prev.filter(s => s.id !== id));
            toast({ title: 'Deleted', description: 'Segment deleted successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        }
    };

    const filteredSegments = segments.filter(s => 
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
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
        <>
            {/* Mobile Controls Bar */}
            <MobileControlsBar>
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                        placeholder="Search segments..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
                    />
                </div>
                <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                    onClick={() => setShowCreateModal(true)}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </MobileControlsBar>

            <div className="container mx-auto p-6 max-w-7xl">
                <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
                        </div>
                    ) : filteredSegments.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Filter className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No segments yet</h3>
                            <p className="text-muted-foreground mb-4">Create segments to group and target contacts</p>
                            <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="h-4 w-4 mr-2" />Create Segment
                            </Button>
                        </div>
                    ) : (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredSegments.map((segment) => (
                                <Card key={segment.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <CardTitle className="text-lg truncate">{segment.name}</CardTitle>
                                                {segment.description && <CardDescription className="line-clamp-2">{segment.description}</CardDescription>}
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleRecalculate(segment.id)}>
                                                        <RefreshCw className="h-4 w-4 mr-2" />Recalculate
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleDelete(segment.id)} className="text-destructive">
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Badge variant={segment.type === 'dynamic' ? 'default' : 'secondary'}>
                                                {segment.type}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Users className="h-4 w-4" />
                                            <span>{segment.contact_count} contacts</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {showCreateModal && organizationId && (
                <CreateSegmentModal
                    organizationId={organizationId}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(segment) => {
                        setSegments(prev => [segment, ...prev]);
                        setShowCreateModal(false);
                    }}
                />
            )}
            </div>
        </>
    );
}

export default SegmentsPage;
