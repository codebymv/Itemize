import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Search,
    Receipt,
    MoreHorizontal,
    MoreVertical,
    Trash2,
    Send,
    Download,
    Calendar,
    DollarSign,
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
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { getAssetUrl } from '@/lib/api';
import { useOrganization } from '@/hooks/useOrganization';
import {
    getInvoices,
    getInvoice,
    deleteInvoice,
    sendInvoice,
    recordPayment,
    createPaymentLink,
    createRecurringTemplateFromInvoice,
    downloadInvoicePdf,
    Invoice as ApiInvoice,
    Business
} from '@/services/invoicesApi';
import { Separator } from '@/components/ui/separator';
import { SendInvoiceModal, SendOptions } from './components/SendInvoiceModal';
import { MakeRecurringModal, RecurringOptions } from './components/MakeRecurringModal';
import { RecordPaymentModal, PaymentData } from './components/RecordPaymentModal';
import { InvoicePreviewCard } from './components/InvoicePreviewCard';
import { PaymentLinkModal } from '@/components/PaymentLinkModal';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageLayout } from '@/components/layout/PageLayout';
import { MobileQueryBar } from '@/components/layout/MobileQueryBar';
import {
    HeaderAction,
    HeaderCombinedQuery,
    HeaderFilters,
    HeaderSearch,
} from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { StatCard } from '@/components/StatCard';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { getInvoiceStatusVisual } from './constants/invoiceConstants';
import { getPaidAgeLabel, getWholeDaysSince } from './invoiceRowMetadata';
import { InvoiceViewSelect, type InvoiceView } from './components/InvoiceViewSelect';
import { ExpandedRowActionLabel, ExpandedRowActions } from '@/components/ui/expanded-row';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
    if (error && typeof error === 'object') {
        const maybeApiError = error as { response?: { data?: { error?: string } }; message?: string };
        return maybeApiError.response?.data?.error || maybeApiError.message || fallback;
    }
    return fallback;
};

interface Invoice {
    id: number;
    invoice_number: string;
    contact_id?: number;
    contact_first_name?: string;
    contact_last_name?: string;
    customer_name?: string;
    customer_email?: string;
    currency?: string;
    status: 'draft' | 'sent' | 'viewed' | 'paid' | 'partial' | 'overdue' | 'cancelled' | 'refunded';
    total: number;
    amount_paid: number;
    amount_due: number;
    due_date: string;
    sent_at?: string;
    paid_at?: string;
    created_at: string;
    is_recurring_source?: boolean;
    recurring_template_id?: number;
    recurring_source_template_id?: number;
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
    // Onboarding
    const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('invoices');

    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({
        onError: () => 'Failed to initialize.'
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>('all');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
    const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<number | null>(null);
    
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
        if (!orgLoading && !organizationId) {
            setLoading(false);
        }
    }, [orgLoading, organizationId]);

