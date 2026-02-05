import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
    Plus,
    Search,
    RefreshCw,
    MoreHorizontal,
    MoreVertical,
    Trash2,
    Edit,
    Pause,
    Play,
    Calendar,
    CheckCircle,
    Clock,
    History,
    ChevronDown,
    ChevronRight,
    Loader2,
    CalendarDays,
    ExternalLink,
    FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeClass } from '@/lib/badge-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { getContacts } from '@/services/contactsApi';
import { getProducts, Product, getBusinesses, Business } from '@/services/invoicesApi';
import { useOrganization } from '@/hooks/useOrganization';
import { InvoicePreviewCard } from './components/InvoicePreviewCard';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface RecurringInvoice {
    id: number;
    template_name: string;
    contact_id?: number;
    contact_first_name?: string;
    contact_last_name?: string;
    customer_name?: string;
    customer_email?: string;
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    status: 'active' | 'paused' | 'completed';
    next_run_date: string;
    start_date: string;
    end_date?: string;
    total: number;
    subtotal?: number;
    tax_amount?: number;
    discount_amount?: number;
    last_generated_at?: string;
    invoices_generated: number;
    created_at: string;
    items?: Array<{
        name: string;
        description?: string;
        quantity: number;
        unit_price: number;
        tax_rate?: number;
    }>;
    notes?: string;
    payment_terms?: string;
    source_invoice_id?: number;
    source_invoice_number?: string;
}

interface Contact {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
}

interface LineItem {
    id: string;
    product_id?: number;
    name: string;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
}

const FREQUENCY_LABELS: Record<string, string> = {
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
};

