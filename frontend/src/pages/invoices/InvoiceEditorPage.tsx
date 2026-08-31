import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
    Save,
    Send,
    FileSignature,
    Plus,
    Trash2,
    Building,
    Eye,
    ChevronDown,
    ChevronUp,
    Receipt,
    Building2,
    CalendarDays,
    FileText,
    MoreHorizontal,
    WalletCards,
    Repeat,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { SectionCardTitle } from '@/components/ui/section-card-title';
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
import { toastMessages } from '@/constants/toastMessages';
import { PageLayout } from '@/components/layout/PageLayout';
import { EntityDetailHeader } from '@/components/layout/EntityDetailHeader';
import { cn } from '@/lib/utils';
import {
    HeaderAction,
    HeaderActionLabel,
} from '@/components/layout/DesktopHeaderTools';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { getAssetUrl } from '@/lib/api';
import { useOrganization } from '@/hooks/useOrganization';
import { useDirtyState } from '@/hooks/useDirtyState';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { JsonRecord } from '@/types';
import {
    Product,
    PaymentSettings,
    Business,
    Invoice,
    createRecurringTemplateFromInvoice,
} from '@/services/invoicesApi';
import { getInvoiceEditorBootstrapViaGraphql } from '@/services/salesDocumentEditorGraphql';
import {
    getRecurringInvoice,
    pauseRecurringInvoice,
    RecurringInvoice,
    resumeRecurringInvoice,
} from '@/services/recurringInvoicesApi';
import { InvoicePreview } from './components/InvoicePreview';
import { SendInvoiceModal, SendOptions } from './components/SendInvoiceModal';
import { CustomerInfoSection } from './components/CustomerInfoSection';
import { LineItemsTable } from './components/LineItemsTable';
import { useLineItems } from './hooks/useLineItems';
import { useInvoiceCalculations } from './hooks/useInvoiceCalculations';
import { useContactSelection } from './hooks/useContactSelection';
import { useInvoiceForm } from './hooks/useInvoiceForm';
import { useInvoiceSave } from './hooks/useInvoiceSave';
import { formatCurrency, getPaymentTermsLabel } from './utils/invoiceFormatters';
import { getInvoiceStatusVisual } from './constants/invoiceConstants';
import { getRecurringStatusVisual } from './constants/recurringConstants';
import { MakeRecurringModal, RecurringOptions } from './components/MakeRecurringModal';

interface Contact {
    id: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string | {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
    } | JsonRecord;
}

