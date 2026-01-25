import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
    Plus,
    Search,
    FileText,
    MoreHorizontal,
    Trash2,
    Send,
    ArrowRight,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
} from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import api from '@/lib/api';

interface Estimate {
    id: number;
    estimate_number: string;
    contact_id?: number;
    contact_first_name?: string;
    contact_last_name?: string;
    customer_name?: string;
    status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
    total: number;
    valid_until: string;
    converted_invoice_id?: number;
    created_at: string;
}

export function EstimatesPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [estimates, setEstimates] = useState<Estimate[]>([]);
    const [loading, setLoading] = useState(true);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>('all');

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        ESTIMATES
                    </h1>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative hidden md:block w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search estimates..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={() => navigate('/invoices/estimates/new')}
                    >
                        <Plus className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">New Estimate</span>
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, theme, setHeaderContent, navigate]);

    useEffect(() => {
        const init = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);
            } catch (error) {
                toast({ title: 'Error', description: 'Failed to initialize', variant: 'destructive' });
                setLoading(false);
            }
        };
        init();
    }, [toast]);

    const fetchEstimates = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const response = await api.get('/api/invoices/estimates', {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            setEstimates(response.data.estimates || response.data || []);
        } catch (error) {
            // Endpoint might not exist yet
            setEstimates([]);
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        fetchEstimates();
    }, [fetchEstimates]);

    const handleSendEstimate = async (id: number) => {
        if (!organizationId) return;
        try {
            await api.post(`/api/invoices/estimates/${id}/send`, {}, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            toast({ title: 'Sent', description: 'Estimate sent successfully' });
            fetchEstimates();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to send estimate', variant: 'destructive' });
        }
    };

    const handleConvertToInvoice = async (id: number) => {
        if (!organizationId) return;
        try {
            const response = await api.post(`/api/invoices/estimates/${id}/convert-to-invoice`, {}, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            toast({ title: 'Converted', description: 'Estimate converted to invoice successfully' });
            navigate(`/invoices/${response.data.invoice_id}`);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to convert estimate', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await api.delete(`/api/invoices/estimates/${id}`, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            setEstimates(prev => prev.filter(e => e.id !== id));
            toast({ title: 'Deleted', description: 'Estimate deleted successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete estimate', variant: 'destructive' });
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    };

    const getContactName = (estimate: Estimate) => {
        if (estimate.customer_name) return estimate.customer_name;
        if (estimate.contact_first_name || estimate.contact_last_name) {
            return `${estimate.contact_first_name || ''} ${estimate.contact_last_name || ''}`.trim();
        }
        return 'Unknown';
    };

    const stats = useMemo(() => {
        return {
            draft: estimates.filter(e => e.status === 'draft').length,
            sent: estimates.filter(e => e.status === 'sent').length,
            accepted: estimates.filter(e => e.status === 'accepted').length,
            declined: estimates.filter(e => e.status === 'declined').length,
        };
    }, [estimates]);

    const filteredEstimates = useMemo(() => {
        let filtered = estimates;

        switch (activeTab) {
            case 'draft':
                filtered = filtered.filter(e => e.status === 'draft');
                break;
            case 'sent':
                filtered = filtered.filter(e => e.status === 'sent');
                break;
            case 'accepted':
                filtered = filtered.filter(e => e.status === 'accepted');
                break;
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(e =>
                e.estimate_number?.toLowerCase().includes(query) ||
                getContactName(e).toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [estimates, activeTab, searchQuery]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'accepted': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'sent': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            case 'draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
            case 'declined': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            case 'expired': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
            default: return '';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'accepted': return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'declined': return <XCircle className="h-4 w-4 text-red-600" />;
            case 'sent': return <Send className="h-4 w-4 text-blue-600" />;
            case 'expired': return <AlertCircle className="h-4 w-4 text-orange-600" />;
            default: return <Clock className="h-4 w-4 text-gray-400" />;
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('draft')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Draft</p>
                                <p className="text-2xl font-bold">{stats.draft}</p>
                            </div>
                            <Clock className="h-8 w-8 text-gray-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('sent')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Sent</p>
                                <p className="text-2xl font-bold">{stats.sent}</p>
                            </div>
                            <Send className="h-8 w-8 text-blue-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('accepted')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Accepted</p>
                                <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
                            </div>
                            <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('all')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Declined</p>
                                <p className="text-2xl font-bold text-red-600">{stats.declined}</p>
                            </div>
                            <XCircle className="h-8 w-8 text-red-600" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <div className="mb-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                        <TabsTrigger value="all">
                            All estimates
                            <Badge variant="secondary" className="ml-2">{estimates.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="draft">Draft</TabsTrigger>
                        <TabsTrigger value="sent">Sent</TabsTrigger>
                        <TabsTrigger value="accepted">Accepted</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Estimates List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : filteredEstimates.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <FileText className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No estimates yet</h3>
                            <p className="text-muted-foreground mb-4">Create estimates to send quotes to your customers</p>
                            <Button
                                onClick={() => navigate('/invoices/estimates/new')}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <Plus className="h-4 w-4 mr-2" />Create Estimate
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredEstimates.map((estimate) => (
                                <div
                                    key={estimate.id}
                                    className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => navigate(`/invoices/estimates/${estimate.id}`)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                                {getStatusIcon(estimate.status)}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="font-medium">{estimate.estimate_number}</p>
                                                    <Badge className={`text-xs ${getStatusBadge(estimate.status)}`}>
                                                        {estimate.status}
                                                    </Badge>
                                                    {estimate.converted_invoice_id && (
                                                        <Badge variant="outline" className="text-xs">
                                                            Converted
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">{getContactName(estimate)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="font-medium">{formatCurrency(estimate.total)}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Valid until {new Date(estimate.valid_until).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenuItem onClick={() => navigate(`/invoices/estimates/${estimate.id}`)}>
                                                        Edit
                                                    </DropdownMenuItem>
                                                    {estimate.status === 'draft' && (
                                                        <DropdownMenuItem onClick={() => handleSendEstimate(estimate.id)}>
                                                            <Send className="h-4 w-4 mr-2" />Send
                                                        </DropdownMenuItem>
                                                    )}
                                                    {['sent', 'accepted'].includes(estimate.status) && !estimate.converted_invoice_id && (
                                                        <DropdownMenuItem onClick={() => handleConvertToInvoice(estimate.id)}>
                                                            <ArrowRight className="h-4 w-4 mr-2" />Convert to Invoice
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(estimate.id)}
                                                        className="text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default EstimatesPage;
