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
import { getStatusBadgeClass } from '@/lib/badge-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { useOrganization } from '@/hooks/useOrganization';
import api from '@/lib/api';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';

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

    // Route-aware onboarding (will show 'invoices' onboarding for all Sales & Payments routes)
    const {
        showModal: showOnboarding,
        handleComplete: handleOnboardingComplete,
        handleDismiss: handleOnboardingDismiss,
        handleClose: handleOnboardingClose,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const [estimates, setEstimates] = useState<Estimate[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId } = useOrganization({
        onError: () => {
            toast({ title: 'Error', description: 'Failed to initialize', variant: 'destructive' });
            return 'Failed to initialize';
        }
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>('all');

    useEffect(() => {
        if (!organizationId) {
            setLoading(false);
        }
    }, [organizationId]);

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

    // Set header content (after stats is defined)
    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className={`text-xl font-semibold italic truncate font-raleway ${theme === 'dark' ? 'text-white' : 'text-black'}`}
                    >
                        ESTIMATES
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="h-9">
                            <TabsTrigger value="all" className="text-xs">
                                All estimates
                                <Badge variant="secondary" className="ml-2">{estimates.length}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="draft" className="text-xs">
                                Draft
                                <Badge variant="secondary" className="ml-2">{stats.draft}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="sent" className="text-xs">
                                Sent
                                <Badge variant="secondary" className="ml-2">{stats.sent}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="accepted" className="text-xs">
                                Accepted
                                <Badge variant="secondary" className="ml-2">{stats.accepted}</Badge>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="relative w-full max-w-xs">
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
                        onClick={() => navigate('/estimates/new')}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Estimate
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, theme, setHeaderContent, navigate, activeTab, estimates, stats]);

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

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'accepted': return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'declined': return <XCircle className="h-4 w-4 text-red-600" />;
            case 'sent': return <Send className="h-4 w-4 text-orange-600" />;
            case 'expired': return <AlertCircle className="h-4 w-4 text-orange-600" />;
            case 'draft': return <Clock className="h-4 w-4 text-sky-600" />;
            default: return <Clock className="h-4 w-4 text-gray-400" />;
        }
    };

    return (
        <>
            {/* Mobile Controls Bar */}
            <MobileControlsBar className="flex-col items-stretch">
                <div className="flex items-center gap-2 w-full">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search estimates..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={() => navigate('/estimates/new')}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full h-9">
                        <TabsTrigger value="all" className="flex-1 text-xs">
                            All
                            <Badge variant="secondary" className="ml-1">{estimates.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="draft" className="flex-1 text-xs">Draft</TabsTrigger>
                        <TabsTrigger value="sent" className="flex-1 text-xs">Sent</TabsTrigger>
                        <TabsTrigger value="accepted" className="flex-1 text-xs">Accepted</TabsTrigger>
                    </TabsList>
                </Tabs>
            </MobileControlsBar>

            <PageContainer>
                <PageSurface>
                {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadgeClass('declined')}`}>Declined</Badge>
                                <p className="text-2xl font-bold text-red-600">{stats.declined}</p>
                                <p className="text-xs text-muted-foreground">{stats.declined} estimate{stats.declined !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                                <XCircle className="h-5 w-5 text-red-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadgeClass('draft')}`}>Draft</Badge>
                                <p className="text-2xl font-bold text-sky-600">{stats.draft}</p>
                                <p className="text-xs text-muted-foreground">{stats.draft} estimate{stats.draft !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                                <Clock className="h-5 w-5 text-sky-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadgeClass('sent')}`}>Sent</Badge>
                                <p className="text-2xl font-bold text-orange-600">{stats.sent}</p>
                                <p className="text-xs text-muted-foreground">{stats.sent} estimate{stats.sent !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                                <Send className="h-5 w-5 text-orange-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadgeClass('accepted')}`}>Accepted</Badge>
                                <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
                                <p className="text-xs text-muted-foreground">{stats.accepted} estimate{stats.accepted !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                <CheckCircle className="h-5 w-5 text-green-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
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
                                onClick={() => navigate('/estimates/new')}
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
                                    onClick={() => navigate(`/estimates/${estimate.id}`)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                                {getStatusIcon(estimate.status)}
                                            </div>
                                            <p className="font-medium text-sm md:text-base truncate">{estimate.estimate_number}</p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <div className="text-right hidden sm:block">
                                                <p className="font-semibold text-sm md:text-base">{formatCurrency(estimate.total)}</p>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenuItem onClick={() => navigate(`/estimates/${estimate.id}`)} className="group/menu">
                                                        <Pencil className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Edit
                                                    </DropdownMenuItem>
                                                    {estimate.status === 'draft' && (
                                                        <DropdownMenuItem onClick={() => handleSendEstimate(estimate.id)} className="group/menu">
                                                            <Send className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Send
                                                        </DropdownMenuItem>
                                                    )}
                                                    {['sent', 'accepted'].includes(estimate.status) && !estimate.converted_invoice_id && (
                                                        <DropdownMenuItem onClick={() => handleConvertToInvoice(estimate.id)} className="group/menu">
                                                            <ArrowRight className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Convert to Invoice
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(estimate.id)}
                                                        className="text-destructive focus:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                    <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                        <span className="text-sm text-muted-foreground font-medium">{getContactName(estimate)}</span>
                                        <Badge className={`text-xs ${getStatusBadgeClass(estimate.status)}`}>
                                            {estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)}
                                        </Badge>
                                        {estimate.converted_invoice_id && (
                                            <Badge variant="outline" className="text-xs">
                                                Converted
                                            </Badge>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            Valid until {new Date(estimate.valid_until).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span className="sm:hidden font-semibold">{formatCurrency(estimate.total)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </PageSurface>
        </PageContainer>

        {/* Route-aware onboarding modal */}
        {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={handleOnboardingClose}
                onComplete={handleOnboardingComplete}
                onDismiss={handleOnboardingDismiss}
                content={ONBOARDING_CONTENT[onboardingFeatureKey]}
            />
        )}
        </>
    );
}

export default EstimatesPage;