export function InvoiceEditorPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { toast } = useToast();
    const isNew = id === 'new' || !id;

    const [initialized, setInitialized] = useState(false);
    const { organizationId, organization, error: organizationError } = useOrganization();
    const defaultBusinessId = typeof organization?.settings.defaultBusinessId === 'number'
        ? organization.settings.defaultBusinessId
        : undefined;
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [settings, setSettings] = useState<PaymentSettings | null>(null);
    const [loadedInvoice, setLoadedInvoice] = useState<Invoice | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showSendModal, setShowSendModal] = useState(false);
    const [businessSectionOpen, setBusinessSectionOpen] = useState(true);
    const [footerOpen, setFooterOpen] = useState(false);
    const [showRecurringModal, setShowRecurringModal] = useState(false);
    const [recurringSchedule, setRecurringSchedule] = useState<RecurringInvoice | null>(null);
    const [recurringScheduleLoading, setRecurringScheduleLoading] = useState(false);
    const [recurringScheduleSaving, setRecurringScheduleSaving] = useState(false);
    const [pauseScheduleOpen, setPauseScheduleOpen] = useState(false);
    const initializedBootstrapRef = useRef<string | null>(null);
    const invoiceId = !isNew && id
        && Number.isSafeInteger(Number(id)) && Number(id) > 0
        ? Number(id)
        : null;
    const hasInvalidInvoiceId = !isNew && invoiceId === null;
    const bootstrapKey = `${organizationId ?? 'none'}:${invoiceId ?? 'new'}`;
    const bootstrapQuery = useQuery({
        queryKey: ['invoice-editor-bootstrap', organizationId, invoiceId],
        queryFn: ({ signal }) => getInvoiceEditorBootstrapViaGraphql(
            organizationId as number,
            invoiceId,
            signal,
        ),
        enabled: Boolean(organizationId) && !hasInvalidInvoiceId,
        refetchOnWindowFocus: false,
    });
    const loadError = bootstrapQuery.isError || hasInvalidInvoiceId;
    const loading = !loadError && (bootstrapQuery.isPending || !initialized);

    // Use extracted hooks
    const {
        lineItems,
        setLineItems,
        addLineItem,
        removeLineItem,
        updateLineItem,
    } = useLineItems();

    const {
        contactId,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        setContactId,
        setCustomerName,
        setCustomerEmail,
        setCustomerPhone,
        setCustomerAddress,
        handleContactChange,
        loadContactData,
    } = useContactSelection();

    const {
        invoiceNumber,
        invoiceSummary,
        issueDate,
        dueDate,
        paymentTerms,
        currency,
        notes,
        termsAndConditions,
        discountType,
        discountValue,
        taxRate,
        selectedBusinessId,
        setInvoiceNumber,
        setInvoiceSummary,
        setIssueDate,
        setDueDate,
        setPaymentTerms,
        setCurrency,
        setNotes,
        setTermsAndConditions,
        setDiscountType,
        setDiscountValue,
        setTaxRate,
        setSelectedBusinessId,
        handlePaymentTermsChange,
        loadInvoiceData,
    } = useInvoiceForm({
        isNew,
        defaultPaymentTerms: settings?.default_payment_terms,
        defaultCurrency: settings?.default_currency,
        defaultNotes: settings?.default_notes,
        defaultTerms: settings?.default_terms,
    });

    const { subtotal, taxAmount, discountAmount, total } = useInvoiceCalculations({
        lineItems,
        taxRate,
        discountType,
        discountValue,
    });

    const { saving, handleSave: handleSaveInvoice, handleSendInvoice } = useInvoiceSave({
        organizationId,
        isNew,
        invoiceId: id,
    });

    const invoiceDraft = useMemo(() => ({
        contactId,
        selectedBusinessId,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        invoiceSummary,
        issueDate,
        dueDate,
        paymentTerms,
        currency,
        taxRate,
        discountType,
        discountValue,
        notes,
        termsAndConditions,
        lineItems: lineItems.map(({ id: _id, ...item }) => item),
    }), [
        contactId,
        currency,
        customerAddress,
        customerEmail,
        customerName,
        customerPhone,
        discountType,
        discountValue,
        dueDate,
        invoiceSummary,
        issueDate,
        lineItems,
        notes,
        paymentTerms,
        selectedBusinessId,
        taxRate,
        termsAndConditions,
    ]);
    const { isDirty } = useDirtyState({
        value: invoiceDraft,
        ready: initialized,
        resetKey: id ?? 'new',
    });
    const { confirmLeave } = useUnsavedChangesGuard({
        when: isDirty || saving,
        message: 'This invoice has unsaved changes. Leave without saving them?',
    });

    // Refs for auto-resizing textareas
    const notesRef = useRef<HTMLTextAreaElement>(null);
    const footerRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textareas when content loads
    useEffect(() => {
        if (!loading) {
            [notesRef, footerRef].forEach(ref => {
                if (ref.current) {
                    ref.current.style.height = 'auto';
                    ref.current.style.height = `${ref.current.scrollHeight}px`;
                }
            });
        }
    }, [loading, notes, termsAndConditions]);

    // Product selection handler
    const handleProductSelect = (lineItemId: string, productIdStr: string) => {
        if (productIdStr === 'custom') {
            updateLineItem(lineItemId, { product_id: undefined });
            return;
        }
        const product = products.find(p => p.id === parseInt(productIdStr));
        if (product) {
            updateLineItem(lineItemId, {
                product_id: product.id,
                name: product.name,
                description: product.description || '',
                unit_price: product.price,
                tax_rate: product.tax_rate || 0,
            });
        }
    };

    // Wrapper for handleSave to pass invoice data
    const handleSave = () => {
        handleSaveInvoice({
            contact_id: contactId,
            business_id: selectedBusinessId,
            customer_name: customerName || undefined,
            customer_email: customerEmail || undefined,
            customer_phone: customerPhone || undefined,
            customer_address: customerAddress || undefined,
            issue_date: issueDate,
            due_date: dueDate,
            payment_terms: paymentTerms,
            currency: currency,
            tax_rate: taxRate,
            items: [], // Will be populated in hook
            discount_type: discountType,
            discount_value: discountValue,
            notes: notes || undefined,
            terms_and_conditions: termsAndConditions || undefined,
        }, lineItems);
    };

    const scheduleId = loadedInvoice?.recurring_source_template_id
        || loadedInvoice?.recurring_template_id;
    const recurringStatusVisual = recurringSchedule
        ? getRecurringStatusVisual(recurringSchedule.status)
        : null;

    useEffect(() => {
        if (!organizationId || !scheduleId) {
            setRecurringSchedule(null);
            return;
        }

        let active = true;
        setRecurringScheduleLoading(true);
        getRecurringInvoice(scheduleId, organizationId)
            .then((schedule) => {
                if (active) setRecurringSchedule(schedule);
            })
            .catch(() => {
                if (active) setRecurringSchedule(null);
            })
            .finally(() => {
                if (active) setRecurringScheduleLoading(false);
            });

        return () => {
            active = false;
        };
    }, [organizationId, scheduleId]);

    const handleCreateRecurringSchedule = async (options: RecurringOptions) => {
        if (!organizationId || !loadedInvoice) return;

        setRecurringScheduleSaving(true);
        try {
            const result = await createRecurringTemplateFromInvoice(
                loadedInvoice.id,
                {
                    template_name: options.template_name,
                    frequency: options.frequency,
                    start_date: options.start_date,
                    end_date: options.end_date,
                },
                organizationId,
            );
            const schedule = await getRecurringInvoice(result.recurring_template_id, organizationId);
            setRecurringSchedule(schedule);
            setLoadedInvoice((current) => current ? {
                ...current,
                is_recurring_source: true,
                recurring_source_template_id: result.recurring_template_id,
            } : current);
            setShowRecurringModal(false);
            toast({
                title: 'Recurring schedule created',
                description: 'The original invoice is unchanged. Future invoices will follow this schedule.',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to create the recurring schedule',
                variant: 'destructive',
            });
        } finally {
            setRecurringScheduleSaving(false);
        }
    };

    const handleResumeSchedule = async () => {
        if (!organizationId || !recurringSchedule) return;
        setRecurringScheduleSaving(true);
        try {
            await resumeRecurringInvoice(recurringSchedule.id, organizationId);
            setRecurringSchedule(await getRecurringInvoice(recurringSchedule.id, organizationId));
            toast({ title: 'Schedule resumed', description: 'Future invoices will generate on schedule.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to resume the schedule', variant: 'destructive' });
        } finally {
            setRecurringScheduleSaving(false);
        }
    };

    const handlePauseSchedule = async () => {
        if (!organizationId || !recurringSchedule) return;
        setRecurringScheduleSaving(true);
        try {
            await pauseRecurringInvoice(recurringSchedule.id, organizationId);
            setRecurringSchedule(await getRecurringInvoice(recurringSchedule.id, organizationId));
            setPauseScheduleOpen(false);
            toast({
                title: 'Schedule paused',
                description: 'Existing invoices are unchanged. No future invoices will generate until resumed.',
            });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to pause the schedule', variant: 'destructive' });
        } finally {
            setRecurringScheduleSaving(false);
        }
    };

    // Initialize once per route so a background refetch cannot overwrite edits.
    useEffect(() => {
        if (!bootstrapQuery.data
            || initializedBootstrapRef.current === bootstrapKey) return;
        const data = bootstrapQuery.data;
        setInitialized(false);
        setContacts(data.contacts);
        setProducts(data.products);
        setBusinesses(data.businesses);
        setSettings(data.settings);

        if (data.invoice) {
            const invoice = data.invoice;
            setLoadedInvoice(invoice);
            loadInvoiceData(invoice);
            loadContactData({
                id: invoice.contact_id,
                name: invoice.customer_name,
                email: invoice.customer_email,
                phone: invoice.customer_phone,
                address: invoice.customer_address,
            });
            if (invoice.items && invoice.items.length > 0) {
                setLineItems(invoice.items.map(item => ({
                    id: crypto.randomUUID(),
                    product_id: item.product_id,
                    name: item.name,
                    description: item.description || '',
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    tax_rate: item.tax_rate || 0,
                })));
            }
        } else {
            setLoadedInvoice(null);
            const contactIdParam = searchParams.get('contactId');
            const contactNameParam = searchParams.get('contactName');
            const contactEmailParam = searchParams.get('contactEmail');
            if (contactIdParam || contactNameParam || contactEmailParam) {
                const numId = contactIdParam ? parseInt(contactIdParam, 10) : undefined;
                if (numId) setContactId(numId);
                loadContactData({
                    id: numId,
                    name: contactNameParam || undefined,
                    email: contactEmailParam || undefined,
                });
            }
            const preferred = data.businesses.find(b => b.id === defaultBusinessId)
                || data.businesses.find(b => b.last_used_at)
                || data.businesses[0];
            if (preferred) setSelectedBusinessId(preferred.id);
        }
        initializedBootstrapRef.current = bootstrapKey;
        setInitialized(true);
    }, [
        bootstrapKey,
        bootstrapQuery.data,
        defaultBusinessId,
        loadInvoiceData,
        loadContactData,
        setLineItems,
        setSelectedBusinessId,
        setContactId,
        searchParams,
    ]);

    useEffect(() => {
        if (initializedBootstrapRef.current !== bootstrapKey) setInitialized(false);
    }, [bootstrapKey]);

    useEffect(() => {
        if (!bootstrapQuery.isError) return;
        toast({
            title: 'Error',
            description: toastMessages.failedToLoad('invoice data'),
            variant: 'destructive',
        });
    }, [bootstrapQuery.errorUpdatedAt, bootstrapQuery.isError, toast]);



    if (organizationError) {
        return (
            <PageLayout title="INVOICE" icon={<Receipt className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}>
                <OrganizationErrorState title="Unable to load invoice" icon={Receipt} />
            </PageLayout>
        );
    }

    if (loading) {
        return (
            <PageLayout
                title={(isNew ? 'New Invoice' : 'Invoice').toUpperCase()}
                icon={<Receipt className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
                leading={
                    <ShellBackButton label="Back to invoices" onClick={() => {
                        if (confirmLeave()) navigate('/invoices');
                    }} />
                }
            >
                <div className="space-y-6">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-64" />
                    <Skeleton className="h-32" />
                </div>
            </PageLayout>
        );
    }

    if (loadError) {
        return (
            <PageLayout
                title="INVOICE"
                icon={<Receipt className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
                leading={
                    <ShellBackButton label="Back to invoices" onClick={() => navigate('/invoices')} />
                }
            >
                <ErrorState
                    kind="page"
                    title={hasInvalidInvoiceId ? 'Invalid invoice' : 'Invoice unavailable'}
                    description={hasInvalidInvoiceId
                        ? 'This invoice address is not valid.'
                        : 'We could not load this invoice. Your data has not been changed.'}
                    onAction={hasInvalidInvoiceId ? undefined : () => bootstrapQuery.refetch()}
                />
            </PageLayout>
        );
    }

    const canSave = !saving
        && isDirty
        && lineItems.some((item) => item.name.trim().length > 0);
    const amountPaid = Number(loadedInvoice?.amount_paid || 0);
    const amountDue = Math.max(0, total - amountPaid);
    const persistedStatus = loadedInvoice?.status || 'draft';
    const invoiceStatus = !isNew
        && amountDue > 0
        && dueDate
        && ['sent', 'viewed', 'partial'].includes(persistedStatus)
        && new Date(`${dueDate}T23:59:59`).getTime() < Date.now()
        ? 'overdue'
        : persistedStatus;
    const invoiceStatusVisual = getInvoiceStatusVisual(invoiceStatus);
    const InvoiceStatusIcon = invoiceStatusVisual.icon;
    const primaryActionLabel = saving
        ? 'Saving...'
        : isNew
            ? 'Create invoice'
            : 'Save changes';

    const invoiceActions = (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            className="h-11 min-w-11 gap-2 px-3 font-light"
                            aria-label="Invoice actions"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                            <HeaderActionLabel>More</HeaderActionLabel>
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Invoice actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowPreview(true)} className="group/menu">
                    <Eye className="mr-2 h-4 w-4" />
                    Preview Invoice
                </DropdownMenuItem>
                {!isNew && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => setShowSendModal(true)}
                            disabled={saving || isDirty}
                            className="group/menu"
                        >
                            <Send className="mr-2 h-4 w-4" />
                            Send Invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => navigate(`/documents/new?invoiceId=${id}`)}
                            disabled={saving || isDirty}
                            className="group/menu"
                        >
                            <FileSignature className="mr-2 h-4 w-4" />
                            Send for Signature
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <PageLayout
            title={(isNew ? 'New Invoice' : 'Invoice').toUpperCase()}
            icon={<Receipt className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
            leading={
                <ShellBackButton label="Back to invoices" onClick={() => {
                    if (confirmLeave()) navigate('/invoices');
                }} />
            }
            headerTools={{
                status: <Badge className={cn('pointer-events-none whitespace-nowrap', invoiceStatusVisual.badgeClass)}>{invoiceStatusVisual.label}</Badge>,
                secondaryAction: invoiceActions,
                primaryAction: (
                    <HeaderAction
                        label={primaryActionLabel}
                        onClick={handleSave}
                        icon={<Save className="h-4 w-4" />}
                        disabled={!canSave}
                        busy={saving}
                    />
                ),
            }}
        >
            <div className="space-y-6">
                <EntityDetailHeader
                    className="mb-0"
                    icon={<InvoiceStatusIcon className={cn('h-6 w-6', invoiceStatusVisual.iconClass)} aria-hidden="true" />}
                    iconClassName={invoiceStatusVisual.iconBackgroundClass}
                    title={invoiceNumber || 'New invoice'}
                    mobileStatus={<Badge className={invoiceStatusVisual.badgeClass}>{invoiceStatusVisual.label}</Badge>}
                    descriptor={(
                        <span className="inline-flex items-baseline gap-2">
                            Amount due
                            <span className="text-lg font-semibold text-foreground">{formatCurrency(amountDue, currency)}</span>
                        </span>
                    )}
                    metadata={(
                        <>
                            <span>{customerName || 'No customer selected'}</span>
                            {issueDate && <span>Issued {new Date(`${issueDate}T00:00:00`).toLocaleDateString()}</span>}
                        </>
                    )}
                />
                {/* Business identity */}
                <Collapsible open={businessSectionOpen} onOpenChange={setBusinessSectionOpen}>
                    <Card>
                        <CollapsibleTrigger asChild>
                            <CardHeader className="cursor-pointer rounded-t-lg interaction-row">
                                <CardTitle className="flex items-center justify-between gap-3 text-base">
                                    <span className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                        Business Details
                                    </span>
                                    {businessSectionOpen ? (
                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </CardTitle>
                            </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <CardContent surface="inset">
                                <div className="flex flex-col gap-6 sm:flex-row">
                                    {/* Left: Logo */}
                                    <div className="flex-shrink-0">
                                        {(() => {
                                            const selectedBusiness = businesses.find(b => b.id === selectedBusinessId);
                                            return selectedBusiness?.logo_url ? (
                                                <div className="space-y-2">
                                                    <img
                                                        src={getAssetUrl(selectedBusiness.logo_url)}
                                                        alt="Business Logo"
                                                        className="h-24 w-auto object-contain rounded border bg-white p-2"
                                                    />
                                                    <Link
                                                        to="/payment-settings"
                                                        className="block text-xs text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                                    >
                                                        Edit logo
                                                    </Link>
                                                </div>
                                            ) : (
                                                <Link
                                                    to="/payment-settings"
                                                    className="flex h-24 w-24 flex-col items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-blue-600 hover:bg-blue-50 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
                                                >
                                                    <Building className="h-8 w-8 mb-1" />
                                                    <span className="text-xs text-center">Add logo</span>
                                                </Link>
                                            );
                                        })()}
                                    </div>

                                    {/* Right: Invoice Title + Summary + Business Selector */}
                                    <div className="min-w-0 flex-1 space-y-4">
                                        {/* Invoice Title and Summary */}
                                        <div className="flex gap-4 items-start">
                                            <div className="flex-1 space-y-2">
                                                <Input
                                                    value="Invoice"
                                                    readOnly
                                                    aria-label="Document type"
                                                    className="h-auto border-none bg-transparent py-0 text-left text-xl font-medium shadow-none focus-visible:ring-0 sm:text-right"
                                                />
                                                <Input
                                                    value={invoiceSummary}
                                                    onChange={(e) => setInvoiceSummary(e.target.value)}
                                                    placeholder="Summary (e.g. project name, description of invoice)"
                                                    aria-label="Invoice summary"
                                                    className="text-sm sm:text-right"
                                                />
                                            </div>
                                        </div>

                                        {/* Business Selector */}
                                        <div className="space-y-2 text-left text-sm sm:text-right">
                                            {businesses.length > 0 ? (
                                                <>
                                                    <Select
                                                        value={selectedBusinessId?.toString() || ''}
                                                        onValueChange={(v) => setSelectedBusinessId(v ? parseInt(v) : undefined)}
                                                    >
                                                        <SelectTrigger className="w-full sm:ml-auto sm:max-w-xs">
                                                            <SelectValue placeholder="Select a business" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {businesses.map(business => (
                                                                <SelectItem key={business.id} value={business.id.toString()}>
                                                                    {business.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    
                                                    {/* Display selected business info */}
                                                    {(() => {
                                                        const selectedBusiness = businesses.find(b => b.id === selectedBusinessId);
                                                        if (selectedBusiness) {
                                                            return (
                                                                <div className="space-y-0.5 mt-2">
                                                                    <p className="font-semibold">{selectedBusiness.name}</p>
                                                                    {selectedBusiness.address && (
                                                                        <p className="text-muted-foreground whitespace-pre-line">
                                                                            {selectedBusiness.address}
                                                                        </p>
                                                                    )}
                                                                    {selectedBusiness.phone && (
                                                                        <p className="text-muted-foreground">{selectedBusiness.phone}</p>
                                                                    )}
                                                                    {selectedBusiness.email && (
                                                                        <p className="text-muted-foreground">{selectedBusiness.email}</p>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                        return (
                                                            <p className="text-muted-foreground italic mt-2">
                                                                Select a business to invoice from
                                                            </p>
                                                        );
                                                    })()}
                                                </>
                                            ) : (
                                                <p className="text-muted-foreground italic">
                                                    No business profiles set up yet
                                                </p>
                                            )}
                                            <Link
                                                to="/payment-settings"
                                                className="mt-2 inline-block text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                            >
                                                {businesses.length > 0 ? 'Manage businesses' : 'Add a business profile'}
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>

                {/* Customer + Invoice Details - Side by Side */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Left: Customer (Bill To) */}
                    <CustomerInfoSection
                        contacts={contacts}
                        contactId={contactId}
                        customerName={customerName}
                        customerEmail={customerEmail}
                        customerPhone={customerPhone}
                        customerAddress={customerAddress}
                        onContactChange={(contactIdStr) => handleContactChange(contactIdStr, contacts)}
                        onCustomerNameChange={setCustomerName}
                        onCustomerEmailChange={setCustomerEmail}
                        onCustomerPhoneChange={setCustomerPhone}
                        onCustomerAddressChange={setCustomerAddress}
                    />

                    {/* Right: Invoice Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                Invoice Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent surface="inset" className="space-y-4">
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                                <Label className="text-muted-foreground">Invoice number</Label>
                                <Input
                                    value={invoiceNumber || (isNew ? 'Auto-generated' : '')}
                                    readOnly
                                    className="h-9 bg-muted/50 sm:text-right"
                                />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                                <Label className="text-muted-foreground">Invoice date</Label>
                                <Input
                                    type="date"
                                    value={issueDate}
                                    onChange={(e) => setIssueDate(e.target.value)}
                                    className="h-9"
                                />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start">
                                <Label className="pt-2 text-muted-foreground">Due date</Label>
                                <div className="sm:text-right">
                                    <Input
                                        type="date"
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                        className="h-9"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {getPaymentTermsLabel(paymentTerms)}
                                    </p>
                                </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                                <Label className="text-muted-foreground">Payment terms</Label>
                                <Select
                                    value={String(paymentTerms)}
                                    onValueChange={(v) => handlePaymentTermsChange(parseInt(v))}
                                >
                                    <SelectTrigger className="h-9 w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">Due on receipt</SelectItem>
                                        <SelectItem value="7">7 days</SelectItem>
                                        <SelectItem value="14">14 days</SelectItem>
                                        <SelectItem value="15">15 days</SelectItem>
                                        <SelectItem value="30">30 days</SelectItem>
                                        <SelectItem value="45">45 days</SelectItem>
                                        <SelectItem value="60">60 days</SelectItem>
                                        <SelectItem value="90">90 days</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <SectionCardTitle icon={Repeat} className="flex-wrap">
                                <span>Recurring schedule</span>
                                {recurringStatusVisual && (
                                    <Badge className={`pointer-events-none cursor-default text-xs ${recurringStatusVisual.badgeClass}`}>
                                        {recurringStatusVisual.label}
                                    </Badge>
                                )}
                            </SectionCardTitle>
                            <p className="ml-6 mt-1 text-sm text-muted-foreground">
                                    {isNew
                                        ? 'Save this invoice before creating a repeating schedule.'
                                        : loadedInvoice?.recurring_template_id
                                            ? 'This invoice was generated by a recurring schedule. Changes here affect only this invoice.'
                                            : recurringSchedule?.status === 'active'
                                                ? `Repeats ${recurringSchedule.frequency}. Next invoice ${recurringSchedule.next_run_date
                                                    ? new Date(`${recurringSchedule.next_run_date}T00:00:00`).toLocaleDateString()
                                                    : 'is not scheduled'}.`
                                                : recurringSchedule?.status === 'paused'
                                                    ? 'Paused. Existing invoices remain unchanged.'
                                                    : recurringSchedule?.status === 'completed'
                                                        ? 'This schedule has completed and will not generate more invoices.'
                                                        : 'Turn this on to reuse the invoice details on a schedule.'}
                            </p>
                        </div>

                        <div className="flex shrink-0 items-center justify-end gap-3">
                            {scheduleId && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/invoices/recurring?schedule=${scheduleId}`)}
                                >
                                    View schedule
                                </Button>
                            )}
                            {!loadedInvoice?.recurring_template_id && (
                                <Switch
                                    checked={recurringSchedule?.status === 'active'}
                                    disabled={
                                        isNew
                                        || isDirty
                                        || recurringScheduleLoading
                                        || recurringScheduleSaving
                                        || recurringSchedule?.status === 'completed'
                                    }
                                    aria-label="Repeat this invoice"
                                    onCheckedChange={(checked) => {
                                        if (!recurringSchedule && checked) {
                                            setShowRecurringModal(true);
                                        } else if (recurringSchedule?.status === 'paused' && checked) {
                                            void handleResumeSchedule();
                                        } else if (recurringSchedule?.status === 'active' && !checked) {
                                            setPauseScheduleOpen(true);
                                        }
                                    }}
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Line Items - Table Style */}
                <LineItemsTable
                    lineItems={lineItems}
                    products={products}
                    currency={currency}
                    onAddLineItem={addLineItem}
                    onRemoveLineItem={removeLineItem}
                    onUpdateLineItem={updateLineItem}
                    onProductSelect={handleProductSelect}
                />

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                Notes &amp; Terms
                            </CardTitle>
                        </CardHeader>
                        <CardContent surface="inset">
                            <Textarea
                                ref={notesRef}
                                value={notes}
                                onChange={(e) => {
                                    setNotes(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = `${e.target.scrollHeight}px`;
                                }}
                                placeholder="Enter notes or terms visible to your customer"
                                rows={5}
                                className="min-h-[9rem] resize-none overflow-hidden"
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <WalletCards className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                Totals
                            </CardTitle>
                        </CardHeader>
                        <CardContent surface="inset" className="space-y-3">
                        <div className="flex justify-between text-sm">
                            <span>Subtotal</span>
                            <span>{formatCurrency(subtotal, currency)}</span>
                        </div>

                        {/* Add Tax */}
                        {taxRate > 0 ? (
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <span>Tax</span>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        className="w-20 h-7 text-sm text-center"
                                        value={taxRate || ''}
                                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                                    />
                                    <span className="text-xs text-muted-foreground">%</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => setTaxRate(0)}
                                    >
                                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                    </Button>
                                </div>
                                <span>{formatCurrency(taxAmount, currency)}</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between text-sm">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 border-blue-200/60 px-2 text-blue-600 hover:bg-blue-50 dark:border-blue-800/60 dark:text-blue-400 dark:hover:bg-blue-950/40"
                                    onClick={() => {
                                        const rawRate = settings?.default_tax_rate;
                                        const parsedRate = typeof rawRate === 'string' 
                                            ? parseFloat(rawRate) 
                                            : (rawRate ?? 0);
                                        // Use default of 10 if rate is 0 or invalid
                                        const rate = parsedRate > 0 ? parsedRate : 10;
                                        setTaxRate(rate);
                                    }}
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add tax
                                </Button>
                                <span className="text-muted-foreground">-</span>
                            </div>
                        )}
                        
                        {/* Add Discount */}
                        {discountValue > 0 ? (
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <span>Discount</span>
                                    <Select
                                        value={discountType}
                                        onValueChange={(v) => setDiscountType(v as 'fixed' | 'percent')}
                                    >
                                        <SelectTrigger className="w-16 h-7 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="fixed">$</SelectItem>
                                            <SelectItem value="percent">%</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        type="number"
                                        min="0"
                                        className="w-16 h-7 text-sm"
                                        value={discountValue || ''}
                                        onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => setDiscountValue(0)}
                                    >
                                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                    </Button>
                                </div>
                                <span>-{formatCurrency(discountAmount, currency)}</span>
                            </div>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 border-blue-200/60 px-2 text-blue-600 hover:bg-blue-50 dark:border-blue-800/60 dark:text-blue-400 dark:hover:bg-blue-950/40"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDiscountValue(0.01);
                                }}
                            >
                                <Plus className="h-3 w-3 mr-1" />
                                Add a discount
                            </Button>
                        )}

                        <Separator />

                        {/* Total with Currency */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">Total</span>
                                <Select value={currency} onValueChange={setCurrency}>
                                    <SelectTrigger className="w-36 h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="USD">USD ($) - U.S. dollar</SelectItem>
                                        <SelectItem value="EUR">EUR (€) - Euro</SelectItem>
                                        <SelectItem value="GBP">GBP (£) - British pound</SelectItem>
                                        <SelectItem value="CAD">CAD ($) - Canadian dollar</SelectItem>
                                        <SelectItem value="AUD">AUD ($) - Australian dollar</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <span className="text-lg font-bold">{formatCurrency(total, currency)}</span>
                        </div>

                        {amountPaid > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                                <span>Paid</span>
                                <span>-{formatCurrency(amountPaid, currency)}</span>
                            </div>
                        )}

                        <div className="flex justify-between pt-2 border-t">
                            <span className="font-semibold">Amount Due</span>
                            <span className="text-lg font-bold">{formatCurrency(amountDue, currency)}</span>
                        </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Footer - Collapsible */}
                <Collapsible open={footerOpen} onOpenChange={setFooterOpen}>
                    <Card>
                        <CollapsibleTrigger asChild>
                            <CardHeader className="cursor-pointer rounded-t-lg interaction-row">
                                <CardTitle className="flex items-center justify-between gap-3 text-base">
                                    <span className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                        Footer
                                    </span>
                                    {footerOpen ? (
                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </CardTitle>
                            </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <CardContent surface="inset">
                                <Textarea
                                    ref={footerRef}
                                    value={termsAndConditions}
                                    onChange={(e) => {
                                        setTermsAndConditions(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = `${e.target.scrollHeight}px`;
                                    }}
                                    placeholder="Enter a footer for this invoice (e.g. tax information, thank you note)"
                                    rows={2}
                                    className="resize-none min-h-[60px] overflow-hidden"
                                />
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>

                {/* Actions */}
                <div className="flex justify-end gap-4">
                    <Button variant="outline" onClick={() => {
                        if (confirmLeave()) navigate('/invoices');
                    }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!canSave}
                        className="bg-blue-600 interaction-button--primary text-white"
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {primaryActionLabel}
                    </Button>
                </div>
            </div>

            {/* Invoice Preview Modal */}
            <InvoicePreview
                open={showPreview}
                onOpenChange={setShowPreview}
                business={businesses.find(b => b.id === selectedBusinessId)}
                invoiceNumber={invoiceNumber}
                issueDate={issueDate}
                dueDate={dueDate}
                customerName={customerName}
                customerEmail={customerEmail}
                customerPhone={customerPhone}
                customerAddress={customerAddress}
                lineItems={lineItems}
                subtotal={subtotal}
                taxAmount={taxAmount}
                discountAmount={discountAmount}
                total={total}
                currency={currency}
                notes={notes}
                termsAndConditions={termsAndConditions}
                status={isNew ? 'draft' : 'draft'}
            />

            {/* Send Invoice Modal */}
            <SendInvoiceModal
                open={showSendModal}
                onOpenChange={setShowSendModal}
                onSend={handleSendInvoice}
                sending={saving}
                invoice={{
                    id: 0, // Temporary for preview
                    organization_id: organizationId || 0,
                    invoice_number: invoiceNumber,
                    customer_name: customerName,
                    customer_email: customerEmail,
                    customer_phone: customerPhone,
                    customer_address: customerAddress,
                    issue_date: issueDate,
                    due_date: dueDate,
                    subtotal,
                    tax_rate: taxRate,
                    tax_amount: taxAmount,
                    discount_amount: discountAmount,
                    discount_type: 'fixed',
                    discount_value: discountAmount,
                    total,
                    amount_paid: 0,
                    amount_due: total,
                    currency,
                    status: 'draft',
                    notes,
                    terms_and_conditions: termsAndConditions,
                    is_recurring: false,
                    is_recurring_source: false,
                    custom_fields: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    items: lineItems.map((item, idx) => ({
                        id: idx,
                        name: item.name,
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        tax_rate: item.tax_rate,
                        product_id: item.product_id
                    })),
                    business: businesses.find(b => b.id === selectedBusinessId)
                } as Invoice}
                invoiceNumber={invoiceNumber}
                customerName={customerName}
                customerEmail={customerEmail}
                total={total}
                currency={currency}
                dueDate={dueDate}
                business={businesses.find(b => b.id === selectedBusinessId)}
                paymentLinksAvailable={Boolean(settings?.stripe_connected)}
                senderName={organization?.name}
            />

            {loadedInvoice && (
                <MakeRecurringModal
                    open={showRecurringModal}
                    onOpenChange={setShowRecurringModal}
                    onConfirm={handleCreateRecurringSchedule}
                    converting={recurringScheduleSaving}
                    invoiceNumber={loadedInvoice.invoice_number}
                    customerName={loadedInvoice.customer_name || customerName || 'Customer'}
                    total={total}
                    currency={currency}
                    itemCount={lineItems.filter((item) => item.name.trim()).length}
                />
            )}

            <AlertDialog open={pauseScheduleOpen} onOpenChange={setPauseScheduleOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Pause future invoices?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Existing invoices and payments will remain unchanged. You can resume this schedule later.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={recurringScheduleSaving}>Keep active</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault();
                                void handlePauseSchedule();
                            }}
                            disabled={recurringScheduleSaving}
                        >
                            {recurringScheduleSaving ? 'Pausing...' : 'Pause schedule'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
    </PageLayout>
    );
}

export default InvoiceEditorPage;
