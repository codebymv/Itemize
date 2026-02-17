import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
    ArrowLeft,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { useHeader } from '@/contexts/HeaderContext';
import { getAssetUrl } from '@/lib/api';
import { useOrganization } from '@/hooks/useOrganization';
import { getContacts } from '@/services/contactsApi';
import {
    getInvoice,
    getProducts,
    getPaymentSettings,
    getBusinesses,
    Product,
    PaymentSettings,
    Business,
    Invoice,
} from '@/services/invoicesApi';
import { InvoicePreview } from './components/InvoicePreview';
import { SendInvoiceModal, SendOptions } from './components/SendInvoiceModal';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { CustomerInfoSection } from './components/CustomerInfoSection';
import { LineItemsTable } from './components/LineItemsTable';
import { useLineItems } from './hooks/useLineItems';
import { useInvoiceCalculations } from './hooks/useInvoiceCalculations';
import { useContactSelection } from './hooks/useContactSelection';
import { useInvoiceForm } from './hooks/useInvoiceForm';
import { useInvoiceSave } from './hooks/useInvoiceSave';
import { formatCurrency, getPaymentTermsLabel } from './utils/invoiceFormatters';

interface Contact {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    address?: string | {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
    } | Record<string, any>;
}

export function InvoiceEditorPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();
    const isNew = id === 'new' || !id;

    const [loading, setLoading] = useState(!isNew);
    const { organizationId } = useOrganization();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [settings, setSettings] = useState<PaymentSettings | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showSendModal, setShowSendModal] = useState(false);
    const [businessSectionOpen, setBusinessSectionOpen] = useState(true);
    const [footerOpen, setFooterOpen] = useState(false);

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

    // Setup header
    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0 flex-1">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/invoices')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Receipt className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate min-w-0 font-raleway"
                        style={{ color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        {(isNew ? 'New Invoice' : 'Invoice').toUpperCase()}
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 mr-4 flex-shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPreview(true)}
                    >
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSave}
                        disabled={saving || lineItems.filter(i => i.name).length === 0}
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Draft'}
                    </Button>
                    {!isNew && (
                        <>
                            <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() => setShowSendModal(true)}
                                disabled={saving}
                            >
                                <Send className="h-4 w-4 mr-2" />
                                Send Invoice
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                                onClick={() => navigate(`/documents/new?invoiceId=${id}`)}
                                disabled={saving}
                            >
                                <FileSignature className="h-4 w-4 mr-2" />
                                Send for Signature
                            </Button>
                        </>
                    )}
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, setHeaderContent, isNew, id, saving, lineItems, navigate]);

    // Initialize
    useEffect(() => {
        if (!organizationId) return;
        const init = async () => {
            try {
                const [contactsData, productsData, businessesData, settingsData] = await Promise.all([
                    getContacts({}, organizationId),
                    getProducts({}, organizationId),
                    getBusinesses(organizationId),
                    getPaymentSettings(organizationId)
                ]);
                setContacts(Array.isArray(contactsData) ? contactsData : contactsData.contacts || []);
                setProducts(Array.isArray(productsData) ? productsData : productsData?.products || []);
                setBusinesses(Array.isArray(businessesData) ? businessesData : businessesData?.businesses || []);
                setSettings(settingsData);

                // Load existing invoice if editing
                if (!isNew && id) {
                    const invoice = await getInvoice(parseInt(id), organizationId);
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
                    // Pre-fill from URL (e.g. from Contact detail "Create Invoice")
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
                    // Auto-select last used business for new invoices
                    const businessesList = Array.isArray(businessesData) ? businessesData : businessesData?.businesses || [];
                    if (businessesList.length > 0) {
                        const lastUsed = businessesList.find(b => b.last_used_at);
                        if (lastUsed) {
                            setSelectedBusinessId(lastUsed.id);
                        }
                    }
                }
            } catch (error) {
                toast({ title: 'Error', description: toastMessages.failedToLoad('invoice data'), variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [organizationId, id, isNew, toast, loadInvoiceData, loadContactData, setLineItems, setSelectedBusinessId]);



    if (loading) {
        return (
            <div className="container mx-auto p-6 max-w-4xl">
                <div className="space-y-6">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-64" />
                    <Skeleton className="h-32" />
                </div>
            </div>
        );
    }

    return (
        <>
            <MobileControlsBar>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(true)}
                    className="flex-1"
                >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || lineItems.filter(i => i.name).length === 0}
                    className="flex-1"
                >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save'}
                </Button>
                {!isNew && (
                    <>
                        <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                            onClick={() => setShowSendModal(true)}
                            disabled={saving}
                        >
                            <Send className="h-4 w-4 mr-2" />
                            Send
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-blue-600 text-blue-600"
                            onClick={() => navigate(`/documents/new?invoiceId=${id}`)}
                            disabled={saving}
                        >
                            <FileSignature className="h-4 w-4 mr-2" />
                            Sign
                        </Button>
                    </>
                )}
            </MobileControlsBar>
            <div className="container mx-auto p-6 max-w-5xl">
                <div className="space-y-6">
                {/* Business Address, Contact Details, Title, Summary, and Logo - Collapsible */}
                <Collapsible open={businessSectionOpen} onOpenChange={setBusinessSectionOpen}>
                    <Card>
                        <CollapsibleTrigger asChild>
                            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                                <CardTitle className="flex items-center justify-between text-sm font-medium">
                                    <span>Business address and contact details, title, summary, and logo</span>
                                    {businessSectionOpen ? (
                                        <ChevronUp className="h-4 w-4" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4" />
                                    )}
                                </CardTitle>
                            </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <CardContent className="pt-0">
                                <div className="flex gap-6">
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
                                                        className="text-xs text-blue-600 hover:underline block"
                                                    >
                                                        Edit logo
                                                    </Link>
                                                </div>
                                            ) : (
                                                <Link
                                                    to="/payment-settings"
                                                    className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed rounded-lg text-muted-foreground hover:border-blue-600 hover:text-blue-600 transition-colors"
                                                >
                                                    <Building className="h-8 w-8 mb-1" />
                                                    <span className="text-xs text-center">Add logo</span>
                                                </Link>
                                            );
                                        })()}
                                    </div>

                                    {/* Right: Invoice Title + Summary + Business Selector */}
                                    <div className="flex-1 space-y-4">
                                        {/* Invoice Title and Summary */}
                                        <div className="flex gap-4 items-start">
                                            <div className="flex-1 space-y-2">
                                                <Input
                                                    value="Invoice"
                                                    readOnly
                                                    className="text-2xl font-light h-auto py-2 border-none bg-transparent focus-visible:ring-0 text-right"
                                                />
                                                <Input
                                                    value={invoiceSummary}
                                                    onChange={(e) => setInvoiceSummary(e.target.value)}
                                                    placeholder="Summary (e.g. project name, description of invoice)"
                                                    className="text-sm text-right"
                                                />
                                            </div>
                                        </div>

                                        {/* Business Selector */}
                                        <div className="text-right text-sm space-y-2">
                                            {businesses.length > 0 ? (
                                                <>
                                                    <Select
                                                        value={selectedBusinessId?.toString() || ''}
                                                        onValueChange={(v) => setSelectedBusinessId(v ? parseInt(v) : undefined)}
                                                    >
                                                        <SelectTrigger className="w-full max-w-xs ml-auto text-right">
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
                                                className="text-blue-600 hover:underline inline-block mt-2"
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-muted-foreground">Invoice number</Label>
                                <Input
                                    value={invoiceNumber || (isNew ? 'Auto-generated' : '')}
                                    readOnly
                                    className="w-32 text-right h-8 bg-muted/50"
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label className="text-muted-foreground">Invoice date</Label>
                                <Input
                                    type="date"
                                    value={issueDate}
                                    onChange={(e) => setIssueDate(e.target.value)}
                                    className="w-40 h-8"
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label className="text-muted-foreground">Payment due</Label>
                                <div className="text-right">
                                    <Input
                                        type="date"
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                        className="w-40 h-8"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {getPaymentTermsLabel(paymentTerms)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <Label className="text-muted-foreground">Payment due</Label>
                                <Select
                                    value={String(paymentTerms)}
                                    onValueChange={(v) => handlePaymentTermsChange(parseInt(v))}
                                >
                                    <SelectTrigger className="w-40 h-8">
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

                {/* Totals Section - Right Aligned */}
                <div className="flex justify-end">
                    <div className="w-80 space-y-3">
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
                                    className="h-7 px-2 text-blue-600 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/60 hover:bg-blue-50 dark:hover:bg-blue-900/30"
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
                                className="h-7 px-2 text-blue-600 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/60 hover:bg-blue-50 dark:hover:bg-blue-900/30"
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

                        <div className="flex justify-between pt-2 border-t">
                            <span className="font-semibold">Amount Due</span>
                            <span className="text-lg font-bold">{formatCurrency(total, currency)}</span>
                        </div>
                    </div>
                </div>

                {/* Notes / Terms */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Notes / Terms</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            ref={notesRef}
                            value={notes}
                            onChange={(e) => {
                                setNotes(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                            }}
                            placeholder="Enter notes or terms of service that are visible to your customer"
                            rows={2}
                            className="resize-none min-h-[60px] overflow-hidden"
                        />
                    </CardContent>
                </Card>

                {/* Footer - Collapsible */}
                <Collapsible open={footerOpen} onOpenChange={setFooterOpen}>
                    <Card>
                        <CollapsibleTrigger asChild>
                            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                                <CardTitle className="flex items-center justify-between text-sm font-medium">
                                    <span>Footer</span>
                                    {footerOpen ? (
                                        <ChevronUp className="h-4 w-4" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4" />
                                    )}
                                </CardTitle>
                            </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <CardContent className="pt-0">
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
                    <Button variant="outline" onClick={() => navigate('/invoices')}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving || lineItems.filter(i => i.name).length === 0}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : isNew ? 'Create Invoice' : 'Save Changes'}
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
            />
        </div>
        </>
    );
}

export default InvoiceEditorPage;
