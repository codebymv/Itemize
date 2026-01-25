import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
    Plus,
    Search,
    Receipt,
    MoreHorizontal,
    Trash2,
    Send,
    Download,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    Calendar,
    DollarSign,
    TrendingUp,
    Pencil,
    ChevronDown,
    ChevronRight,
    Loader2,
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
import { getAssetUrl } from '@/lib/api';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import { getInvoices, getInvoice, deleteInvoice, sendInvoice, Invoice as ApiInvoice, Business } from '@/services/invoicesApi';
import { Separator } from '@/components/ui/separator';

interface Invoice {
    id: number;
    invoice_number: string;
    contact_id: number;
    contact_first_name?: string;
    contact_last_name?: string;
    customer_name?: string;
    status: 'draft' | 'sent' | 'viewed' | 'paid' | 'partial' | 'overdue' | 'cancelled';
    total: number;
    amount_paid: number;
    amount_due: number;
    due_date: string;
    sent_at?: string;
    paid_at?: string;
    created_at: string;
}

interface Stats {
    overdue: number;
    overdueCount: number;
    dueWithin30: number;
    dueWithin30Count: number;
    draft: number;
    draftCount: number;
    paid: number;
    paidCount: number;
}

export function InvoicesPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>('all');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
    const [deleting, setDeleting] = useState(false);
    
    // Expanded invoice state
    const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);
    const [expandedInvoiceData, setExpandedInvoiceData] = useState<ApiInvoice | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <Receipt className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SALES & PAYMENTS | Invoices
                    </h1>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative hidden md:block w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search invoices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={handleCreateInvoice}
                    >
                        <Plus className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">New Invoice</span>
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

    const fetchInvoices = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const response = await getInvoices({}, organizationId);
            setInvoices(response.invoices || []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load invoices', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, toast]);

    useEffect(() => {
        fetchInvoices();
    }, [fetchInvoices]);

    const handleCreateInvoice = () => {
        navigate('/invoices/new');
    };

    const handleSendInvoice = async (id: number) => {
        if (!organizationId) return;
        try {
            await sendInvoice(id, organizationId);
            toast({ title: 'Sent', description: 'Invoice sent successfully' });
            fetchInvoices();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to send invoice', variant: 'destructive' });
        }
    };

    const handleDeleteClick = (invoice: Invoice, e: React.MouseEvent) => {
        e.stopPropagation();
        setInvoiceToDelete(invoice);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!organizationId || !invoiceToDelete) return;
        setDeleting(true);
        try {
            await deleteInvoice(invoiceToDelete.id, organizationId);
            setInvoices(prev => prev.filter(i => i.id !== invoiceToDelete.id));
            toast({ title: 'Deleted', description: `Invoice ${invoiceToDelete.invoice_number} deleted successfully` });
            setDeleteDialogOpen(false);
            setInvoiceToDelete(null);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete invoice', variant: 'destructive' });
        } finally {
            setDeleting(false);
        }
    };

    const handleToggleExpand = async (invoiceId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        
        // If clicking on already expanded invoice, collapse it
        if (expandedInvoiceId === invoiceId) {
            setExpandedInvoiceId(null);
            setExpandedInvoiceData(null);
            return;
        }
        
        // Expand new invoice
        setExpandedInvoiceId(invoiceId);
        setExpandedInvoiceData(null);
        setLoadingPreview(true);
        
        if (!organizationId) return;
        
        try {
            const invoice = await getInvoice(invoiceId, organizationId);
            setExpandedInvoiceData(invoice);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load invoice details', variant: 'destructive' });
            setExpandedInvoiceId(null);
        } finally {
            setLoadingPreview(false);
        }
    };

    // Helper to format date without timezone issues
    const formatPreviewDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    };

    const getContactName = (invoice: Invoice) => {
        if (invoice.customer_name) return invoice.customer_name;
        if (invoice.contact_first_name || invoice.contact_last_name) {
            return `${invoice.contact_first_name || ''} ${invoice.contact_last_name || ''}`.trim();
        }
        return 'Unknown';
    };

    // Calculate stats
    const stats = useMemo<Stats>(() => {
        const now = new Date();
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const overdue = invoices.filter(i => 
            ['sent', 'viewed', 'partial'].includes(i.status) && 
            new Date(i.due_date) < now
        );
        const dueWithin30 = invoices.filter(i => 
            ['sent', 'viewed', 'partial'].includes(i.status) && 
            new Date(i.due_date) >= now && 
            new Date(i.due_date) <= in30Days
        );
        const draft = invoices.filter(i => i.status === 'draft');
        const paid = invoices.filter(i => i.status === 'paid');

        return {
            overdue: overdue.reduce((sum, i) => sum + (i.amount_due || 0), 0),
            overdueCount: overdue.length,
            dueWithin30: dueWithin30.reduce((sum, i) => sum + (i.amount_due || 0), 0),
            dueWithin30Count: dueWithin30.length,
            draft: draft.reduce((sum, i) => sum + (i.total || 0), 0),
            draftCount: draft.length,
            paid: paid.reduce((sum, i) => sum + (i.total || 0), 0),
            paidCount: paid.length,
        };
    }, [invoices]);

    // Filter invoices based on tab and search
    const filteredInvoices = useMemo(() => {
        let filtered = invoices;

        // Filter by tab
        switch (activeTab) {
            case 'unpaid':
                filtered = filtered.filter(i => ['sent', 'viewed', 'partial', 'overdue'].includes(i.status));
                break;
            case 'draft':
                filtered = filtered.filter(i => i.status === 'draft');
                break;
            case 'paid':
                filtered = filtered.filter(i => i.status === 'paid');
                break;
        }

        // Filter by search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(i =>
                i.invoice_number?.toLowerCase().includes(query) ||
                getContactName(i).toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [invoices, activeTab, searchQuery]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'sent':
            case 'viewed': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            case 'draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
            case 'overdue': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            case 'partial': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'cancelled': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
            default: return '';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'paid': return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'overdue': return <XCircle className="h-4 w-4 text-red-600" />;
            case 'sent':
            case 'viewed': return <Send className="h-4 w-4 text-blue-600" />;
            case 'partial': return <AlertCircle className="h-4 w-4 text-yellow-600" />;
            default: return <Clock className="h-4 w-4 text-gray-400" />;
        }
    };

    const isOverdue = (invoice: Invoice) => {
        return ['sent', 'viewed', 'partial'].includes(invoice.status) && 
               new Date(invoice.due_date) < new Date();
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
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('unpaid')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Overdue</p>
                                <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.overdue)}</p>
                                <p className="text-xs text-muted-foreground">{stats.overdueCount} invoice{stats.overdueCount !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                                <XCircle className="h-5 w-5 text-red-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('unpaid')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Due within 30 days</p>
                                <p className="text-2xl font-bold">{formatCurrency(stats.dueWithin30)}</p>
                                <p className="text-xs text-muted-foreground">{stats.dueWithin30Count} invoice{stats.dueWithin30Count !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                <Calendar className="h-5 w-5 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('draft')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Draft</p>
                                <p className="text-2xl font-bold">{formatCurrency(stats.draft)}</p>
                                <p className="text-xs text-muted-foreground">{stats.draftCount} invoice{stats.draftCount !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <Clock className="h-5 w-5 text-gray-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('paid')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Paid (Total)</p>
                                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.paid)}</p>
                                <p className="text-xs text-muted-foreground">{stats.paidCount} invoice{stats.paidCount !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-green-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <div className="mb-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                        <TabsTrigger value="all">
                            All invoices
                            <Badge variant="secondary" className="ml-2">{invoices.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="unpaid">
                            Unpaid
                            <Badge variant="secondary" className="ml-2">
                                {invoices.filter(i => ['sent', 'viewed', 'partial', 'overdue'].includes(i.status)).length}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="draft">
                            Draft
                            <Badge variant="secondary" className="ml-2">{stats.draftCount}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="paid">
                            Paid
                            <Badge variant="secondary" className="ml-2">{stats.paidCount}</Badge>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Invoice List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : filteredInvoices.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Receipt className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">
                                {activeTab === 'all' ? 'No invoices yet' : `No ${activeTab} invoices`}
                            </h3>
                            <p className="text-muted-foreground mb-4">
                                {activeTab === 'all' 
                                    ? 'Create invoices to bill your customers' 
                                    : `You don't have any ${activeTab} invoices`}
                            </p>
                            {activeTab === 'all' && (
                                <Button onClick={handleCreateInvoice} className="bg-blue-600 hover:bg-blue-700 text-white">
                                    <Plus className="h-4 w-4 mr-2" />Create Invoice
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredInvoices.map((invoice) => {
                                const isExpanded = expandedInvoiceId === invoice.id;
                                return (
                                    <div key={invoice.id}>
                                        {/* Invoice Row */}
                                        <div
                                            className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                                            onClick={(e) => handleToggleExpand(invoice.id, e)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    {/* Expand/Collapse Chevron */}
                                                    <div className="w-6 h-6 flex items-center justify-center text-muted-foreground">
                                                        {isExpanded ? (
                                                            <ChevronDown className="h-4 w-4" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4" />
                                                        )}
                                                    </div>
                                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                                        {getStatusIcon(isOverdue(invoice) ? 'overdue' : invoice.status)}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="font-medium">{invoice.invoice_number}</p>
                                                            <Badge className={`text-xs ${getStatusBadge(isOverdue(invoice) ? 'overdue' : invoice.status)}`}>
                                                                {isOverdue(invoice) ? 'overdue' : invoice.status}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground">{getContactName(invoice)}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="font-medium">{formatCurrency(invoice.total)}</p>
                                                        {(invoice.amount_due > 0 && invoice.status !== 'draft') && (
                                                            <p className="text-xs text-muted-foreground">
                                                                Due: {formatCurrency(invoice.amount_due)}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                            <Button variant="ghost" size="icon">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                            <DropdownMenuItem onClick={() => navigate(`/invoices/${invoice.id}`)}>
                                                                <Pencil className="h-4 w-4 mr-2" />Edit
                                                            </DropdownMenuItem>
                                                            {invoice.status === 'draft' && (
                                                                <DropdownMenuItem onClick={() => handleSendInvoice(invoice.id)}>
                                                                    <Send className="h-4 w-4 mr-2" />Send
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem>
                                                                <Download className="h-4 w-4 mr-2" />Download PDF
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={(e) => handleDeleteClick(invoice, e)}
                                                                className="text-destructive"
                                                            >
                                                                <Trash2 className="h-4 w-4 mr-2" />Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                            <div className="ml-20 mt-2 text-xs text-muted-foreground">
                                                Due {new Date(invoice.due_date).toLocaleDateString()}
                                                {isOverdue(invoice) && (
                                                    <span className="ml-2 text-red-600">
                                                        ({Math.floor((new Date().getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24))} days overdue)
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
                                                        <span className="ml-2 text-muted-foreground">Loading preview...</span>
                                                    </div>
                                                ) : expandedInvoiceData ? (
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border p-6 max-w-3xl mx-auto shadow-sm">
                                                        {/* Header */}
                                                        <div className="flex justify-between items-start mb-6">
                                                            <div>
                                                                {expandedInvoiceData.business?.logo_url && (
                                                                    <img
                                                                        src={getAssetUrl(expandedInvoiceData.business.logo_url)}
                                                                        alt="Business Logo"
                                                                        className="h-10 w-auto object-contain mb-2"
                                                                    />
                                                                )}
                                                                {expandedInvoiceData.business?.name && (
                                                                    <div className="text-sm">
                                                                        <p className="font-semibold">{expandedInvoiceData.business.name}</p>
                                                                        {expandedInvoiceData.business.email && (
                                                                            <p className="text-muted-foreground">{expandedInvoiceData.business.email}</p>
                                                                        )}
                                                                        {expandedInvoiceData.business.phone && (
                                                                            <p className="text-muted-foreground">{expandedInvoiceData.business.phone}</p>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="text-right">
                                                                <h2 className="text-2xl font-light text-blue-600 mb-1">INVOICE</h2>
                                                                <p className="text-sm text-muted-foreground">{expandedInvoiceData.invoice_number}</p>
                                                                <Badge className={`mt-2 ${getStatusBadge(isOverdue(invoice) ? 'overdue' : invoice.status)}`}>
                                                                    {(isOverdue(invoice) ? 'overdue' : invoice.status).toUpperCase()}
                                                                </Badge>
                                                            </div>
                                                        </div>

                                                        {/* Bill To & Dates */}
                                                        <div className="flex justify-between mb-6">
                                                            <div className="w-1/2">
                                                                <p className="text-xs text-muted-foreground uppercase mb-1">Bill To</p>
                                                                <div className="text-sm">
                                                                    {expandedInvoiceData.customer_name && <p className="font-semibold">{expandedInvoiceData.customer_name}</p>}
                                                                    {expandedInvoiceData.customer_email && <p className="text-muted-foreground">{expandedInvoiceData.customer_email}</p>}
                                                                    {expandedInvoiceData.customer_phone && <p className="text-muted-foreground">{expandedInvoiceData.customer_phone}</p>}
                                                                    {expandedInvoiceData.customer_address && <p className="text-muted-foreground whitespace-pre-line">{expandedInvoiceData.customer_address}</p>}
                                                                </div>
                                                            </div>
                                                            <div className="w-1/2 text-right text-sm space-y-1">
                                                                <div className="flex justify-end gap-4">
                                                                    <span className="text-muted-foreground">Issue Date:</span>
                                                                    <span className="font-medium">{formatPreviewDate(expandedInvoiceData.issue_date)}</span>
                                                                </div>
                                                                <div className="flex justify-end gap-4">
                                                                    <span className="text-muted-foreground">Due Date:</span>
                                                                    <span className="font-medium">{formatPreviewDate(expandedInvoiceData.due_date)}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Line Items Table */}
                                                        <table className="w-full mb-6 text-sm">
                                                            <thead>
                                                                <tr className="border-b-2 text-xs text-muted-foreground uppercase">
                                                                    <th className="text-left py-2 w-1/2">Description</th>
                                                                    <th className="text-right py-2">Qty</th>
                                                                    <th className="text-right py-2">Unit Price</th>
                                                                    <th className="text-right py-2">Amount</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(expandedInvoiceData.items || []).map((item: any, idx: number) => (
                                                                    <tr key={idx} className="border-b">
                                                                        <td className="py-2">
                                                                            <p className="font-medium">{item.name}</p>
                                                                            {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                                                                        </td>
                                                                        <td className="text-right py-2">{item.quantity}</td>
                                                                        <td className="text-right py-2">{formatCurrency(item.unit_price)}</td>
                                                                        <td className="text-right py-2">{formatCurrency(item.quantity * item.unit_price)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>

                                                        {/* Totals */}
                                                        <div className="flex justify-end mb-6">
                                                            <div className="w-56 space-y-1 text-sm">
                                                                <div className="flex justify-between">
                                                                    <span>Subtotal</span>
                                                                    <span>{formatCurrency(expandedInvoiceData.subtotal)}</span>
                                                                </div>
                                                                {(expandedInvoiceData.tax_amount || 0) > 0 && (
                                                                    <div className="flex justify-between">
                                                                        <span>Tax</span>
                                                                        <span>{formatCurrency(expandedInvoiceData.tax_amount)}</span>
                                                                    </div>
                                                                )}
                                                                {(expandedInvoiceData.discount_amount || 0) > 0 && (
                                                                    <div className="flex justify-between">
                                                                        <span>Discount</span>
                                                                        <span>-{formatCurrency(expandedInvoiceData.discount_amount)}</span>
                                                                    </div>
                                                                )}
                                                                <Separator />
                                                                <div className="flex justify-between font-bold text-base">
                                                                    <span>Total</span>
                                                                    <span>{formatCurrency(expandedInvoiceData.total)}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Notes */}
                                                        {expandedInvoiceData.notes && (
                                                            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                                                                <p className="text-xs text-muted-foreground uppercase mb-1">Notes</p>
                                                                <p className="text-sm whitespace-pre-line">{expandedInvoiceData.notes}</p>
                                                            </div>
                                                        )}

                                                        {/* Footer */}
                                                        <div className="text-center text-xs text-muted-foreground pt-4">
                                                            <p>Thank you for your business!</p>
                                                        </div>

                                                        {/* Action Buttons */}
                                                        <div className="flex justify-center gap-3 mt-6 pt-4 border-t">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigate(`/invoices/${invoice.id}`);
                                                                }}
                                                            >
                                                                <Pencil className="h-4 w-4 mr-2" />Edit
                                                            </Button>
                                                            {invoice.status === 'draft' && (
                                                                <Button
                                                                    size="sm"
                                                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleSendInvoice(invoice.id);
                                                                    }}
                                                                >
                                                                    <Send className="h-4 w-4 mr-2" />Send Invoice
                                                                </Button>
                                                            )}
                                                            <Button variant="outline" size="sm">
                                                                <Download className="h-4 w-4 mr-2" />Download PDF
                                                            </Button>
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

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete invoice{' '}
                            <span className="font-semibold">{invoiceToDelete?.invoice_number}</span>?
                            {invoiceToDelete?.status !== 'draft' && (
                                <span className="block mt-2 text-yellow-600 dark:text-yellow-500">
                                    This invoice has been sent to the customer. Deleting it will remove all records.
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
        </div>
    );
}

export default InvoicesPage;
