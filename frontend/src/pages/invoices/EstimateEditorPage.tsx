import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Save,
    Send,
    Plus,
    Trash2,
    FileText,
    ArrowRight,
    CheckCircle,
    Eye,
    XCircle,
    MoreHorizontal,
    CalendarDays,
    WalletCards,
    ChevronDown,
    ChevronUp,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { useOrganization } from '@/hooks/useOrganization';
import { useDirtyState } from '@/hooks/useDirtyState';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { Product } from '@/services/invoicesApi';
import {
    convertEstimateToInvoice,
    createEstimate,
    EstimateItem,
    sendEstimate,
    updateEstimate,
} from '@/services/estimatesApi';
import { getEstimateEditorBootstrapViaGraphql } from '@/services/salesDocumentEditorGraphql';
import type { JsonRecord } from '@/types';
import { CustomerInfoSection } from './components/CustomerInfoSection';
import { LineItemsTable } from './components/LineItemsTable';
import { formatCurrency, getTodayDateString } from './utils/invoiceFormatters';
import { getEstimateStatusVisual } from './constants/estimateConstants';

interface LineItem {
    id: string;
    product_id?: number;
    name: string;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
}

interface Contact {
    id: number;
    first_name?: string;
    last_name?: string;
    company?: string;
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

const getContactName = (contact: Contact): string => {
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    return fullName || contact.company || contact.email || '';
};

const getContactAddress = (contact: Contact): string => {
    if (typeof contact.address === 'string') return contact.address;
    if (!contact.address || typeof contact.address !== 'object') return '';

    return ['street', 'city', 'state', 'zip', 'country']
        .map((key) => contact.address?.[key])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(', ');
};

export function EstimateEditorPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { toast } = useToast();
    const isNew = id === 'new' || !id;

    const [initialized, setInitialized] = useState(false);
    const [saving, setSaving] = useState(false);
    const { organizationId, error: organizationError } = useOrganization();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const initializedBootstrapRef = useRef<string | null>(null);