    const fetchInvoices = useCallback(async () => {
        if (!organizationId || orgLoading) {
            return;
        }
        setLoading(true);
        try {
            const response = await getInvoices({}, organizationId);
            setInvoices(response.invoices || []);
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToLoad('invoices'), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, orgLoading, toast]);

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
        } catch (error: unknown) {
            const errorMessage = getApiErrorMessage(error, 'Failed to send invoice');
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
            await createRecurringTemplateFromInvoice(
                selectedInvoiceForRecurring.id,
                {
                    template_name: options.template_name,
                    frequency: options.frequency,
                    start_date: options.start_date,
                    end_date: options.end_date,
                },
                organizationId
            );
            
            toast({
                title: 'Recurring schedule created',
                description: 'The original invoice is unchanged. Manage future invoices under Recurring schedules.',
            });
            setShowRecurringModal(false);
            setSelectedInvoiceForRecurring(null);
            setFullInvoiceDataForRecurring(null);
            
            // Refresh invoices to show updated is_recurring_source status
            fetchInvoices();
            
        } catch (error: unknown) {
            const errorMessage = getApiErrorMessage(error, 'Failed to create recurring template');
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

    // Record a manual payment (with optimistic update)
    const handleRecordPayment = async (paymentData: PaymentData) => {
        if (!organizationId || !selectedInvoiceForPayment) return;
        const inv = selectedInvoiceForPayment;
        const newAmountPaid = inv.amount_paid + paymentData.amount;
        const newAmountDue = inv.amount_due - paymentData.amount;
        const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';
        const previousInvoices = invoices;
        setInvoices((prev) =>
            prev.map((i) =>
                i.id === inv.id
                    ? {
                          ...i,
                          amount_paid: newAmountPaid,
                          amount_due: newAmountDue,
                          status: newStatus,
                      }
                    : i
            )
        );
        setRecordingPayment(true);
        try {
            const result = await recordPayment(
                inv.id,
                {
                    amount: paymentData.amount,
                    payment_method: paymentData.payment_method,
                    notes: paymentData.notes,
                },
                organizationId
            );
            setInvoices((prev) =>
                prev.map((invoice) =>
                    invoice.id === inv.id
                        ? {
                              ...invoice,
                              amount_paid: result.invoice.amount_paid,
                              amount_due: result.invoice.amount_due,
                              status: result.invoice.status as Invoice['status'],
                              ...(result.invoice.status === 'paid' && result.payment.paid_at
                                  ? { paid_at: result.payment.paid_at }
                                  : {}),
                          }
                        : invoice
                )
            );
            toast({ title: 'Payment Recorded', description: `Payment of $${paymentData.amount.toFixed(2)} has been recorded.` });
            setShowPaymentModal(false);
            setSelectedInvoiceForPayment(null);
            setFullInvoiceDataForPayment(null);
            fetchInvoices();
        } catch (error: unknown) {
            setInvoices(previousInvoices);
            const errorMessage = getApiErrorMessage(error, 'Failed to record payment');
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
        
        const { url } = await createPaymentLink(invoiceId, organizationId);
        
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

    const handleDownloadPdf = async (invoice: Invoice, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!organizationId || downloadingInvoiceId !== null) return;
        setDownloadingInvoiceId(invoice.id);
        try {
            await downloadInvoicePdf(invoice.id, organizationId);
        } catch (error: unknown) {
            toast({
                title: 'Error',
                description: getApiErrorMessage(error, 'Failed to download invoice PDF'),
                variant: 'destructive'
            });
        } finally {
            setDownloadingInvoiceId(null);
        }
    };

    const confirmDelete = async (): Promise<boolean> => {
        if (!organizationId || !invoiceToDelete) return false;
        try {
            await deleteInvoice(invoiceToDelete.id, organizationId);
            setInvoices(prev => prev.filter(i => i.id !== invoiceToDelete.id));
            return true;
        } catch (error) {
            return false;
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

    const isOverdue = (invoice: Invoice) => {
        return ['sent', 'viewed', 'partial'].includes(invoice.status) && 
               new Date(invoice.due_date) < new Date();
    };

    const headerFilterCount = Number(activeTab !== 'all');
    const headerQueryCount = headerFilterCount + Number(searchQuery.trim().length > 0);
    const handleInvoiceViewChange = (view: InvoiceView) => {
        navigate(view === 'recurring' ? '/invoices/recurring' : '/invoices');
    };
    const statusFilter = (compact = false) => (
        <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[8.5rem] bg-muted/20'}>
                <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
        </Select>
    );

    if (initError) {
        return (
            <PageLayout
                title="INVOICES"
                icon={<Receipt className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
            >
                <ErrorState
                    title="Failed to initialize"
                    description={initError}
                    onAction={() => void fetchInvoices()}
                />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="INVOICES"
            icon={<Receipt className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
            mobileClassName="flex-col items-stretch"
            desktopTools={{
                search: (
                    <HeaderSearch
                        label="Search invoices"
                        placeholder="Search invoices..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                    />
                ),
                filters: (
                    <div className="flex items-center gap-2">
                        <HeaderFilters
                            label="Select invoice view"
                            compactChildren={(
                                <InvoiceViewSelect
                                    value="invoices"
                                    onValueChange={handleInvoiceViewChange}
                                    compact
                                />
                            )}
                            preferExpanded
                        >
                            <InvoiceViewSelect
                                value="invoices"
                                onValueChange={handleInvoiceViewChange}
                            />
                        </HeaderFilters>
                        <HeaderFilters
                            label="Filter invoices by status"
                            activeCount={headerFilterCount}
                            compactChildren={statusFilter(true)}
                            preferExpanded="when-roomy"
                        >
                            {statusFilter()}
                        </HeaderFilters>
                    </div>
                ),
                combinedQuery: (
                    <HeaderCombinedQuery
                        label="Search and filter invoices"
                        placeholder="Search invoices..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        activeCount={headerQueryCount}
                    >
                        <InvoiceViewSelect
                            value="invoices"
                            onValueChange={handleInvoiceViewChange}
                            compact
                        />
                        {statusFilter(true)}
                    </HeaderCombinedQuery>
                ),
                primaryAction: (
                    <HeaderAction
                        label="New invoice"
                        icon={<Plus className="h-4 w-4" />}
                        onClick={handleCreateInvoice}
                    />
                ),
            }}
            mobileActions={
                <MobileQueryBar
                  search={
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            aria-label="Search invoices"
                            placeholder="Search invoices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
                        />
                    </div>
                  }
                  filters={
                    <HeaderCombinedQuery label="Search and filter invoices" placeholder="Search invoices..." value={searchQuery} onChange={setSearchQuery} activeCount={headerQueryCount}>
                      <div className="space-y-2"><InvoiceViewSelect value="invoices" onValueChange={handleInvoiceViewChange} compact />{statusFilter(true)}</div>
                    </HeaderCombinedQuery>
                  }
                  actions={
                    <Button
                        size="icon"
                        aria-label="New invoice"
                        className="h-11 w-11 bg-blue-600 text-white hover:bg-blue-700"
                        onClick={handleCreateInvoice}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                  }
                />
            }
        >
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={closeOnboarding}
                onComplete={completeOnboarding}
                onDismiss={dismissOnboarding}
                content={ONBOARDING_CONTENT.invoices}
            />

            {/* Summary Cards */}
            <ResponsiveCardRail
                label="Invoice status summary"
                desktopColumns="md:grid-cols-4"
                className="responsive-stat-summary"
            >
                <StatCard
                    title="Overdue"
                    badgeText="Overdue"
                    value={formatCurrency(stats.overdue)}
                    icon={getInvoiceStatusVisual('overdue').icon}
                    description={`${stats.overdueCount} invoice${stats.overdueCount !== 1 ? 's' : ''}`}
                    colorTheme={getInvoiceStatusVisual('overdue').theme}
                    isLoading={loading}
                />
                <StatCard
                    title="Draft"
                    badgeText="Draft"
                    value={formatCurrency(stats.draft)}
                    icon={getInvoiceStatusVisual('draft').icon}
                    description={`${stats.draftCount} invoice${stats.draftCount !== 1 ? 's' : ''}`}
                    colorTheme={getInvoiceStatusVisual('draft').theme}
                    isLoading={loading}
                />
                <StatCard
                    title="Due within 30 days"
                    badgeText="Due within 30 days"
                    value={formatCurrency(stats.dueWithin30)}
                    icon={Calendar}
                    description={`${stats.dueWithin30Count} invoice${stats.dueWithin30Count !== 1 ? 's' : ''}`}
                    colorTheme="orange"
                    isLoading={loading}
                />
                <StatCard
                    title="Paid"
                    badgeText="Paid (Total)"
                    value={formatCurrency(stats.paid)}
                    icon={getInvoiceStatusVisual('paid').icon}
                    description={`${stats.paidCount} invoice${stats.paidCount !== 1 ? 's' : ''}`}
                    colorTheme={getInvoiceStatusVisual('paid').theme}
                    isLoading={loading}
                />
            </ResponsiveCardRail>

            {/* Invoice List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : filteredInvoices.length === 0 ? (
                        <EmptyState
                            icon={Receipt}
                            title={activeTab === 'all' ? 'No invoices yet' : `No ${activeTab} invoices`}
                            description={
                                activeTab === 'all'
                                    ? 'Create invoices to bill your customers'
                                    : `You don't have any ${activeTab} invoices`
                            }
                            actionLabel={activeTab === 'all' ? 'New invoice' : undefined}
                            onAction={activeTab === 'all' ? handleCreateInvoice : undefined}
                            className="p-12"
                        />
                    ) : (
                        <div className="divide-y">
                            {filteredInvoices.map((invoice) => {
                                const isExpanded = expandedInvoiceId === invoice.id;
                                const effectiveStatus = isOverdue(invoice) ? 'overdue' : invoice.status;
                                const statusVisual = getInvoiceStatusVisual(effectiveStatus);
                                const StatusIcon = statusVisual.icon;
                                const paidAgeLabel = invoice.status === 'paid'
                                    ? getPaidAgeLabel(invoice.paid_at)
                                    : null;
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
                                                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${statusVisual.iconBackgroundClass}`}>
                                                        <StatusIcon className={`h-4 w-4 ${statusVisual.iconClass}`} aria-hidden="true" />
                                                    </div>
                                                    {/* Invoice Number */}
                                                    <p className="font-medium text-sm md:text-base">{invoice.invoice_number}</p>
                                                </div>
                                                
                                                {/* Right Side: Amount + Chevron + Menu */}
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <div className="hidden lg:block">
                                                        <Badge className={`pointer-events-none cursor-default text-xs ${statusVisual.badgeClass}`}>
                                                            {statusVisual.label}
                                                        </Badge>
                                                    </div>
                                                    <div className="hidden flex-col items-end text-right sm:flex">
                                                        <p className="font-semibold text-sm md:text-base">{formatCurrency(invoice.total)}</p>
                                                        {invoice.amount_paid > 0 && (
                                                            <p className="text-xs font-medium text-green-600 dark:text-green-400">
                                                                -{formatCurrency(invoice.amount_paid)}
                                                            </p>
                                                        )}
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
                                                                <Pencil className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Edit
                                                            </DropdownMenuItem>
                                                            {invoice.status === 'draft' && (
                                                                <DropdownMenuItem onClick={() => handleOpenSendModal(invoice, false)} className="group/menu">
                                                                    <Send className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Send
                                                                </DropdownMenuItem>
                                                            )}
                                                            {['sent', 'viewed', 'partial', 'overdue'].includes(invoice.status) && (
                                                                <DropdownMenuItem onClick={() => handleOpenSendModal(invoice, true)} className="group/menu">
                                                                    <RefreshCw className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Resend
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem
                                                                onClick={(e) => handleDownloadPdf(invoice, e)}
                                                                disabled={downloadingInvoiceId !== null}
                                                                className="group/menu"
                                                            >
                                                                {downloadingInvoiceId === invoice.id
                                                                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                                    : <Download className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />}
                                                                Download PDF
                                                            </DropdownMenuItem>
                                                            {invoice.amount_due > 0 && !['cancelled', 'refunded', 'paid'].includes(invoice.status) && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onClick={(e) => handleOpenPaymentModal(invoice, e)} className="group/menu">
                                                                        <Wallet className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Record Payment
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={(e) => handleCreatePaymentLink(invoice, e)} className="group/menu">
                                                                        <CreditCard className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Create Payment Link
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                            {!['cancelled', 'refunded'].includes(invoice.status)
                                                                && !invoice.is_recurring_source
                                                                && !invoice.recurring_template_id && (
                                                                <DropdownMenuItem onClick={(e) => handleOpenRecurringModal(invoice, e)} className="group/menu">
                                                                    <Repeat className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Make Recurring
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={(e) => handleDeleteClick(invoice, e)}
                                                                className="text-destructive focus:text-destructive"
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
                                                <span className="lg:hidden">
                                                    <Badge className={`pointer-events-none cursor-default text-xs ${statusVisual.badgeClass}`}>
                                                        {statusVisual.label}
                                                    </Badge>
                                                </span>
                                                
                                                {/* Due Date */}
                                                <span className="text-xs text-muted-foreground">
                                                    Due {new Date(invoice.due_date).toLocaleDateString()}
                                                </span>
                                                
                                                {/* Recurring relationship links */}
                                                {invoice.is_recurring_source && (
                                                    <Button
                                                        type="button"
                                                        variant="link"
                                                        className="h-auto gap-1 p-0 text-xs font-normal"
                                                        aria-label="Open recurring schedule created from this invoice"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            navigate(`/invoices/recurring?schedule=${invoice.recurring_source_template_id || ''}`);
                                                        }}
                                                    >
                                                        <Repeat className="h-3 w-3" aria-hidden="true" />
                                                        Recurring schedule
                                                    </Button>
                                                )}
                                                {invoice.recurring_template_id && (
                                                    <Button
                                                        type="button"
                                                        variant="link"
                                                        className="h-auto gap-1 p-0 text-xs font-normal"
                                                        aria-label="Open schedule that generated this invoice"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            navigate(`/invoices/recurring?schedule=${invoice.recurring_template_id}`);
                                                        }}
                                                    >
                                                        <Repeat className="h-3 w-3" aria-hidden="true" />
                                                        From recurring schedule
                                                    </Button>
                                                )}
                                            </div>
                                            
                                            {/* Footer Row: Amount (on mobile) + Overdue status + Amount due */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                <span className="md:hidden font-semibold">{formatCurrency(invoice.total)}</span>
                                                {isOverdue(invoice) && (
                                                    <span className="font-medium text-red-600 dark:text-red-400">
                                                        {getWholeDaysSince(invoice.due_date)}d overdue
                                                    </span>
                                                )}
                                                {paidAgeLabel && (
                                                    <span className="font-medium text-green-600 dark:text-green-400">
                                                        {paidAgeLabel}
                                                    </span>
                                                )}
                                                {invoice.amount_due > 0 &&
                                                  !['draft', 'paid', 'cancelled', 'refunded'].includes(invoice.status) && (
                                                    <span className="text-muted-foreground">
                                                        Balance: {formatCurrency(invoice.amount_due)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded Preview */}
                                        {isExpanded && (
                                            <div className="bg-muted/30 border-t px-6 py-6">
                                                <ExpandedRowActions>
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
                                                        <ExpandedRowActionLabel full="Edit invoice" compact="Edit" />
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
                                                            <Send className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                                                            <ExpandedRowActionLabel full="Send Invoice" compact="Send" />
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
                                                            <RefreshCw className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                                                            <ExpandedRowActionLabel full="Resend Invoice" compact="Resend" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        onClick={(e) => handleDownloadPdf(invoice, e)}
                                                        disabled={downloadingInvoiceId !== null}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                                    >
                                                        {downloadingInvoiceId === invoice.id
                                                            ? <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 animate-spin" />
                                                            : <Download className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />}
                                                        <ExpandedRowActionLabel full="Download PDF" compact="Download" />
                                                    </Button>
                                                    {invoice.amount_due > 0 && !['cancelled', 'refunded', 'paid'].includes(invoice.status) && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                onClick={(e) => handleOpenPaymentModal(invoice, e)}
                                                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                                            >
                                                                <Wallet className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                                                                <ExpandedRowActionLabel full="Record Payment" compact="Record" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                onClick={(e) => handleCreatePaymentLink(invoice, e)}
                                                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                                            >
                                                                <CreditCard className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                                                                <ExpandedRowActionLabel full="Payment Link" compact="Link" />
                                                            </Button>
                                                        </>
                                                    )}
                                                    {!['cancelled', 'refunded'].includes(invoice.status)
                                                        && !invoice.is_recurring_source
                                                        && !invoice.recurring_template_id && (
                                                        <Button
                                                            size="sm"
                                                            onClick={(e) => handleOpenRecurringModal(invoice, e)}
                                                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                                        >
                                                            <Repeat className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                                                            <ExpandedRowActionLabel full="Make Recurring" compact="Recur" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus:text-destructive text-xs sm:text-sm"
                                                        onClick={(e) => handleDeleteClick(invoice, e)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                                        <ExpandedRowActionLabel full="Delete invoice" compact="Delete" />
                                                    </Button>
                                                </ExpandedRowActions>
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
                                                            items={(expandedInvoiceData.items || []).map((item) => ({
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
                                                            termsAndConditions={expandedInvoiceData.terms_and_conditions}
                                                        />

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

            <DeleteDialog
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                    setDeleteDialogOpen(open);
                    if (!open) setInvoiceToDelete(null);
                }}
                onConfirm={confirmDelete}
                itemType="invoice"
                itemTitle={invoiceToDelete?.invoice_number}
                description={invoiceToDelete?.status !== 'draft'
                    ? 'This invoice has been sent to the customer. Deleting it removes the invoice record and cannot be undone.'
                    : undefined}
                successDescription={invoiceToDelete
                    ? `Invoice ${invoiceToDelete.invoice_number} has been permanently deleted.`
                    : undefined}
            />

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
                    open={showPaymentLinkModal}
                    onOpenChange={(open) => {
                        if (!open) {
                            setShowPaymentLinkModal(false);
                            setSelectedInvoiceForPaymentLink(null);
                        }
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
        </PageLayout>
    );
}

export default InvoicesPage;
