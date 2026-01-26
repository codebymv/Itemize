import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
    ArrowLeft,
    Save,
    Send,
    Plus,
    Trash2,
    Building,
    Eye,
    ChevronDown,
    ChevronUp,
    UserPlus,
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
import { useHeader } from '@/contexts/HeaderContext';
import { getAssetUrl } from '@/lib/api';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import { getContacts } from '@/services/contactsApi';
import {
    getInvoice,
    createInvoice,
    updateInvoice,
    sendInvoice,
    getProducts,
    getPaymentSettings,
    getBusinesses,
    Product,
    PaymentSettings,
    Business,
} from '@/services/invoicesApi';
import { InvoicePreview } from './components/InvoicePreview';
import { SendInvoiceModal, SendOptions } from './components/SendInvoiceModal';

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
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    address?: string;
}

export function InvoiceEditorPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();
    const isNew = id === 'new' || !id;

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [selectedBusinessId, setSelectedBusinessId] = useState<number | undefined>();
    const [settings, setSettings] = useState<PaymentSettings | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showSendModal, setShowSendModal] = useState(false);
    const [businessSectionOpen, setBusinessSectionOpen] = useState(true);

    // Invoice state
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [invoiceSummary, setInvoiceSummary] = useState('');
    const [contactId, setContactId] = useState<number | undefined>();
    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [issueDate, setIssueDate] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [paymentTerms, setPaymentTerms] = useState<number>(30);
    const [currency, setCurrency] = useState('USD');
    const [notes, setNotes] = useState('');
    const [termsAndConditions, setTermsAndConditions] = useState('');
    const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
    const [discountValue, setDiscountValue] = useState(0);
    const [taxRate, setTaxRate] = useState(0);
    const [footerOpen, setFooterOpen] = useState(false);
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: crypto.randomUUID(), name: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }
    ]);

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

    // Helper function to calculate due date from issue date and payment terms
    const calculateDueDate = (issueDateStr: string, terms: number): string => {
        const [year, month, day] = issueDateStr.split('-').map(Number);
        const issue = new Date(year, month - 1, day); // month is 0-indexed
        issue.setDate(issue.getDate() + terms);
        return `${issue.getFullYear()}-${String(issue.getMonth() + 1).padStart(2, '0')}-${String(issue.getDate()).padStart(2, '0')}`;
    };

    // Handler for when user changes payment terms - recalculate due date
    const handlePaymentTermsChange = (newTerms: number) => {
        setPaymentTerms(newTerms);
        if (issueDate) {
            setDueDate(calculateDueDate(issueDate, newTerms));
        }
    };

    // Set default issue date and due date for new invoices only
    useEffect(() => {
        if (isNew && !issueDate) {
            // Use local date to avoid timezone issues
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            setIssueDate(todayStr);
            // Also set due date immediately
            setDueDate(calculateDueDate(todayStr, paymentTerms));
        }
    }, [isNew]);

    // Setup header
    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/invoices')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Receipt className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SALES & PAYMENTS | {isNew ? 'New Invoice' : 'Invoice'}
                    </h1>
                </div>
                <div className="flex items-center gap-2 mr-4">
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
                        <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => setShowSendModal(true)}
                            disabled={saving}
                        >
                            <Send className="h-4 w-4 mr-2" />
                            Send Invoice
                        </Button>
                    )}
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, setHeaderContent, isNew, saving, lineItems, navigate]);

    // Initialize
    useEffect(() => {
        const init = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);

                // Load contacts, products, businesses, and settings
                const [contactsData, productsData, businessesData, settingsData] = await Promise.all([
                    getContacts({}, org.id),
                    getProducts({}, org.id),
                    getBusinesses(org.id),
                    getPaymentSettings(org.id)
                ]);
                setContacts(Array.isArray(contactsData) ? contactsData : contactsData.contacts || []);
                setProducts(productsData || []);
                setBusinesses(businessesData || []);
                setSettings(settingsData);

                // Load existing invoice if editing
                if (!isNew && id) {
                    const invoice = await getInvoice(parseInt(id), org.id);
                    setInvoiceNumber(invoice.invoice_number || '');
                    setContactId(invoice.contact_id);
                    setSelectedBusinessId(invoice.business_id);
                    setCustomerName(invoice.customer_name || '');
                    setCustomerEmail(invoice.customer_email || '');
                    setCustomerPhone(invoice.customer_phone || '');
                    setCustomerAddress(invoice.customer_address || '');
                    setIssueDate(invoice.issue_date?.split('T')[0] || invoice.created_at?.split('T')[0] || '');
                    setDueDate(invoice.due_date?.split('T')[0] || '');
                    setPaymentTerms(invoice.payment_terms || 30);
                    setCurrency(invoice.currency || 'USD');
                    setNotes(invoice.notes || '');
                    setTermsAndConditions(invoice.terms_and_conditions || '');
                    setDiscountType(invoice.discount_type || 'fixed');
                    setDiscountValue(invoice.discount_value || 0);
                    setTaxRate(invoice.tax_rate || 0);
                    
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
                    // Set defaults for new invoices from settings
                    if (settingsData) {
                        setPaymentTerms(settingsData.default_payment_terms || 30);
                        setCurrency(settingsData.default_currency || 'USD');
                        setNotes(settingsData.default_notes || '');
                        setTermsAndConditions(settingsData.default_terms || '');
                    }
                    // Auto-select last used business for new invoices
                    if (businessesData && businessesData.length > 0) {
                        const lastUsed = businessesData.find(b => b.last_used_at);
                        if (lastUsed) {
                            setSelectedBusinessId(lastUsed.id);
                        }
                    }
                }
            } catch (error) {
                toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [id, isNew, toast]);

    // Handle contact selection
    const handleContactChange = (contactIdStr: string) => {
        if (contactIdStr === 'none') {
            setContactId(undefined);
            return;
        }
        const selectedContact = contacts.find(c => c.id === parseInt(contactIdStr));
        if (selectedContact) {
            setContactId(selectedContact.id);
            setCustomerName(`${selectedContact.first_name} ${selectedContact.last_name}`.trim());
            setCustomerEmail(selectedContact.email || '');
            setCustomerPhone(selectedContact.phone || '');
            setCustomerAddress(selectedContact.address || '');
        }
    };

    // Handle product selection for line item
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

    // Calculate tax from global tax rate
    const taxAmount = subtotal * (taxRate / 100);

    const discountAmount = discountType === 'percent'
        ? subtotal * (discountValue / 100)
        : discountValue;

    const total = subtotal + taxAmount - discountAmount;

    // Save invoice
    const handleSave = async () => {
        if (!organizationId) return;

        const validItems = lineItems.filter(i => i.name.trim());
        if (validItems.length === 0) {
            toast({ title: 'Error', description: 'Add at least one line item', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            const invoiceData = {
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
                items: validItems.map(item => ({
                    product_id: item.product_id,
                    name: item.name,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    tax_rate: 0, // Individual item tax not used, using invoice-level tax
                })),
                discount_type: discountType,
                discount_value: discountValue,
                notes: notes || undefined,
                terms_and_conditions: termsAndConditions || undefined,
            };

            if (isNew) {
                await createInvoice(invoiceData, organizationId);
                toast({ title: 'Created', description: 'Invoice created successfully' });
                navigate('/invoices');
            } else if (id) {
                await updateInvoice(parseInt(id), invoiceData, organizationId);
                toast({ title: 'Saved', description: 'Invoice saved successfully' });
                navigate('/invoices');
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save invoice', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    // Send invoice with email customization
    const handleSendInvoice = async (options: SendOptions) => {
        if (!organizationId || !id || isNew) return;

        setSaving(true);
        try {
            // Pass email customization options to the backend
            const result = await sendInvoice(parseInt(id), organizationId, {
                subject: options.subject,
                message: options.message,
                ccEmails: options.ccEmails,
            });
            
            // Show appropriate toast based on email status
            if (result.emailSent) {
                toast({ title: 'Sent', description: 'Invoice sent successfully and email delivered' });
            } else if (result.emailError) {
                toast({ 
                    title: 'Sent with warning', 
                    description: `Invoice marked as sent but email failed: ${result.emailError}`,
                    variant: 'destructive'
                });
            } else {
                toast({ title: 'Sent', description: 'Invoice marked as sent (email service not configured)' });
            }
            
            setShowSendModal(false);
            navigate('/invoices');
        } catch (error: any) {
            const errorMessage = error?.response?.data?.error || 'Failed to send invoice';
            toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    };

    const getPaymentTermsLabel = (days: number) => {
        if (days === 0) return 'Due on receipt';
        return `Within ${days} days`;
    };

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
                                                        to="/settings/payments"
                                                        className="text-xs text-blue-600 hover:underline block"
                                                    >
                                                        Edit logo
                                                    </Link>
                                                </div>
                                            ) : (
                                                <Link
                                                    to="/settings/payments"
                                                    className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed rounded-lg text-muted-foreground hover:border-blue-500 hover:text-blue-600 transition-colors"
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
                                                to="/settings/payments"
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
                    <Card className="border-2 border-dashed">
                        <CardContent className="pt-6">
                            {/* Only show summary view when a contact is selected from dropdown */}
                            {contactId ? (
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <p className="font-semibold">{customerName || 'Unnamed'}</p>
                                            {customerAddress && (
                                                <p className="text-sm text-muted-foreground whitespace-pre-line">
                                                    {customerAddress}
                                                </p>
                                            )}
                                            {customerPhone && (
                                                <p className="text-sm text-muted-foreground">{customerPhone}</p>
                                            )}
                                            {customerEmail && (
                                                <p className="text-sm text-muted-foreground">{customerEmail}</p>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setContactId(undefined);
                                                setCustomerName('');
                                                setCustomerEmail('');
                                                setCustomerPhone('');
                                                setCustomerAddress('');
                                            }}
                                            className="text-muted-foreground"
                                        >
                                            Change
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Contact selector */}
                                    {contacts.length > 0 && (
                                        <>
                                            <div className="flex flex-col items-center justify-center py-2 text-center">
                                                <UserPlus className="h-6 w-6 text-muted-foreground mb-2" />
                                                <Select
                                                    value="none"
                                                    onValueChange={handleContactChange}
                                                >
                                                    <SelectTrigger className="w-full max-w-xs">
                                                        <SelectValue placeholder="Select existing customer" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">Or enter manually below</SelectItem>
                                                        {contacts.map(contact => (
                                                            <SelectItem key={contact.id} value={contact.id.toString()}>
                                                                {contact.first_name} {contact.last_name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Separator />
                                        </>
                                    )}
                                    {/* Manual entry fields - always visible */}
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <Input
                                                value={customerName}
                                                onChange={(e) => setCustomerName(e.target.value)}
                                                placeholder="Customer name"
                                            />
                                            <Input
                                                type="email"
                                                value={customerEmail}
                                                onChange={(e) => setCustomerEmail(e.target.value)}
                                                placeholder="Email"
                                            />
                                        </div>
                                        <Input
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                            placeholder="Phone"
                                        />
                                        <Textarea
                                            value={customerAddress}
                                            onChange={(e) => setCustomerAddress(e.target.value)}
                                            placeholder="Address"
                                            rows={2}
                                        />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

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
                <Card>
                    <CardContent className="pt-6">
                        {/* Table Header */}
                        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider pb-2 border-b">
                            <div className="col-span-5">Items</div>
                            <div className="col-span-2 text-center">Quantity</div>
                            <div className="col-span-2 text-right">Price</div>
                            <div className="col-span-2 text-right">Amount</div>
                            <div className="col-span-1"></div>
                        </div>

                        {/* Line Items */}
                        <div className="divide-y">
                            {lineItems.map((item) => (
                                <div key={item.id} className="grid grid-cols-12 gap-2 py-3 items-start">
                                    {/* Item Name & Description */}
                                    <div className="col-span-5 space-y-1">
                                        {products.length > 0 ? (
                                            <Select
                                                value={item.product_id?.toString() || 'custom'}
                                                onValueChange={(v) => handleProductSelect(item.id, v)}
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder="Select or type item" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="custom">Custom item</SelectItem>
                                                    {products.map(product => (
                                                        <SelectItem key={product.id} value={product.id.toString()}>
                                                            {product.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Input
                                                value={item.name}
                                                onChange={(e) => updateLineItem(item.id, { name: e.target.value })}
                                                placeholder="Item name"
                                                className="h-9"
                                            />
                                        )}
                                        {item.product_id && (
                                            <Input
                                                value={item.name}
                                                onChange={(e) => updateLineItem(item.id, { name: e.target.value })}
                                                placeholder="Item name"
                                                className="h-8 text-sm"
                                            />
                                        )}
                                        <Input
                                            value={item.description}
                                            onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                                            placeholder="Description (optional)"
                                            className="h-8 text-sm text-muted-foreground"
                                        />
                                    </div>

                                    {/* Quantity */}
                                    <div className="col-span-2">
                                        <Input
                                            type="number"
                                            min="1"
                                            value={item.quantity || ''}
                                            onChange={(e) => updateLineItem(item.id, { quantity: e.target.value === '' ? 1 : parseInt(e.target.value) })}
                                            className="h-9 text-center"
                                        />
                                    </div>

                                    {/* Price */}
                                    <div className="col-span-2">
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={item.unit_price || ''}
                                            onChange={(e) => updateLineItem(item.id, { unit_price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                            className="h-9 text-right"
                                        />
                                    </div>

                                    {/* Amount */}
                                    <div className="col-span-2 text-right pt-2 font-medium">
                                        {formatCurrency(item.quantity * item.unit_price)}
                                    </div>

                                    {/* Delete */}
                                    <div className="col-span-1 flex justify-center pt-1">
                                        {lineItems.length > 1 && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => removeLineItem(item.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add Item Button */}
                        <Button
                            variant="ghost"
                            className="mt-4 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            onClick={addLineItem}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add an item
                        </Button>
                    </CardContent>
                </Card>

                {/* Totals Section - Right Aligned */}
                <div className="flex justify-end">
                    <div className="w-80 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span>Subtotal</span>
                            <span>{formatCurrency(subtotal)}</span>
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
                                <span>{formatCurrency(taxAmount)}</span>
                            </div>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-600 hover:text-blue-700 p-0 h-auto"
                                onClick={() => setTaxRate(10)}
                            >
                                <Plus className="h-3 w-3 mr-1" />
                                Add tax
                            </Button>
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
                                <span>-{formatCurrency(discountAmount)}</span>
                            </div>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-600 hover:text-blue-700 p-0 h-auto"
                                onClick={() => setDiscountValue(0.01)}
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
                            <span className="text-lg font-bold">{formatCurrency(total)}</span>
                        </div>

                        <div className="flex justify-between pt-2 border-t">
                            <span className="font-semibold">Amount Due</span>
                            <span className="text-lg font-bold">{formatCurrency(total)}</span>
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
                invoiceNumber={invoiceNumber}
                customerName={customerName}
                customerEmail={customerEmail}
                total={total}
                currency={currency}
                dueDate={dueDate}
                business={businesses.find(b => b.id === selectedBusinessId)}
            />
        </div>
    );
}

export default InvoiceEditorPage;