    // Estimate state
    const [estimateNumber, setEstimateNumber] = useState('');
    const [issueDate, setIssueDate] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [contactId, setContactId] = useState<number | undefined>();
    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [validUntil, setValidUntil] = useState('');
    const [notes, setNotes] = useState('');
    const [termsAndConditions, setTermsAndConditions] = useState('');
    const [footerOpen, setFooterOpen] = useState(false);
    const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
    const [discountValue, setDiscountValue] = useState(0);
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: crypto.randomUUID(), name: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }
    ]);
    const [status, setStatus] = useState<string>('draft');
    const [lifecycle, setLifecycle] = useState<{
        viewedAt?: string | null;
        acceptedAt?: string | null;
        declinedAt?: string | null;
    }>({});

    const estimateDraft = useMemo(() => ({
        contactId,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        validUntil,
        notes,
        termsAndConditions,
        discountType,
        discountValue,
        lineItems: lineItems.map(({ id: _id, ...item }) => item),
    }), [
        contactId,
        customerAddress,
        customerEmail,
        customerName,
        customerPhone,
        discountType,
        discountValue,
        lineItems,
        notes,
        termsAndConditions,
        validUntil,
    ]);
    const { isDirty, markClean } = useDirtyState({
        value: estimateDraft,
        ready: initialized,
        resetKey: id ?? 'new',
    });
    const { confirmLeave } = useUnsavedChangesGuard({
        when: isDirty || saving,
        message: 'This estimate has unsaved changes. Leave without saving them?',
    });

    const populateContact = useCallback((selectedContact: Contact) => {
        setContactId(selectedContact.id);
        setCustomerName(getContactName(selectedContact));
        setCustomerEmail(selectedContact.email || '');
        setCustomerPhone(selectedContact.phone || '');
        setCustomerAddress(getContactAddress(selectedContact));
    }, []);

    // Set default valid until (30 days from now)
    useEffect(() => {
        if (isNew && !issueDate) {
            setIssueDate(getTodayDateString());
        }
        if (isNew && !validUntil) {
            const date = new Date();
            date.setDate(date.getDate() + 30);
            setValidUntil(date.toISOString().split('T')[0]);
        }
    }, [isNew, issueDate, validUntil]);

    const estimateId = !isNew && id
        && Number.isSafeInteger(Number(id)) && Number(id) > 0
        ? Number(id)
        : null;
    const hasInvalidEstimateId = !isNew && estimateId === null;
    const initialContactCandidate = Number(searchParams.get('contactId'));
    const initialContactId = isNew
        && Number.isSafeInteger(initialContactCandidate)
        && initialContactCandidate > 0
        ? initialContactCandidate
        : null;
    const bootstrapKey = [
        organizationId ?? 'none',
        estimateId ?? 'new',
        initialContactId ?? 'none',
    ].join(':');
    const bootstrapQuery = useQuery({
        queryKey: [
            'estimate-editor-bootstrap',
            organizationId,
            estimateId,
            initialContactId,
        ],
        queryFn: ({ signal }) => getEstimateEditorBootstrapViaGraphql(
            organizationId as number,
            estimateId,
            initialContactId,
            signal,
        ),
        enabled: Boolean(organizationId) && !hasInvalidEstimateId,
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (!bootstrapQuery.data
            || initializedBootstrapRef.current === bootstrapKey) return;
        const data = bootstrapQuery.data;
        const contactList = data.initialContact
            && !data.contacts.some((contact) => contact.id === data.initialContact?.id)
            ? [data.initialContact, ...data.contacts]
            : data.contacts;
        setInitialized(false);
        setContacts(contactList);

        if (data.estimate) {
            const estimate = data.estimate;
            setEstimateNumber(estimate.estimate_number || '');
            setIssueDate(estimate.issue_date?.split('T')[0] || '');
            setCurrency(estimate.currency || 'USD');
            setContactId(estimate.contact_id ?? undefined);
            setCustomerName(estimate.customer_name || '');
            setCustomerEmail(estimate.customer_email || '');
            setCustomerPhone(estimate.customer_phone || '');
            setCustomerAddress(estimate.customer_address || '');
            setValidUntil(estimate.valid_until?.split('T')[0] || '');
            setNotes(estimate.notes || '');
            setTermsAndConditions(estimate.terms_and_conditions || '');
            setDiscountType(estimate.discount_type || 'fixed');
            setDiscountValue(estimate.discount_value || 0);
            setStatus(estimate.status || 'draft');
            setLifecycle({
                viewedAt: estimate.viewed_at,
                acceptedAt: estimate.accepted_at,
                declinedAt: estimate.declined_at,
            });
            if (estimate.items && estimate.items.length > 0) {
                setLineItems((estimate.items as EstimateItem[]).map((item) => ({
                    id: crypto.randomUUID(),
                    product_id: item.product_id ?? undefined,
                    name: item.name,
                    description: item.description || '',
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    tax_rate: item.tax_rate || 0,
                })));
            }
        } else if (data.initialContact) {
            populateContact(data.initialContact);
        }
        initializedBootstrapRef.current = bootstrapKey;
        setInitialized(true);
    }, [bootstrapKey, bootstrapQuery.data, populateContact]);

    useEffect(() => {
        if (initializedBootstrapRef.current !== bootstrapKey) setInitialized(false);
    }, [bootstrapKey]);

    useEffect(() => {
        if (!bootstrapQuery.isError) return;
        toast({
            title: 'Error',
            description: toastMessages.failedToLoad('estimate data'),
            variant: 'destructive',
        });
    }, [bootstrapQuery.errorUpdatedAt, bootstrapQuery.isError, toast]);

    const loadError = bootstrapQuery.isError || hasInvalidEstimateId;
    const loading = !loadError && (bootstrapQuery.isPending || !initialized);

    // Handle contact selection
    const handleContactChange = (contactIdStr: string) => {
        if (contactIdStr === 'none') {
            setContactId(undefined);
            return;
        }
        const selectedContact = contacts.find(c => c.id === parseInt(contactIdStr));
        if (selectedContact) {
            populateContact(selectedContact);
        }
    };

    // Handle product selection for line item
    const handleProductSelect = (lineItemId: string, product: Product | null) => {
        if (!product) {
            updateLineItem(lineItemId, { product_id: undefined });
            return;
        }
        updateLineItem(lineItemId, {
            product_id: product.id,
            name: product.name,
            description: product.description || '',
            unit_price: product.price,
            tax_rate: product.tax_rate || 0,
        });
    };

    // Line item management
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

    const removeLineItem = (itemId: string) => {
        if (lineItems.length > 1) {
            setLineItems(lineItems.filter(i => i.id !== itemId));
        }
    };

    const updateLineItem = (itemId: string, updates: Partial<LineItem>) => {
        setLineItems(lineItems.map(item =>
            item.id === itemId ? { ...item, ...updates } : item
        ));
    };

    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => {
        return sum + (item.quantity * item.unit_price);
    }, 0);

    const taxAmount = lineItems.reduce((sum, item) => {
        const itemTotal = item.quantity * item.unit_price;
        return sum + (itemTotal * (item.tax_rate / 100));
    }, 0);

    const discountAmount = discountType === 'percent'
        ? subtotal * (discountValue / 100)
        : discountValue;

    const total = subtotal + taxAmount - discountAmount;

    // Save estimate
    const handleSave = async () => {
        if (!organizationId) return;

        const validItems = lineItems.filter(i => i.name.trim());
        if (validItems.length === 0) {
            toast({ title: 'Error', description: 'Add at least one line item', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            const estimateData = {
                contact_id: contactId,
                customer_name: customerName || undefined,
                customer_email: customerEmail || undefined,
                customer_phone: customerPhone || undefined,
                customer_address: customerAddress || undefined,
                valid_until: validUntil,
                items: validItems.map(item => ({
                    product_id: item.product_id,
                    name: item.name,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    tax_rate: item.tax_rate,
                })),
                discount_type: discountType,
                discount_value: discountValue,
                notes: notes || undefined,
                terms_and_conditions: termsAndConditions || undefined,
            };

            if (isNew) {
                const response = await createEstimate(estimateData, organizationId);
                toast({ title: 'Created', description: toastMessages.created('estimate') });
                navigate(`/estimates/${response.id}`);
            } else if (id) {
                await updateEstimate(Number(id), estimateData, organizationId);
                markClean();
                toast({ title: 'Saved', description: toastMessages.saved('estimate') });
            }
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToSave('estimate'), variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    // Send estimate
    const handleSendEstimate = async () => {
        if (!organizationId || !id || isNew) return;

        setSaving(true);
        try {
            await sendEstimate(Number(id), organizationId);
            setStatus('sent');
            toast({ title: 'Sent', description: 'Estimate sent successfully' });
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToSend('estimate'), variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    // Convert to invoice
    const handleConvertToInvoice = async () => {
        if (!organizationId || !id || isNew) return;

        setSaving(true);
        try {
            const response = await convertEstimateToInvoice(Number(id), organizationId);
            toast({ title: 'Converted', description: 'Estimate converted to invoice successfully' });
            navigate(`/invoices/${response.invoice_id}`);
        } catch (error) {
            toast({ title: 'Error', description: toastMessages.failedToConvert('estimate'), variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    if (organizationError) {
        return (
            <PageLayout title="ESTIMATE" icon={<FileText className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}>
                <OrganizationErrorState title="Unable to load estimate" icon={FileText} />
            </PageLayout>
        );
    }

    if (loading) {
        return (
            <PageLayout
                title={(isNew ? 'New Estimate' : 'Estimate').toUpperCase()}
                icon={<FileText className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
                leading={
                    <ShellBackButton label="Back to estimates" onClick={() => {
                        if (confirmLeave()) navigate('/estimates');
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
                title="ESTIMATE"
                icon={<FileText className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
                leading={
                    <ShellBackButton label="Back to estimates" onClick={() => navigate('/estimates')} />
                }
            >
                <ErrorState
                    kind="page"
                    title={hasInvalidEstimateId ? 'Invalid estimate' : 'Estimate unavailable'}
                    description={hasInvalidEstimateId
                        ? 'This estimate address is not valid.'
                        : 'We could not load this estimate. Your data has not been changed.'}
                    onAction={hasInvalidEstimateId ? undefined : () => bootstrapQuery.refetch()}
                />
            </PageLayout>
        );
    }

    const canSave = !saving
        && isDirty
        && lineItems.some((item) => item.name.trim().length > 0);
    const primaryActionLabel = saving
        ? 'Saving...'
        : isNew
            ? 'Create estimate'
            : 'Save changes';
    const effectiveStatus = !isNew
        && status === 'sent'
        && validUntil
        && new Date(`${validUntil}T23:59:59`).getTime() < Date.now()
        ? 'expired'
        : status;
    const statusVisual = getEstimateStatusVisual(effectiveStatus);
    const EstimateStatusIcon = statusVisual.icon;
    const hasSecondaryAction = !isNew
        && (status === 'draft' || ['sent', 'accepted'].includes(status));
    const estimateActions = hasSecondaryAction ? (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            className="h-11 min-w-11 gap-2 px-3 font-light"
                            aria-label="Estimate actions"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                            <HeaderActionLabel>More</HeaderActionLabel>
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Estimate actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
                {status === 'draft' && (
                    <DropdownMenuItem
                        onClick={handleSendEstimate}
                        disabled={saving || isDirty}
                        className="group/menu"
                    >
                        <Send className="mr-2 h-4 w-4" />
                        Send Estimate
                    </DropdownMenuItem>
                )}
                {['sent', 'accepted'].includes(status) && (
                    <DropdownMenuItem
                        onClick={handleConvertToInvoice}
                        disabled={saving || isDirty}
                        className="group/menu"
                    >
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Convert to Invoice
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    ) : undefined;

    return (
        <PageLayout
            title={(isNew ? 'New Estimate' : 'Estimate').toUpperCase()}
            icon={<FileText className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
            leading={
                <ShellBackButton label="Back to estimates" onClick={() => {
                    if (confirmLeave()) navigate('/estimates');
                }} />
            }
            headerTools={{
                status: <Badge className={cn('pointer-events-none whitespace-nowrap', statusVisual.badgeClass)}>{statusVisual.label}</Badge>,
                secondaryAction: estimateActions,
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
                    icon={<EstimateStatusIcon className={cn('h-6 w-6', statusVisual.iconClass)} aria-hidden="true" />}
                    iconClassName={statusVisual.iconBackgroundClass}
                    title={estimateNumber || 'New estimate'}
                    mobileStatus={<Badge className={statusVisual.badgeClass}>{statusVisual.label}</Badge>}
                    descriptor={(
                        <span className="inline-flex items-baseline gap-2">
                            Estimate total
                            <span className="text-lg font-semibold text-foreground">{formatCurrency(total, currency)}</span>
                        </span>
                    )}
                    metadata={(
                        <>
                            <span>{customerName || 'No customer selected'}</span>
                            {issueDate && <span>Issued {new Date(`${issueDate}T00:00:00`).toLocaleDateString()}</span>}
                        </>
                    )}
                />

                {!isNew && (lifecycle.viewedAt || lifecycle.acceptedAt || lifecycle.declinedAt) && (
                    <Card className="border-border/80 bg-muted/20 shadow-none">
                        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 text-sm sm:px-6">
                            {lifecycle.viewedAt && (
                                <span className="inline-flex items-center gap-2 text-muted-foreground">
                                    <Eye className="h-4 w-4" />
                                    Viewed {new Date(lifecycle.viewedAt).toLocaleString()}
                                </span>
                            )}
                            {lifecycle.acceptedAt && (
                                <span className="inline-flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                                    <CheckCircle className="h-4 w-4" />
                                    Accepted {new Date(lifecycle.acceptedAt).toLocaleString()}
                                </span>
                            )}
                            {lifecycle.declinedAt && (
                                <span className="inline-flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
                                    <XCircle className="h-4 w-4" />
                                    Declined {new Date(lifecycle.declinedAt).toLocaleString()}
                                </span>
                            )}
                        </CardContent>
                    </Card>
                )}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <CustomerInfoSection
                        idPrefix="estimate"
                        contacts={contacts}
                        contactId={contactId}
                        customerName={customerName}
                        customerEmail={customerEmail}
                        customerPhone={customerPhone}
                        customerAddress={customerAddress}
                        onContactChange={handleContactChange}
                        onCustomerNameChange={setCustomerName}
                        onCustomerEmailChange={setCustomerEmail}
                        onCustomerPhoneChange={setCustomerPhone}
                        onCustomerAddressChange={setCustomerAddress}
                    />

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                Estimate Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent surface="inset" className="space-y-4">
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                                <Label className="text-muted-foreground">Estimate number</Label>
                                <Input
                                    value={estimateNumber || (isNew ? 'Auto-generated' : '')}
                                    readOnly
                                    className="h-9 bg-muted/50 sm:text-right"
                                />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                                <Label className="text-muted-foreground">Estimate date</Label>
                                <Input
                                    type="date"
                                    value={issueDate}
                                    readOnly
                                    className="h-9 bg-muted/50"
                                />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                                <Label htmlFor="estimate-valid-until" className="text-muted-foreground">
                                    Valid until
                                </Label>
                                <Input
                                    id="estimate-valid-until"
                                    type="date"
                                    value={validUntil}
                                    onChange={(event) => setValidUntil(event.target.value)}
                                    className="h-9"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <LineItemsTable
                    lineItems={lineItems}
                    organizationId={organizationId}
                    currency={currency}
                    showTaxRate
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
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                placeholder="Enter notes or terms visible to your customer"
                                rows={5}
                                className="min-h-[9rem] resize-y"
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
                            <div className="flex justify-between text-sm">
                                <span>Tax</span>
                                <span>{formatCurrency(taxAmount, currency)}</span>
                            </div>

                            {discountValue > 0 ? (
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span>Discount</span>
                                        <Select
                                            value={discountType}
                                            onValueChange={(value) => setDiscountType(value as 'fixed' | 'percent')}
                                        >
                                            <SelectTrigger className="h-7 w-16 text-xs">
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
                                            className="h-7 w-16 text-sm"
                                            value={discountValue || ''}
                                            onChange={(event) => setDiscountValue(parseFloat(event.target.value) || 0)}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => setDiscountValue(0)}
                                            aria-label="Remove discount"
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
                                    onClick={() => setDiscountValue(0.01)}
                                >
                                    <Plus className="mr-1 h-3 w-3" />
                                    Add a discount
                                </Button>
                            )}

                            <Separator />

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">Total</span>
                                    <Badge variant="secondary">{currency}</Badge>
                                </div>
                                <span className="text-lg font-bold">{formatCurrency(total, currency)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

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
                                    value={termsAndConditions}
                                    onChange={(event) => setTermsAndConditions(event.target.value)}
                                    placeholder="Enter a footer for this estimate"
                                    rows={2}
                                    className="min-h-[60px] resize-y"
                                />
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>

                <div className="flex justify-end gap-4">
                    <Button variant="outline" onClick={() => {
                        if (confirmLeave()) navigate('/estimates');
                    }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!canSave}
                        className="bg-blue-600 text-white interaction-button--primary"
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {primaryActionLabel}
                    </Button>
                </div>
            </div>
    </PageLayout>
    );
}

export default EstimateEditorPage;