export function RecurringInvoicesPage() {
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

    const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>('all');

    // Expanded recurring state
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [expandedData, setExpandedData] = useState<RecurringInvoice | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [previewInvoiceNumber, setPreviewInvoiceNumber] = useState<string>('INV-00001');
    
    // Delete confirmation dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [recurringToDelete, setRecurringToDelete] = useState<RecurringInvoice | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Generate invoice state
    const [generatingInvoice, setGeneratingInvoice] = useState<number | null>(null);

    // Business data for preview
    const [business, setBusiness] = useState<Business | null>(null);

    // Create dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [saving, setSaving] = useState(false);

    // Form state
    const [templateName, setTemplateName] = useState('');
    const [contactId, setContactId] = useState<number | undefined>();
    const [customerName, setCustomerName] = useState('');
    const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: crypto.randomUUID(), name: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }
    ]);

    useEffect(() => {
        if (!initError) return;
        toast({ title: 'Error', description: initError, variant: 'destructive' });
        setLoading(false);
    }, [initError, toast]);

    useEffect(() => {
        if (!organizationId) return;
        const loadSupportData = async () => {
            try {
                const [contactsData, productsData, businessesData] = await Promise.all([
                    getContacts({}, organizationId),
                    getProducts({}, organizationId),
                    getBusinesses(organizationId)
                ]);
                setContacts(Array.isArray(contactsData) ? contactsData : contactsData.contacts || []);
                setProducts(productsData || []);
                if (businessesData && businessesData.length > 0) {
                    setBusiness(businessesData[0]);
                }
            } catch (error) {
                toast({ title: 'Error', description: 'Failed to load supporting data', variant: 'destructive' });
                setLoading(false);
            }
        };
        loadSupportData();
    }, [organizationId, toast]);

    const fetchRecurringInvoices = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const response = await api.get('/api/invoices/recurring', {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            setRecurringInvoices(response.data.recurring || response.data || []);
        } catch (error) {
            // Endpoint might not exist yet
            setRecurringInvoices([]);
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        fetchRecurringInvoices();
    }, [fetchRecurringInvoices]);

    const openCreateDialog = () => {
        setTemplateName('');
        setContactId(undefined);
        setCustomerName('');
        setFrequency('monthly');
        setStartDate(new Date().toISOString().split('T')[0]);
        setEndDate('');
        setLineItems([{ id: crypto.randomUUID(), name: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
        setDialogOpen(true);
    };

    const handleContactChange = (contactIdStr: string) => {
        if (contactIdStr === 'none') {
            setContactId(undefined);
            return;
        }
        const selectedContact = contacts.find(c => c.id === parseInt(contactIdStr));
        if (selectedContact) {
            setContactId(selectedContact.id);
            setCustomerName(`${selectedContact.first_name} ${selectedContact.last_name}`.trim());
        }
    };

    const addLineItem = () => {
        setLineItems([...lineItems, {
            id: crypto.randomUUID(),
            name: '',
            description: '',
            quantity: 1,
            unit_price: 0,
            tax_rate: 0,
        }]);
    };

    const updateLineItem = (itemId: string, updates: Partial<LineItem>) => {
        setLineItems(lineItems.map(item =>
            item.id === itemId ? { ...item, ...updates } : item
        ));
    };

    const removeLineItem = (itemId: string) => {
        if (lineItems.length > 1) {
            setLineItems(lineItems.filter(i => i.id !== itemId));
        }
    };

    const handleSaveRecurring = async () => {
        if (!organizationId) return;

        const validItems = lineItems.filter(i => i.name.trim());
        if (!templateName || validItems.length === 0) {
            toast({ title: 'Error', description: 'Name and at least one line item required', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            await api.post('/api/invoices/recurring', {
                template_name: templateName,
                contact_id: contactId,
                customer_name: customerName || undefined,
                frequency,
                start_date: startDate,
                end_date: endDate || undefined,
                items: validItems.map(item => ({
                    name: item.name,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    tax_rate: item.tax_rate,
                })),
            }, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            toast({ title: 'Created', description: 'Recurring invoice created successfully' });
            setDialogOpen(false);
            fetchRecurringInvoices();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to create recurring invoice', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const handlePause = async (id: number) => {
        if (!organizationId) return;
        try {
            await api.post(`/api/invoices/recurring/${id}/pause`, {}, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            toast({ title: 'Paused', description: 'Recurring invoice paused' });
            fetchRecurringInvoices();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to pause', variant: 'destructive' });
        }
    };

    const handleResume = async (id: number) => {
        if (!organizationId) return;
        try {
            await api.post(`/api/invoices/recurring/${id}/resume`, {}, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            toast({ title: 'Resumed', description: 'Recurring invoice resumed' });
            fetchRecurringInvoices();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to resume', variant: 'destructive' });
        }
    };

    const handleGenerateNow = async (id: number, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!organizationId) return;
        
        setGeneratingInvoice(id);
        try {
            const response = await api.post(`/api/invoices/recurring/${id}/generate-now`, {}, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            toast({ 
                title: 'Invoice Generated', 
                description: `${response.data.invoice_number} created successfully` 
            });
            fetchRecurringInvoices();
        } catch (error: any) {
            const message = error.response?.data?.error || 'Failed to generate invoice';
            toast({ title: 'Error', description: message, variant: 'destructive' });
        } finally {
            setGeneratingInvoice(null);
        }
    };

    const handleDeleteClick = (recurring: RecurringInvoice, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setRecurringToDelete(recurring);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!organizationId || !recurringToDelete) return;
        setDeleting(true);
        try {
            await api.delete(`/api/invoices/recurring/${recurringToDelete.id}`, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            setRecurringInvoices(prev => prev.filter(r => r.id !== recurringToDelete.id));
            toast({ title: 'Deleted', description: 'Recurring invoice deleted successfully' });
            setDeleteDialogOpen(false);
            setRecurringToDelete(null);
            // Collapse if deleted item was expanded
            if (expandedId === recurringToDelete.id) {
                setExpandedId(null);
                setExpandedData(null);
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        } finally {
            setDeleting(false);
        }
    };

    const handleToggleExpand = async (recurringId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        
        // If clicking on already expanded item, collapse it
        if (expandedId === recurringId) {
            setExpandedId(null);
            setExpandedData(null);
            return;
        }
        
        // Expand new item
        setExpandedId(recurringId);
        setExpandedData(null);
        setLoadingPreview(true);
        
        if (!organizationId) return;
        
        try {
            const [recurringResponse, previewNumberResponse] = await Promise.all([
                api.get(`/api/invoices/recurring/${recurringId}`, {
                    headers: { 'x-organization-id': organizationId.toString() }
                }),
                api.get('/api/invoices/recurring/preview-invoice-number', {
                    headers: { 'x-organization-id': organizationId.toString() }
                })
            ]);
            setExpandedData(recurringResponse.data);
            setPreviewInvoiceNumber(previewNumberResponse.data.invoice_number || 'INV-00001');
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load recurring invoice details', variant: 'destructive' });
            setExpandedId(null);
        } finally {
            setLoadingPreview(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const getContactName = (recurring: RecurringInvoice) => {
        if (recurring.customer_name) return recurring.customer_name;
        if (recurring.contact_first_name || recurring.contact_last_name) {
            return `${recurring.contact_first_name || ''} ${recurring.contact_last_name || ''}`.trim();
        }
        return 'Unknown';
    };

    const stats = useMemo(() => {
        return {
            active: recurringInvoices.filter(r => r.status === 'active').length,
            paused: recurringInvoices.filter(r => r.status === 'paused').length,
            completed: recurringInvoices.filter(r => r.status === 'completed').length,
        };
    }, [recurringInvoices]);

    // Set header content (after stats is defined)
    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <RefreshCw className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        RECURRING INVOICES
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="h-9">
                            <TabsTrigger value="all" className="text-xs">
                                All
                                <Badge variant="secondary" className="ml-2">{recurringInvoices.length}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="active" className="text-xs">
                                Active
                                <Badge variant="secondary" className="ml-2">{stats.active}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="paused" className="text-xs">
                                Paused
                                <Badge variant="secondary" className="ml-2">{stats.paused}</Badge>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search recurring..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={openCreateDialog}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Recurring
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, theme, setHeaderContent, activeTab, recurringInvoices, stats]);

    const filteredRecurring = useMemo(() => {
        let filtered = recurringInvoices;

        switch (activeTab) {
            case 'active':
                filtered = filtered.filter(r => r.status === 'active');
                break;
            case 'paused':
                filtered = filtered.filter(r => r.status === 'paused');
                break;
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(r =>
                r.template_name?.toLowerCase().includes(query) ||
                getContactName(r).toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [recurringInvoices, activeTab, searchQuery]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active': return <Play className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
            case 'paused': return <Pause className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
            case 'completed': return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
            default: return <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500" />;
        }
    };

    const getStatusIconBg = (status: string) => {
        switch (status) {
            case 'active': return 'bg-blue-100 dark:bg-blue-900';
            case 'paused': return 'bg-orange-100 dark:bg-orange-900';
            case 'completed': return 'bg-green-100 dark:bg-green-900';
            default: return 'bg-gray-100 dark:bg-gray-800';
        }
    };

    const total = lineItems.reduce((sum, item) => {
        return sum + (item.quantity * item.unit_price * (1 + item.tax_rate / 100));
    }, 0);

    return (
        <>
            {/* Mobile Controls Bar */}
            <MobileControlsBar className="flex-col items-stretch">
                <div className="flex items-center gap-2 w-full">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search recurring..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={openCreateDialog}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full h-9">
                        <TabsTrigger value="all" className="flex-1 text-xs">
                            All
                            <Badge variant="secondary" className="ml-1">{recurringInvoices.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="active" className="flex-1 text-xs">Active</TabsTrigger>
                        <TabsTrigger value="paused" className="flex-1 text-xs">Paused</TabsTrigger>
                    </TabsList>
                </Tabs>
            </MobileControlsBar>

            <PageContainer>
                <PageSurface>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadgeClass('active')}`}>Active</Badge>
                                <p className="text-2xl font-bold text-blue-600">{stats.active}</p>
                                <p className="text-xs text-muted-foreground">{stats.active} recurring{stats.active !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                <Play className="h-5 w-5 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadgeClass('paused')}`}>Paused</Badge>
                                <p className="text-2xl font-bold text-orange-600">{stats.paused}</p>
                                <p className="text-xs text-muted-foreground">{stats.paused} recurring{stats.paused !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                                <Pause className="h-5 w-5 text-orange-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadgeClass('completed')}`}>Completed</Badge>
                                <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                                <p className="text-xs text-muted-foreground">{stats.completed} recurring{stats.completed !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                <CheckCircle className="h-5 w-5 text-green-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recurring List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : filteredRecurring.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <RefreshCw className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No recurring invoices yet</h3>
                            <p className="text-muted-foreground mb-4">Create recurring invoices to automate billing</p>
                            <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="h-4 w-4 mr-2" />Create Recurring Invoice
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredRecurring.map((recurring) => {
                                const isExpanded = expandedId === recurring.id;
                                return (
                                    <div key={recurring.id}>
                                        {/* Recurring Row - Aligned with VaultCard Pattern */}
                                        <div
                                            className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                                            onClick={(e) => handleToggleExpand(recurring.id, e)}
                                        >
                                            {/* Header Row: Icon + Template Name on left, Amount + Chevron + Menu on right */}
                                            <div className="flex items-center justify-between">
                                                {/* Left Side: Status Icon + Template Name */}
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    {/* Status Icon */}
                                                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getStatusIconBg(recurring.status)}`}>
                                                        {getStatusIcon(recurring.status)}
                                                    </div>
                                                    {/* Template Name */}
                                                    <p className="font-medium text-sm md:text-base">{recurring.template_name}</p>
                                                </div>
                                                
                                                {/* Right Side: Amount + Chevron + Menu */}
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <div className="text-right hidden sm:block">
                                                        <p className="font-semibold text-sm md:text-base">{formatCurrency(recurring.total)}</p>
                                                    </div>
                                                    {/* Chevron - Collapsible Trigger */}
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-8 w-8 p-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleToggleExpand(recurring.id, e);
                                                        }}
                                                    >
                                                        <ChevronDown className={cn(
                                                            "h-4 w-4 transition-transform",
                                                            isExpanded ? "" : "transform rotate-180"
                                                        )} />
                                                    </Button>
                                                    {/* Dropdown Menu */}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                            <DropdownMenuItem className="group/menu">
                                                                <Edit className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Edit
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem className="group/menu">
                                                                <History className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />View History
                                                            </DropdownMenuItem>
                                                            {recurring.status !== 'completed' && (
                                                                <DropdownMenuItem 
                                                                    onClick={(e) => handleGenerateNow(recurring.id, e)}
                                                                    disabled={generatingInvoice === recurring.id}
                                                                    className="group/menu"
                                                                >
                                                                    <FileText className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                                                                    {generatingInvoice === recurring.id ? 'Generating...' : 'Generate Next Invoice'}
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            {recurring.status === 'active' && (
                                                                <DropdownMenuItem onClick={() => handlePause(recurring.id)} className="group/menu">
                                                                    <Pause className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Pause
                                                                </DropdownMenuItem>
                                                            )}
                                                            {recurring.status === 'paused' && (
                                                                <DropdownMenuItem onClick={() => handleResume(recurring.id)} className="group/menu">
                                                                    <Play className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Resume
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={(e) => handleDeleteClick(recurring, e)}
                                                                className="text-destructive focus:text-destructive"
                                                            >
                                                                <Trash2 className="h-4 w-4 mr-2" />Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                            
                                            {/* Middle Row: Contact Name + Status Badge + Frequency Badge (horizontally distributed) */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                                {/* Contact Name */}
                                                <span className="text-sm text-muted-foreground font-medium">{getContactName(recurring)}</span>
                                                
                                                {/* Status Badge */}
                                                <Badge className={`text-xs pointer-events-none cursor-default ${getStatusBadgeClass(recurring.status)}`}>
                                                    {recurring.status.charAt(0).toUpperCase() + recurring.status.slice(1)}
                                                </Badge>
                                                
                                                {/* Frequency Badge */}
                                                <Badge variant="outline" className="text-xs">
                                                    Billed {FREQUENCY_LABELS[recurring.frequency]?.toLowerCase() || recurring.frequency}
                                                </Badge>
                                            </div>
                                            
                                            {/* Footer Row: Amount (on mobile) + Next run date + Generated count */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                <span className="md:hidden font-semibold">{formatCurrency(recurring.total)}</span>
                                                {recurring.status === 'active' && recurring.next_run_date && (
                                                    <span>Next: {new Date(recurring.next_run_date).toLocaleDateString()}</span>
                                                )}
                                                {recurring.invoices_generated > 0 && (
                                                    <span>
                                                        ({recurring.invoices_generated} generated)
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded Preview */}
                                        {isExpanded && (
                                            <div className="bg-muted/30 border-t px-6 py-6">
                                                {loadingPreview ? (
                                                    <div className="flex items-center justify-center py-12">
                                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                                        <span className="ml-2 text-muted-foreground">Loading details...</span>
                                                    </div>
                                                ) : expandedData ? (
                                                    <div className="max-w-6xl mx-auto">
                                                        {/* Two Column Layout: Preview + Schedule Details */}
                                                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                                            {/* Left Column - Invoice Preview (takes 2/3 on xl) */}
                                                            <div className="xl:col-span-2">
                                                                <InvoicePreviewCard
                                                                    variant="template"
                                                                    business={business || undefined}
                                                                    documentNumber={previewInvoiceNumber}
                                                                    nextRunDate={expandedData.next_run_date}
                                                                    customerName={expandedData.customer_name}
                                                                    customerEmail={expandedData.customer_email}
                                                                    items={expandedData.items || []}
                                                                    subtotal={expandedData.subtotal || 0}
                                                                    taxAmount={expandedData.tax_amount}
                                                                    discountAmount={expandedData.discount_amount}
                                                                    total={expandedData.total}
                                                                    notes={expandedData.notes}
                                                                    className="max-w-3xl"
                                                                />
                                                            </div>

                                                            {/* Right Column - Schedule Details */}
                                                            <div className="xl:col-span-1">
                                                                <div className="bg-white dark:bg-gray-900 rounded-lg border p-5 shadow-sm sticky top-6">
                                                                    <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4 flex items-center gap-2">
                                                                        <CalendarDays className="h-4 w-4" />
                                                                        Schedule Details
                                                                    </h3>
                                                                    
                                                                    <div className="space-y-3">
                                                                        <div className="flex justify-between items-center py-2 border-b">
                                                                            <span className="text-sm text-muted-foreground">Frequency</span>
                                                                            <span className="text-sm font-medium">
                                                                                Billed {FREQUENCY_LABELS[expandedData.frequency]?.toLowerCase() || expandedData.frequency}
                                                                            </span>
                                                                        </div>
                                                                        
                                                                        <div className="flex justify-between items-center py-2 border-b">
                                                                            <span className="text-sm text-muted-foreground">Status</span>
                                                                            <Badge className={getStatusBadgeClass(expandedData.status)}>
                                                                                {expandedData.status.charAt(0).toUpperCase() + expandedData.status.slice(1)}
                                                                            </Badge>
                                                                        </div>
                                                                        
                                                                        <div className="flex justify-between items-center py-2 border-b">
                                                                            <span className="text-sm text-muted-foreground">Start Date</span>
                                                                            <span className="text-sm font-medium">{formatDate(expandedData.start_date)}</span>
                                                                        </div>
                                                                        
                                                                        {expandedData.end_date && (
                                                                            <div className="flex justify-between items-center py-2 border-b">
                                                                                <span className="text-sm text-muted-foreground">End Date</span>
                                                                                <span className="text-sm font-medium">{formatDate(expandedData.end_date)}</span>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {expandedData.status === 'active' && expandedData.next_run_date && (
                                                                            <div className="flex justify-between items-center py-2 border-b">
                                                                                <span className="text-sm text-muted-foreground">Next Invoice</span>
                                                                                <span className="text-sm font-medium text-blue-600">{formatDate(expandedData.next_run_date)}</span>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {expandedData.last_generated_at && (
                                                                            <div className="flex justify-between items-center py-2 border-b">
                                                                                <span className="text-sm text-muted-foreground">Last Generated</span>
                                                                                <span className="text-sm font-medium">{formatDate(expandedData.last_generated_at)}</span>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        <div className="flex justify-between items-center py-2 border-b">
                                                                            <span className="text-sm text-muted-foreground">Invoices Generated</span>
                                                                            <span className="text-sm font-medium">{expandedData.invoices_generated || 0}</span>
                                                                        </div>
                                                                        
                                                                        {expandedData.source_invoice_id && expandedData.source_invoice_number && (
                                                                            <div className="flex justify-between items-center py-2">
                                                                                <span className="text-sm text-muted-foreground">Source Invoice</span>
                                                                                <Button
                                                                                    variant="link"
                                                                                    size="sm"
                                                                                    className="text-sm font-medium text-blue-600 h-auto p-0"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        navigate(`/invoices`);
                                                                                    }}
                                                                                >
                                                                                    {expandedData.source_invoice_number}
                                                                                    <ExternalLink className="h-3 w-3 ml-1" />
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Quick Actions in Schedule Card */}
                                                                    <div className="mt-6 pt-4 border-t space-y-2">
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="w-full justify-start"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <Edit className="h-4 w-4 mr-2" />Edit Template
                                                                        </Button>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="w-full justify-start"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <History className="h-4 w-4 mr-2" />View History
                                                                        </Button>
                                                                        {recurring.status !== 'completed' && (
                                                                            <Button
                                                                                size="sm"
                                                                                className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white"
                                                                                onClick={(e) => handleGenerateNow(recurring.id, e)}
                                                                                disabled={generatingInvoice === recurring.id}
                                                                            >
                                                                                <FileText className="h-4 w-4 mr-2" />
                                                                                {generatingInvoice === recurring.id ? 'Generating...' : 'Generate Next Invoice'}
                                                                            </Button>
                                                                        )}
                                                                        {recurring.status === 'active' && (
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="w-full justify-start border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handlePause(recurring.id);
                                                                                }}
                                                                            >
                                                                                <Pause className="h-4 w-4 mr-2" />Pause Schedule
                                                                            </Button>
                                                                        )}
                                                                        {recurring.status === 'paused' && (
                                                                            <Button
                                                                                size="sm"
                                                                                className="w-full justify-start bg-green-600 hover:bg-green-700 text-white"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleResume(recurring.id);
                                                                                }}
                                                                            >
                                                                                <Play className="h-4 w-4 mr-2" />Resume Schedule
                                                                            </Button>
                                                                        )}
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="w-full justify-start border-destructive text-destructive hover:bg-destructive/10"
                                                                            onClick={(e) => handleDeleteClick(recurring, e)}
                                                                        >
                                                                            <Trash2 className="h-4 w-4 mr-2" />Delete Template
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
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

            {/* Create Recurring Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RefreshCw className="h-5 w-5 text-blue-600" />
                            Create Recurring Invoice
                        </DialogTitle>
                        <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                            Set up an invoice that automatically generates on a schedule
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Template Name *</Label>
                            <Input
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="e.g., Monthly Retainer - Client Name"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Customer</Label>
                                <Select
                                    value={contactId?.toString() || 'none'}
                                    onValueChange={handleContactChange}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select contact" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Select...</SelectItem>
                                        {contacts.map(contact => (
                                            <SelectItem key={contact.id} value={contact.id.toString()}>
                                                {contact.first_name} {contact.last_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Frequency *</Label>
                                <Select value={frequency} onValueChange={(v) => setFrequency(v as any)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                        <SelectItem value="quarterly">Quarterly</SelectItem>
                                        <SelectItem value="yearly">Yearly</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Start Date *</Label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>End Date (optional)</Label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Line Items</Label>
                                <Button variant="outline" size="sm" onClick={addLineItem}>
                                    <Plus className="h-4 w-4 mr-1" />Add
                                </Button>
                            </div>
                            <div className="space-y-3">
                                {lineItems.map((item, index) => (
                                    <div key={item.id} className="flex gap-2 items-start">
                                        <div className="flex-1">
                                            <Input
                                                placeholder="Item name"
                                                value={item.name}
                                                onChange={(e) => updateLineItem(item.id, { name: e.target.value })}
                                            />
                                        </div>
                                        <div className="w-20">
                                            <Input
                                                type="number"
                                                placeholder="Qty"
                                                min="1"
                                                value={item.quantity || ''}
                                                onChange={(e) => updateLineItem(item.id, { quantity: e.target.value === '' ? 1 : parseInt(e.target.value) })}
                                            />
                                        </div>
                                        <div className="w-24">
                                            <Input
                                                type="number"
                                                placeholder="Price"
                                                min="0"
                                                step="0.01"
                                                value={item.unit_price || ''}
                                                onChange={(e) => updateLineItem(item.id, { unit_price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        {lineItems.length > 1 && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeLineItem(item.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="text-right mt-3">
                                <span className="text-sm text-muted-foreground">Total: </span>
                                <span className="font-medium">{formatCurrency(total)}</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} style={{ fontFamily: '"Raleway", sans-serif' }}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveRecurring}
                            disabled={saving || !templateName || lineItems.filter(i => i.name).length === 0}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            style={{ fontFamily: '"Raleway", sans-serif' }}
                        >
                            {saving ? 'Creating...' : 'Create Recurring Invoice'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Recurring Invoice</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete recurring invoice{' '}
                            <span className="font-semibold">{recurringToDelete?.template_name}</span>?
                            {recurringToDelete?.status === 'active' && (
                                <span className="block mt-2 text-yellow-600 dark:text-yellow-500">
                                    This recurring invoice is currently active. No more invoices will be generated after deletion.
                                </span>
                            )}
                            {(recurringToDelete?.invoices_generated || 0) > 0 && (
                                <span className="block mt-2 text-muted-foreground">
                                    {recurringToDelete?.invoices_generated} invoice{recurringToDelete?.invoices_generated !== 1 ? 's have' : ' has'} already been generated from this template. They will not be affected.
                                </span>
                            )}
                            <span className="block mt-2">
                                This action cannot be undone.
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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

export default RecurringInvoicesPage;
