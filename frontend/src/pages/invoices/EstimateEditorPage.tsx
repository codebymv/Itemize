import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    Save,
    Send,
    Plus,
    Trash2,
    FileText,
    User,
    DollarSign,
    StickyNote,
    ArrowRight,
    CheckCircle,
    Eye,
    XCircle,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { PageLayout } from '@/components/layout/PageLayout';
import { getContact, getContacts } from '@/services/contactsApi';
import { useOrganization } from '@/hooks/useOrganization';
import { getProducts, Product } from '@/services/invoicesApi';
import {
    convertEstimateToInvoice,
    createEstimate,
    EstimateItem,
    getEstimate,
    sendEstimate,
    updateEstimate,
} from '@/services/estimatesApi';
import type { JsonRecord } from '@/types';

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

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const { organizationId } = useOrganization();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    // Estimate state
    const [contactId, setContactId] = useState<number | undefined>();
    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [validUntil, setValidUntil] = useState('');
    const [notes, setNotes] = useState('');
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

    const populateContact = useCallback((selectedContact: Contact) => {
        setContactId(selectedContact.id);
        setCustomerName(getContactName(selectedContact));
        setCustomerEmail(selectedContact.email || '');
        setCustomerPhone(selectedContact.phone || '');
        setCustomerAddress(getContactAddress(selectedContact));
    }, []);

    // Set default valid until (30 days from now)
    useEffect(() => {
        if (isNew && !validUntil) {
            const date = new Date();
            date.setDate(date.getDate() + 30);
            setValidUntil(date.toISOString().split('T')[0]);
        }
    }, [isNew, validUntil]);

    // Initialize
    useEffect(() => {
        if (!organizationId) return;
        const init = async () => {
            try {
                const [contactsData, productsData] = await Promise.all([
                    getContacts({}, organizationId),
                    getProducts({}, organizationId)
                ]);
                const contactList = Array.isArray(contactsData)
                    ? contactsData
                    : contactsData.contacts || [];
                setContacts(contactList);
                setProducts(productsData || []);

                // Load existing estimate if editing
                if (!isNew && id) {
                    const estimate = await getEstimate(Number(id), organizationId);
                    
                    setContactId(estimate.contact_id);
                    setCustomerName(estimate.customer_name || '');
                    setCustomerEmail(estimate.customer_email || '');
                    setCustomerPhone(estimate.customer_phone || '');
                    setCustomerAddress(estimate.customer_address || '');
                    setValidUntil(estimate.valid_until?.split('T')[0] || '');
                    setNotes(estimate.notes || '');
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
                            product_id: item.product_id,
                            name: item.name,
                            description: item.description || '',
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            tax_rate: item.tax_rate || 0,
                        })));
                    }
                } else {
                    const contactIdParam = searchParams.get('contactId');
                    const contactIdCandidate = contactIdParam
                        ? Number(contactIdParam)
                        : Number.NaN;
                    const parsedContactId = Number.isSafeInteger(contactIdCandidate)
                        && contactIdCandidate > 0
                        ? contactIdCandidate
                        : undefined;

                    if (parsedContactId) {
                        let selectedContact = contactList.find(
                            (contact) => contact.id === parsedContactId,
                        );

                        if (!selectedContact) {
                            try {
                                selectedContact = await getContact(
                                    parsedContactId,
                                    organizationId,
                                ) as Contact;
                                setContacts([selectedContact, ...contactList]);
                            } catch {
                                toast({
                                    title: 'Contact unavailable',
                                    description: toastMessages.failedToLoad('contact'),
                                    variant: 'destructive',
                                });
                            }
                        }

                        if (selectedContact) populateContact(selectedContact);
                    }
                }
            } catch (error) {
                toast({ title: 'Error', description: toastMessages.failedToLoad('estimate data'), variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [organizationId, id, isNew, populateContact, searchParams, toast]);

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
            };

            if (isNew) {
                const response = await createEstimate(estimateData, organizationId);
                toast({ title: 'Created', description: toastMessages.created('estimate') });
                navigate(`/estimates/${response.id}`);
            } else if (id) {
                await updateEstimate(Number(id), estimateData, organizationId);
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

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    if (loading) {
        return (
            <PageLayout
                title={(isNew ? 'New Estimate' : 'Estimate').toUpperCase()}
                icon={<FileText className="h-5 w-5 text-primary flex-shrink-0" />}
                leading={
                    <Button variant="ghost" size="icon" onClick={() => navigate('/estimates')}>
                        <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                    </Button>
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

    return (
        <PageLayout
            title={(isNew ? 'New Estimate' : 'Estimate').toUpperCase()}
            icon={<FileText className="h-5 w-5 text-primary flex-shrink-0" />}
            leading={
                <Button variant="ghost" size="icon" onClick={() => navigate('/estimates')}>
                    <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </Button>
            }
            headerActions={
                <>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSave}
                        disabled={saving || lineItems.filter(i => i.name).length === 0}
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Draft'}
                    </Button>
                    {!isNew && status === 'draft' && (
                        <Button
                            size="sm"
                            onClick={handleSendEstimate}
                            disabled={saving}
                        >
                            <Send className="h-4 w-4 mr-2" />
                            Send
                        </Button>
                    )}
                    {!isNew && ['sent', 'accepted'].includes(status) && (
                        <Button
                            size="sm"
                            onClick={handleConvertToInvoice}
                            disabled={saving}
                        >
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Convert to Invoice
                        </Button>
                    )}
                </>
            }
            mobileActions={
                <>
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
                    {!isNew && status === 'draft' && (
                        <Button
                            size="sm"
                            onClick={handleSendEstimate}
                            disabled={saving}
                            className="flex-1"
                        >
                            <Send className="h-4 w-4 mr-2" />
                            Send
                        </Button>
                    )}
                    {!isNew && ['sent', 'accepted'].includes(status) && (
                        <Button
                            size="sm"
                            className="flex-1"
                            onClick={handleConvertToInvoice}
                            disabled={saving}
                        >
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Convert
                        </Button>
                    )}
                </>
            }
        >
                <div className="space-y-6">
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
                                <span className="inline-flex items-center gap-2 text-muted-foreground font-medium">
                                    <XCircle className="h-4 w-4" />
                                    Declined {new Date(lifecycle.declinedAt).toLocaleString()}
                                </span>
                            )}
                        </CardContent>
                    </Card>
                )}
                    {/* Customer Details */}
                <Card className="overflow-hidden border-border/80 shadow-none">
                    <CardHeader className="border-b bg-muted/20 px-4 py-4 sm:px-6">
                        <CardTitle className="flex items-center gap-3 text-base sm:text-lg">
                            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                                <User className="h-4 w-4" />
                            </span>
                            <span>Customer details</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5 p-4 sm:p-6">
                        <div className="space-y-2">
                            <Label htmlFor="estimate-contact">Select contact</Label>
                            <Select
                                value={contactId?.toString() || 'none'}
                                onValueChange={handleContactChange}
                            >
                                <SelectTrigger id="estimate-contact" className="bg-card">
                                    <SelectValue placeholder="Select a contact or enter manually" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Enter manually</SelectItem>
                                    {contacts.map(contact => (
                                        <SelectItem key={contact.id} value={contact.id.toString()}>
                                            {contact.first_name} {contact.last_name} {contact.email && `(${contact.email})`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="estimate-customer-name">Name</Label>
                                <Input
                                    id="estimate-customer-name"
                                    className="bg-card"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="Customer name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="estimate-customer-email">Email</Label>
                                <Input
                                    id="estimate-customer-email"
                                    className="bg-card"
                                    type="email"
                                    value={customerEmail}
                                    onChange={(e) => setCustomerEmail(e.target.value)}
                                    placeholder="customer@example.com"
                                />
                            </div>
                        </div>
                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="estimate-customer-phone">Phone</Label>
                                <Input
                                    id="estimate-customer-phone"
                                    className="bg-card"
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                    placeholder="Phone number"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="estimate-valid-until">Valid until</Label>
                                <Input
                                    id="estimate-valid-until"
                                    className="bg-card"
                                    type="date"
                                    value={validUntil}
                                    onChange={(e) => setValidUntil(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="estimate-customer-address">Address</Label>
                            <Textarea
                                id="estimate-customer-address"
                                className="bg-card"
                                value={customerAddress}
                                onChange={(e) => setCustomerAddress(e.target.value)}
                                placeholder="Customer address"
                                rows={2}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Line Items */}
                <Card className="overflow-hidden border-border/80 shadow-none">
                    <CardHeader className="flex-row items-center justify-between space-y-0 border-b bg-muted/20 px-4 py-4 sm:px-6">
                        <CardTitle className="flex items-center gap-3 text-base sm:text-lg">
                            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                                <FileText className="h-4 w-4" />
                            </span>
                            <span>Line items</span>
                        </CardTitle>
                        <Button size="sm" onClick={addLineItem}>
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">Add item</span>
                            <span className="sm:hidden">Add</span>
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4 sm:p-6">
                        {lineItems.map((item, index) => (
                            <div key={item.id} className="space-y-5 rounded-lg border border-border/80 bg-background/50 p-4 sm:p-5">
                                <div className="flex items-center justify-between">
                                    <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs text-primary">
                                            {index + 1}
                                        </span>
                                        Line item
                                    </span>
                                    {lineItems.length > 1 && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeLineItem(item.id)}
                                            aria-label={`Remove item ${index + 1}`}
                                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                                
                                {products.length > 0 && (
                                    <div className="space-y-2">
                                        <Label>Product</Label>
                                        <Select
                                            value={item.product_id?.toString() || 'custom'}
                                            onValueChange={(v) => handleProductSelect(item.id, v)}
                                        >
                                            <SelectTrigger className="bg-card">
                                                <SelectValue placeholder="Select product or custom" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="custom">Custom item</SelectItem>
                                                {products.map(product => (
                                                    <SelectItem key={product.id} value={product.id.toString()}>
                                                        {product.name} - {formatCurrency(product.price)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div>
                                    <div className="space-y-2">
                                        <Label>Name *</Label>
                                        <Input
                                            className="bg-card"
                                            value={item.name}
                                            onChange={(e) => updateLineItem(item.id, { name: e.target.value })}
                                            placeholder="Item name"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Description</Label>
                                    <Input
                                        className="bg-card"
                                        value={item.description}
                                        onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                                        placeholder="Optional description"
                                    />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>Quantity</Label>
                                        <Input
                                            className="bg-card"
                                            type="number"
                                            min="1"
                                            value={item.quantity || ''}
                                            onChange={(e) => updateLineItem(item.id, { quantity: e.target.value === '' ? 1 : parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Unit Price</Label>
                                        <Input
                                            className="bg-card"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={item.unit_price || ''}
                                            onChange={(e) => updateLineItem(item.id, { unit_price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tax %</Label>
                                        <Input
                                            className="bg-card"
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.1"
                                            value={item.tax_rate}
                                            onChange={(e) => updateLineItem(item.id, { tax_rate: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>

                                <div className="rounded-md bg-primary/5 px-3 py-2 text-right text-sm">
                                    <span className="text-muted-foreground">Line Total: </span>
                                    <span className="font-medium">
                                        {formatCurrency(item.quantity * item.unit_price * (1 + item.tax_rate / 100))}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Totals & Notes */}
                <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="overflow-hidden border-border/80 shadow-none">
                        <CardHeader className="border-b bg-muted/20 px-4 py-4 sm:px-6">
                            <CardTitle className="flex items-center gap-3 text-base sm:text-lg">
                                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                                    <StickyNote className="h-4 w-4" />
                                </span>
                                <span>Customer notes</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-6">
                            <Textarea
                                className="min-h-32 bg-card"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Notes for the customer..."
                                rows={4}
                            />
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden border-border/80 shadow-none">
                        <CardHeader className="border-b bg-muted/20 px-4 py-4 sm:px-6">
                            <CardTitle className="flex items-center gap-3 text-base sm:text-lg">
                                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                                    <DollarSign className="h-4 w-4" />
                                </span>
                                <span>Summary</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 p-4 sm:p-6">
                            <div className="flex justify-between">
                                <span>Subtotal</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Tax</span>
                                <span>{formatCurrency(taxAmount)}</span>
                            </div>
                            <div className="grid grid-cols-[auto_auto_1fr] items-center gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                                <span className="col-span-3 sm:col-span-1">Discount</span>
                                <Select
                                    value={discountType}
                                    onValueChange={(v) => setDiscountType(v as 'fixed' | 'percent')}
                                >
                                    <SelectTrigger className="h-9 w-24 bg-card">
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
                                    className="h-9 w-24 bg-card"
                                    value={discountValue}
                                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                />
                                <span className="col-span-3 text-right text-sm text-muted-foreground sm:col-span-1 sm:text-foreground">-{formatCurrency(discountAmount)}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between text-lg font-bold">
                                <span>Total</span>
                                <span>{formatCurrency(total)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Actions */}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={() => navigate('/estimates')}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving || lineItems.filter(i => i.name).length === 0}
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : isNew ? 'Create Estimate' : 'Save Changes'}
                    </Button>
                </div>
            </div>
    </PageLayout>
    );
}

export default EstimateEditorPage;
