import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Plus, Search, Mail, MoreHorizontal, Trash2, Copy, Play, Pause, Send, BarChart3, Clock, Pencil } from 'lucide-react';
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
import { useOrganization } from '@/hooks/useOrganization';
import { getCampaigns, deleteCampaign, duplicateCampaign, sendCampaign, pauseCampaign, resumeCampaign } from '@/services/campaignsApi';
import { CreateCampaignModal } from './CreateCampaignModal';
import { MobileControlsBar } from '@/components/MobileControlsBar';

interface Campaign {
    id: number;
    name: string;
    subject: string;
    status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'sent' | 'failed';
    recipient_count: number;
    sent_count: number;
    open_rate?: number;
    click_rate?: number;
    scheduled_at?: string;
    sent_at?: string;
    created_at: string;
}

export function CampaignsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <Mail className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        CAMPAIGNS | All
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search campaigns..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[120px] h-9">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="sending">Sending</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Campaign
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, statusFilter, theme, setHeaderContent]);

    useEffect(() => {
        if (!organizationId && initError) {
            setLoading(false);
        }
    }, [organizationId, initError]);

    const fetchCampaigns = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const response = await getCampaigns(
                { status: statusFilter !== 'all' ? statusFilter as any : undefined },
                organizationId
            );
            setCampaigns((response.campaigns || []).map(c => ({
                id: c.id,
                name: c.name,
                subject: c.subject,
                status: c.status,
                recipient_count: c.total_recipients || 0,
                sent_count: c.total_sent || 0,
                open_rate: c.open_rate,
                click_rate: c.click_rate,
                scheduled_at: c.scheduled_at,
                sent_at: c.completed_at,
                created_at: c.created_at,
            })));
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load campaigns', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, statusFilter]);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    const handleDuplicate = async (id: number) => {
        if (!organizationId) return;
        try {
            const copy = await duplicateCampaign(id, organizationId);
            setCampaigns(prev => [copy, ...prev]);
            toast({ title: 'Duplicated', description: 'Campaign duplicated successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to duplicate', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await deleteCampaign(id, organizationId);
            setCampaigns(prev => prev.filter(c => c.id !== id));
            toast({ title: 'Deleted', description: 'Campaign deleted successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        }
    };

    const filteredCampaigns = campaigns.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.subject.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'sent': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'sending': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            case 'scheduled': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
            case 'draft': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'paused': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
            case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
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
        <>
            {/* Mobile Controls Bar */}
            <MobileControlsBar>
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                        placeholder="Search campaigns..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[100px] h-9">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="sending">Sending</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                    </SelectContent>
                </Select>
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
                        <div className="p-6 space-y-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
                        </div>
                    ) : filteredCampaigns.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Mail className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
                            <p className="text-muted-foreground mb-4">Create your first email campaign to engage your contacts</p>
                            <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="h-4 w-4 mr-2" />Create Campaign
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredCampaigns.map((campaign) => (
                                <div key={campaign.id} className="p-4 hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-medium truncate">{campaign.name}</h3>
                                                <Badge className={`text-xs ${getStatusBadge(campaign.status)}`}>
                                                    {campaign.status}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground truncate">{campaign.subject}</p>
                                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Send className="h-3 w-3" />
                                                    {campaign.sent_count}/{campaign.recipient_count} sent
                                                </span>
                                                {campaign.open_rate !== undefined && (
                                                    <span className="flex items-center gap-1">
                                                        <BarChart3 className="h-3 w-3" />
                                                        {campaign.open_rate}% opened
                                                    </span>
                                                )}
                                                {campaign.scheduled_at && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        Scheduled: {new Date(campaign.scheduled_at).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem className="group/menu">
                                                    <Pencil className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDuplicate(campaign.id)} className="group/menu">
                                                    <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Duplicate
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => handleDelete(campaign.id)} className="text-destructive">
                                                    <Trash2 className="h-4 w-4 mr-2" />Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {showCreateModal && organizationId && (
                <CreateCampaignModal
                    organizationId={organizationId}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(campaign) => {
                        setCampaigns(prev => [campaign, ...prev]);
                        setShowCreateModal(false);
                    }}
                />
            )}
            </div>
        </>
    );
}

export default CampaignsPage;
