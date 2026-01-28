import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
    Plus,
    Search,
    Receipt,
    MoreHorizontal,
    MoreVertical,
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
    Repeat,
    CreditCard,
    Wallet,
    Link,
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
import { SendInvoiceModal, SendOptions } from './components/SendInvoiceModal';
import { MakeRecurringModal, RecurringOptions } from './components/MakeRecurringModal';
import { RecordPaymentModal, PaymentData } from './components/RecordPaymentModal';
import { InvoicePreviewCard } from './components/InvoicePreviewCard';
import { PaymentLinkModal } from '@/components/PaymentLinkModal';
import { RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { cn } from '@/lib/utils';

interface Invoice {
    id: number;
    invoice_number: string;
    contact_id: number;
    contact_first_name?: string;
    contact_last_name?: string;
    customer_name?: string;
    customer_email?: string;
    currency?: string;
    status: 'draft' | 'sent' | 'viewed' | 'paid' | 'partial' | 'overdue' | 'cancelled';
    total: number;
    amount_paid: number;
    amount_due: number;
    due_date: string;
    sent_at?: string;
    paid_at?: string;
    created_at: string;
    is_recurring_source?: boolean;
    recurring_template_id?: number;
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
    
    // Send invoice modal state
    const [showSendModal, setShowSendModal] = useState(false);
    const [selectedInvoiceForSend, setSelectedInvoiceForSend] = useState<Invoice | null>(null);
    const [fullInvoiceDataForSend, setFullInvoiceDataForSend] = useState<ApiInvoice | null>(null);
    const [sending, setSending] = useState(false);
    const [isResend, setIsResend] = useState(false);
    
    // Make recurring modal state
    const [showRecurringModal, setShowRecurringModal] = useState(false);
    const [selectedInvoiceForRecurring, setSelectedInvoiceForRecurring] = useState<Invoice | null>(null);
    const [fullInvoiceDataForRecurring, setFullInvoiceDataForRecurring] = useState<ApiInvoice | null>(null);
    const [converting, setConverting] = useState(false);

    // Record payment modal state
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
    const [fullInvoiceDataForPayment, setFullInvoiceDataForPayment] = useState<ApiInvoice | null>(null);
    const [recordingPayment, setRecordingPayment] = useState(false);

    // Payment link modal state
    const [showPaymentLinkModal, setShowPaymentLinkModal] = useState(false);
    const [selectedInvoiceForPaymentLink, setSelectedInvoiceForPaymentLink] = useState<Invoice | null>(null);

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

    // Handle payment success/cancelled query params from Stripe redirect
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const paymentStatus = params.get('payment');
        const invoiceId = params.get('invoice');
        
        if (paymentStatus === 'success') {
            toast({ 
                title: 'Payment Successful', 
                description: invoiceId 
                    ? `Payment for invoice #${invoiceId} has been processed.`
                    : 'The invoice payment has been processed.'
            });
            // Clean up URL without reloading
            window.history.replaceState({}, '', window.location.pathname);
            // Refresh invoices to show updated status
            fetchInvoices();
        } else if (paymentStatus === 'cancelled') {
            toast({ 
                title: 'Payment Cancelled', 
                description: 'The payment was cancelled. You can try again anytime.',
                variant: 'destructive'
            });
            // Clean up URL
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [toast, fetchInvoices]);

    const handleCreateInvoice = () => {
        navigate('/invoices/new');
    };

    // Open send modal for an invoice
    const handleOpenSendModal = async (invoice: Invoice, resend: boolean = false) => {
        if (!organizationId) return;
        
        setSelectedInvoiceForSend(invoice);
        setIsResend(resend);
        
        // Fetch full invoice data for modal display
        try {
            const fullData = await getInvoice(invoice.id, organizationId);
            setFullInvoiceDataForSend(fullData);
        } catch (error) {
            // If fetch fails, use basic data
            setFullInvoiceDataForSend(null);
        }
        
        setShowSendModal(true);
    };

    // Actually send the invoice with email options
    const handleSendInvoice = async (options: SendOptions) => {
        if (!organizationId || !selectedInvoiceForSend) return;
        
        setSending(true);
        try {
            const result = await sendInvoice(selectedInvoiceForSend.id, organizationId, {
                subject: options.subject,
                message: options.message,
                ccEmails: options.ccEmails,
                includePaymentLink: options.includePaymentLink,
                resend: isResend
            });
            
            // Show appropriate toast based on email status
            if (result.emailSent) {
                toast({ title: isResend ? 'Resent' : 'Sent', description: 'Invoice email delivered successfully' });
            } else if (result.emailError) {
                toast({ 
                    title: 'Sent with warning', 
                    description: `Invoice ${isResend ? 'resent' : 'marked as sent'} but email failed: ${result.emailError}`,
                    variant: 'destructive'
                });
            } else {
                toast({ title: isResend ? 'Resent' : 'Sent', description: `Invoice ${isResend ? 'resent' : 'marked as sent'}` });
            }
            
            setShowSendModal(false);
            setSelectedInvoiceForSend(null);
            fetchInvoices();
        } catch (error: any) {
            const errorMessage = error?.response?.data?.error || 'Failed to send invoice';
            toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
        } finally {
            setSending(false);
        }
    };

    // Open make recurring modal for an invoice
    const handleOpenRecurringModal = async (invoice: Invoice, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!organizationId) return;
        
        // Don't allow for cancelled/refunded invoices
        if (['cancelled', 'refunded'].includes(invoice.status)) {
            toast({ title: 'Cannot Convert', description: 'Cancelled or refunded invoices cannot be made recurring', variant: 'destructive' });
            return;
        }
        
        setSelectedInvoiceForRecurring(invoice);
        
        // Fetch full invoice data for modal display
        try {
            const fullData = await getInvoice(invoice.id, organizationId);
            setFullInvoiceDataForRecurring(fullData);
        } catch (error) {
            setFullInvoiceDataForRecurring(null);
        }
        
        setShowRecurringModal(true);
    };

    // Create recurring template from invoice
    const handleMakeRecurring = async (options: RecurringOptions) => {
        if (!organizationId || !selectedInvoiceForRecurring) return;
        
        setConverting(true);
        try {
            await api.post(`/api/invoices/recurring/from-invoice/${selectedInvoiceForRecurring.id}`, {
                template_name: options.template_name,
                frequency: options.frequency,
                start_date: options.start_date,
                end_date: options.end_date,
            });
            
            toast({ title: 'Template Created', description: 'Recurring template created. Original invoice has been preserved.' });
            setShowRecurringModal(false);
            setSelectedInvoiceForRecurring(null);
            setFullInvoiceDataForRecurring(null);
            
            // Refresh invoices to show updated is_recurring_source status
            fetchInvoices();
            
            // Navigate to recurring invoices page to see the new template
            navigate('/recurring-invoices');
        } catch (error: any) {
            const errorMessage = error?.response?.data?.error || 'Failed to create recurring template';
            toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
        } finally {
            setConverting(false);
        }
    };

    // Open record payment modal for an invoice
    const handleOpenPaymentModal = async (invoice: Invoice, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!organizationId) return;

        // Don't allow for fully paid, cancelled, or refunded invoices
        if (invoice.amount_due <= 0 || ['cancelled', 'refunded', 'paid'].includes(invoice.status)) {
            toast({ title: 'Cannot Record Payment', description: 'This invoice is already paid or cancelled', variant: 'destructive' });
            return;
        }
        
        setSelectedInvoiceForPayment(invoice);
        
        // Fetch full invoice data for modal display
        try {
            const fullData = await getInvoice(invoice.id, organizationId);
            setFullInvoiceDataForPayment(fullData);
        } catch (error) {
            setFullInvoiceDataForPayment(null);
        }
        
        setShowPaymentModal(true);
    };

    // Record a manual payment
    const handleRecordPayment = async (paymentData: PaymentData) => {
        if (!organizationId || !selectedInvoiceForPayment) return;
        
        setRecordingPayment(true);
        try {
            await api.post(`/api/invoices/${selectedInvoiceForPayment.id}/record-payment`, {
                amount: paymentData.amount,
                payment_method: paymentData.payment_method,
                notes: paymentData.notes,
            }, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            
            toast({ title: 'Payment Recorded', description: `Payment of $${paymentData.amount.toFixed(2)} has been recorded.` });
            setShowPaymentModal(false);
            setSelectedInvoiceForPayment(null);
            setFullInvoiceDataForPayment(null);
            
            // Refresh invoices to show updated payment status
            fetchInvoices();
        } catch (error: any) {
            const errorMessage = error?.response?.data?.error || 'Failed to record payment';
            toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
        } finally {
            setRecordingPayment(false);
        }
    };

    // Open payment link modal
    const handleCreatePaymentLink = (invoice: Invoice, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!organizationId) return;

        // Don't allow for fully paid, cancelled, or refunded invoices
        if (invoice.amount_due <= 0 || ['cancelled', 'refunded', 'paid'].includes(invoice.status)) {
            toast({ title: 'Cannot Create Payment Link', description: 'This invoice is already paid or cancelled', variant: 'destructive' });
            return;
        }
        
        setSelectedInvoiceForPaymentLink(invoice);
        setShowPaymentLinkModal(true);
    };

    // Generate payment link (called from modal)
    const generatePaymentLink = async (invoiceId: number): Promise<{ url: string }> => {
        if (!organizationId) throw new Error('Organization not found');
        
        const response = await api.post(`/api/invoices/${invoiceId}/create-payment-link`, {}, {
            headers: { 'x-organization-id': organizationId.toString() }
        });
        
        const { url } = response.data;
        
        if (!url) {
            throw new Error('No checkout URL returned');
        }
        
        return { url };
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

    // Set header content (must be after stats is defined)
    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <Receipt className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SALES & PAYMENTS | Invoices
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="h-9">
                            <TabsTrigger value="all" className="text-xs">
                                All invoices
                                <Badge variant="secondary" className="ml-2">{invoices.length}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="unpaid" className="text-xs">
                                Unpaid
                                <Badge variant="secondary" className="ml-2">
                                    {invoices.filter(i => ['sent', 'viewed', 'partial', 'overdue'].includes(i.status)).length}
                                </Badge>
                            </TabsTrigger>
                            <TabsTrigger value="draft" className="text-xs">
                                Draft
                                <Badge variant="secondary" className="ml-2">{stats.draftCount}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="paid" className="text-xs">
                                Paid
                                <Badge variant="secondary" className="ml-2">{stats.paidCount}</Badge>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="relative w-full max-w-xs">
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
                        <Plus className="h-4 w-4 mr-2" />
                        New Invoice
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, theme, setHeaderContent, activeTab, invoices, stats]);

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
            case 'viewed': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
            case 'draft': return 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300';
            case 'overdue': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            case 'partial': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
            case 'cancelled': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
            default: return '';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'paid': return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
            case 'overdue': return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
            case 'sent':
            case 'viewed': return <Send className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
            case 'partial': return <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
            case 'draft': return <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />;
            default: return <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500" />;
        }
    };

    const getStatusIconBg = (status: string) => {
        switch (status) {
            case 'paid': return 'bg-green-100 dark:bg-green-900';
            case 'overdue': return 'bg-red-100 dark:bg-red-900';
            case 'sent':
            case 'viewed':
            case 'partial': return 'bg-orange-100 dark:bg-orange-900';
            case 'draft': return 'bg-sky-100 dark:bg-sky-900';
            default: return 'bg-gray-100 dark:bg-gray-800';
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
        <>
            {/* Mobile Controls Bar */}
            <MobileControlsBar className="flex-col items-stretch">
                <div className="flex items-center gap-2 w-full">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search invoices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={handleCreateInvoice}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full h-9">
                        <TabsTrigger value="all" className="flex-1 text-xs">
                            All
                            <Badge variant="secondary" className="ml-1">{invoices.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="unpaid" className="flex-1 text-xs">
                            Unpaid
                            <Badge variant="secondary" className="ml-1">
                                {invoices.filter(i => ['sent', 'viewed', 'partial', 'overdue'].includes(i.status)).length}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="draft" className="flex-1 text-xs">
                            Draft
                            <Badge variant="secondary" className="ml-1">{stats.draftCount}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="paid" className="flex-1 text-xs">
                            Paid
                            <Badge variant="secondary" className="ml-1">{stats.paidCount}</Badge>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </MobileControlsBar>

            <div className="container mx-auto p-6 max-w-7xl">
                {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadge('overdue')}`}>Overdue</Badge>
                                <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.overdue)}</p>
                                <p className="text-xs text-muted-foreground">{stats.overdueCount} invoice{stats.overdueCount !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadge('draft')}`}>Draft</Badge>
                                <p className="text-2xl font-bold text-sky-600">{formatCurrency(stats.draft)}</p>
                                <p className="text-xs text-muted-foreground">{stats.draftCount} invoice{stats.draftCount !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                                <Clock className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadge('sent')}`}>Due within 30 days</Badge>
                                <p className="text-2xl font-bold text-orange-600">{formatCurrency(stats.dueWithin30)}</p>
                                <p className="text-xs text-muted-foreground">{stats.dueWithin30Count} invoice{stats.dueWithin30Count !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                                <Calendar className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadge('paid')}`}>Paid (Total)</Badge>
                                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.paid)}</p>
                                <p className="text-xs text-muted-foreground">{stats.paidCount} invoice{stats.paidCount !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
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
                                const effectiveStatus = isOverdue(invoice) ? 'overdue' : invoice.status;
                                return (
                                    <div key={invoice.id}>
                                        {/* Invoice Row - Aligned with VaultCard Pattern */}
                                        <div
                                            className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                                            onClick={(e) => handleToggleExpand(invoice.id, e)}
                                        >
                                            {/* Header Row: Icon + Invoice # on left, Amount + Chevron + Menu on right */}
                                            <div className="flex items-center justify-between">
                                                {/* Left Side: Status Icon + Invoice Number */}
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    {/* Status Icon */}
                                                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getStatusIconBg(effectiveStatus)}`}>
                                                        {getStatusIcon(effectiveStatus)}
                                                    </div>
                                                    {/* Invoice Number */}
                                                    <p className="font-medium text-sm md:text-base">{invoice.invoice_number}</p>
                                                </div>
                                                
                                                {/* Right Side: Amount + Chevron + Menu */}
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <div className="text-right hidden sm:block">
                                                        <p className="font-semibold text-sm md:text-base">{formatCurrency(invoice.total)}</p>
                                                    </div>
                                                    {/* Chevron - Collapsible Trigger */}
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-8 w-8 p-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleToggleExpand(invoice.id, e);
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
                                                            <DropdownMenuItem onClick={() => navigate(`/invoices/${invoice.id}`)} className="group/menu">
                                                                <Pencil className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Edit
                                                            </DropdownMenuItem>
                                                            {invoice.status === 'draft' && (
                                                                <DropdownMenuItem onClick={() => handleOpenSendModal(invoice, false)} className="group/menu">
                                                                    <Send className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Send
                                                                </DropdownMenuItem>
                                                            )}
                                                            {['sent', 'viewed', 'partial', 'overdue'].includes(invoice.status) && (
                                                                <DropdownMenuItem onClick={() => handleOpenSendModal(invoice, true)} className="group/menu">
                                                                    <RefreshCw className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Resend
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem className="group/menu">
                                                                <Download className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Download PDF
                                                            </DropdownMenuItem>
                                                            {invoice.amount_due > 0 && !['cancelled', 'refunded', 'paid'].includes(invoice.status) && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onClick={(e) => handleOpenPaymentModal(invoice, e)} className="group/menu">
                                                                        <Wallet className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Record Payment
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={(e) => handleCreatePaymentLink(invoice, e)} className="group/menu">
                                                                        <CreditCard className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Create Payment Link
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                            {!['cancelled', 'refunded'].includes(invoice.status) && !invoice.is_recurring_source && (
                                                                <DropdownMenuItem onClick={(e) => handleOpenRecurringModal(invoice, e)} className="group/menu">
                                                                    <Repeat className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Make Recurring
                                                                </DropdownMenuItem>
                                                            )}
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
                                            
                                            {/* Middle Row: Contact Name + Status Badge + Due Date (horizontally distributed) */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                                {/* Contact Name */}
                                                <span className="text-sm text-muted-foreground font-medium">{getContactName(invoice)}</span>
                                                
                                                {/* Status Badge */}
                                                <Badge className={`text-xs pointer-events-none cursor-default ${getStatusBadge(effectiveStatus)}`}>
                                                    {effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1)}
                                                </Badge>
                                                
                                                {/* Due Date */}
                                                <span className="text-xs text-muted-foreground">
                                                    Due {new Date(invoice.due_date).toLocaleDateString()}
                                                </span>
                                                
                                                {/* Recurring badges - inline */}
                                                {invoice.is_recurring_source && (
                                                    <Badge variant="outline" className="text-xs">Recurring</Badge>
                                                )}
                                                {invoice.recurring_template_id && (
                                                    <Badge variant="outline" className="text-xs">Auto-generated</Badge>
                                                )}
                                            </div>
                                            
                                            {/* Footer Row: Amount (on mobile) + Overdue status + Amount due */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                <span className="sm:hidden font-semibold">{formatCurrency(invoice.total)}</span>
                                                {isOverdue(invoice) && (
                                                    <span className="text-red-600 font-medium">
                                                        {Math.floor((new Date().getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24))}d overdue
                                                    </span>
                                                )}
                                                {(invoice.amount_due > 0 && invoice.status !== 'draft') && (
                                                    <span className="text-muted-foreground">
                                                        Due: {formatCurrency(invoice.amount_due)}
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
                                                    <div className="max-w-3xl mx-auto">
                                                        <InvoicePreviewCard
                                                            variant="invoice"
                                                            business={expandedInvoiceData.business}
                                                            documentNumber={expandedInvoiceData.invoice_number}
                                                            issueDate={expandedInvoiceData.issue_date}
                                                            dueDate={expandedInvoiceData.due_date}
                                                            customerName={expandedInvoiceData.customer_name}
                                                            customerEmail={expandedInvoiceData.customer_email}
                                                            customerPhone={expandedInvoiceData.customer_phone}
                                                            customerAddress={expandedInvoiceData.customer_address}
                                                            items={(expandedInvoiceData.items || []).map((item: any) => ({
                                                                name: item.name,
                                                                description: item.description,
                                                                quantity: item.quantity,
                                                                unit_price: item.unit_price,
                                                                tax_rate: item.tax_rate
                                                            }))}
                                                            subtotal={expandedInvoiceData.subtotal}
                                                            taxAmount={expandedInvoiceData.tax_amount}
                                                            discountAmount={expandedInvoiceData.discount_amount}
                                                            total={expandedInvoiceData.total}
                                                            currency={expandedInvoiceData.currency}
                                                            notes={expandedInvoiceData.notes}
                                                        />

                                                        {/* Action Buttons */}
                                                        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-6 pt-4 border-t">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigate(`/invoices/${invoice.id}`);
                                                                }}
                                                                className="text-xs sm:text-sm"
                                                            >
                                                                <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                                                <span className="hidden xs:inline">Edit</span>
                                                                <span className="xs:hidden">Edit</span>
                                                            </Button>
                                                            {invoice.status === 'draft' && (
                                                                <Button
                                                                    size="sm"
                                                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleOpenSendModal(invoice, false);
                                                                    }}
                                                                >
                                                                    <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                                                    <span className="hidden sm:inline">Send Invoice</span>
                                                                    <span className="sm:hidden">Send</span>
                                                                </Button>
                                                            )}
                                                            {['sent', 'viewed', 'partial', 'overdue'].includes(invoice.status) && (
                                                                <Button
                                                                    size="sm"
                                                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleOpenSendModal(invoice, true);
                                                                    }}
                                                                >
                                                                    <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                                                    <span className="hidden sm:inline">Resend Invoice</span>
                                                                    <span className="sm:hidden">Resend</span>
                                                                </Button>
                                                            )}
                                                            <Button 
                                                                size="sm"
                                                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                                            >
                                                                <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                                                <span className="hidden sm:inline">Download PDF</span>
                                                                <span className="sm:hidden">PDF</span>
                                                            </Button>
                                                            {invoice.amount_due > 0 && !['cancelled', 'refunded', 'paid'].includes(invoice.status) && (
                                                                <>
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={(e) => handleOpenPaymentModal(invoice, e)}
                                                                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                                                    >
                                                                        <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                                                        <span className="hidden sm:inline">Record Payment</span>
                                                                        <span className="sm:hidden">Payment</span>
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={(e) => handleCreatePaymentLink(invoice, e)}
                                                                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                                                    >
                                                                        <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                                                        <span className="hidden sm:inline">Payment Link</span>
                                                                        <span className="sm:hidden">Link</span>
                                                                    </Button>
                                                                </>
                                                            )}
                                                            {!['cancelled', 'refunded'].includes(invoice.status) && !invoice.is_recurring_source && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={(e) => handleOpenRecurringModal(invoice, e)}
                                                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                                                >
                                                                    <Repeat className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                                                    <span className="hidden sm:inline">Make Recurring</span>
                                                                    <span className="sm:hidden">Recurring</span>
                                                                </Button>
                                                            )}
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

            {/* Send Invoice Modal */}
            {selectedInvoiceForSend && (
                <SendInvoiceModal
                    open={showSendModal}
                    onOpenChange={(open) => {
                        setShowSendModal(open);
                        if (!open) {
                            setSelectedInvoiceForSend(null);
                            setFullInvoiceDataForSend(null);
                        }
                    }}
                    onSend={handleSendInvoice}
                    sending={sending}
                    invoice={fullInvoiceDataForSend || undefined}
                    invoiceNumber={selectedInvoiceForSend.invoice_number}
                    customerName={fullInvoiceDataForSend?.customer_name || selectedInvoiceForSend.customer_name || getContactName(selectedInvoiceForSend)}
                    customerEmail={fullInvoiceDataForSend?.customer_email || ''}
                    total={selectedInvoiceForSend.total}
                    currency={fullInvoiceDataForSend?.currency || 'USD'}
                    dueDate={selectedInvoiceForSend.due_date}
                    business={fullInvoiceDataForSend?.business}
                />
            )}

            {/* Make Recurring Modal */}
            {selectedInvoiceForRecurring && (
                <MakeRecurringModal
                    open={showRecurringModal}
                    onOpenChange={(open) => {
                        setShowRecurringModal(open);
                        if (!open) {
                            setSelectedInvoiceForRecurring(null);
                            setFullInvoiceDataForRecurring(null);
                        }
                    }}
                    onConfirm={handleMakeRecurring}
                    converting={converting}
                    invoiceNumber={selectedInvoiceForRecurring.invoice_number}
                    customerName={fullInvoiceDataForRecurring?.customer_name || selectedInvoiceForRecurring.customer_name || getContactName(selectedInvoiceForRecurring)}
                    total={selectedInvoiceForRecurring.total}
                    currency={fullInvoiceDataForRecurring?.currency || 'USD'}
                    itemCount={fullInvoiceDataForRecurring?.items?.length || 0}
                />
            )}

            {/* Record Payment Modal */}
            {selectedInvoiceForPayment && (
                <RecordPaymentModal
                    open={showPaymentModal}
                    onOpenChange={(open) => {
                        setShowPaymentModal(open);
                        if (!open) {
                            setSelectedInvoiceForPayment(null);
                            setFullInvoiceDataForPayment(null);
                        }
                    }}
                    onConfirm={handleRecordPayment}
                    recording={recordingPayment}
                    invoiceNumber={selectedInvoiceForPayment.invoice_number}
                    customerName={fullInvoiceDataForPayment?.customer_name || selectedInvoiceForPayment.customer_name || getContactName(selectedInvoiceForPayment)}
                    amountDue={selectedInvoiceForPayment.amount_due}
                    total={selectedInvoiceForPayment.total}
                    amountPaid={selectedInvoiceForPayment.amount_paid}
                    currency={fullInvoiceDataForPayment?.currency || 'USD'}
                />
            )}

            {/* Payment Link Modal */}
            {selectedInvoiceForPaymentLink && (
                <PaymentLinkModal
                    isOpen={showPaymentLinkModal}
                    onClose={() => {
                        setShowPaymentLinkModal(false);
                        setSelectedInvoiceForPaymentLink(null);
                    }}
                    invoiceNumber={selectedInvoiceForPaymentLink.invoice_number}
                    invoiceTotal={selectedInvoiceForPaymentLink.total}
                    amountDue={selectedInvoiceForPaymentLink.amount_due}
                    customerName={selectedInvoiceForPaymentLink.customer_name || getContactName(selectedInvoiceForPaymentLink)}
                    dueDate={selectedInvoiceForPaymentLink.due_date}
                    currency={selectedInvoiceForPaymentLink.currency || 'USD'}
                    onGenerateLink={() => generatePaymentLink(selectedInvoiceForPaymentLink.id)}
                />
            )}
        </div>
        </>
    );
}

export default InvoicesPage;
