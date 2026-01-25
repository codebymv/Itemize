import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
    ArrowLeft,
    Save,
    Send,
    Plus,
    Trash2,
    FileText,
    User,
    Calendar,
    DollarSign,
    ArrowRight,
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
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization, getContacts } from '@/services/contactsApi';
import { getProducts, Product } from '@/services/invoicesApi';
import api from '@/lib/api';

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

export function EstimateEditorPage() {
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

    // Set default valid until (30 days from now)
    useEffect(() => {
        if (isNew && !validUntil) {
            const date = new Date();
            date.setDate(date.getDate() + 30);
            setValidUntil(date.toISOString().split('T')[0]);
        }
    }, [isNew, validUntil]);

    // Setup header
    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/invoices/estimates')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SALES & PAYMENTS | {isNew ? 'New Estimate' : 'Estimate'}
                    </h1>
                </div>
                <div className="flex items-center gap-2 mr-4">
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
                            variant="outline"
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
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={handleConvertToInvoice}
                            disabled={saving}
                        >
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Convert to Invoice
                        </Button>
                    )}
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, setHeaderContent, isNew, saving, lineItems, navigate, status]);

    // Initialize
    useEffect(() => {
        const init = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);

                // Load contacts and products
                const [contactsData, productsData] = await Promise.all([
                    getContacts({}, org.id),
                    getProducts({}, org.id)
                ]);
                setContacts(Array.isArray(contactsData) ? contactsData : contactsData.contacts || []);
                setProducts(productsData || []);

                // Load existing estimate if editing
                if (!isNew && id) {
                    const response = await api.get(`/api/invoices/estimates/${id}`, {
                        headers: { 'x-organization-id': org.id.toString() }
                    });
                    const estimate = response.data;
                    
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
                    
                    if (estimate.items && estimate.items.length > 0) {
                        setLineItems(estimate.items.map((item: any) => ({
                            id: crypto.randomUUID(),
                            product_id: item.product_id,
                            name: item.name,
                            description: item.description || '',
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            tax_rate: item.tax_rate || 0,
                        })));
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
                const response = await api.post('/api/invoices/estimates', estimateData, {
                    headers: { 'x-organization-id': organizationId.toString() }
                });
                toast({ title: 'Created', description: 'Estimate created successfully' });
                navigate(`/invoices/estimates/${response.data.id}`);
            } else if (id) {
                await api.put(`/api/invoices/estimates/${id}`, estimateData, {
                    headers: { 'x-organization-id': organizationId.toString() }
                });
                toast({ title: 'Saved', description: 'Estimate saved successfully' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save estimate', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    // Send estimate
    const handleSendEstimate = async () => {
        if (!organizationId || !id || isNew) return;

        setSaving(true);
        try {
            await api.post(`/api/invoices/estimates/${id}/send`, {}, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            setStatus('sent');
            toast({ title: 'Sent', description: 'Estimate sent successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to send estimate', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    // Convert to invoice
    const handleConvertToInvoice = async () => {
        if (!organizationId || !id || isNew) return;

        setSaving(true);
        try {
            const response = await api.post(`/api/invoices/estimates/${id}/convert-to-invoice`, {}, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            toast({ title: 'Converted', description: 'Estimate converted to invoice successfully' });
            navigate(`/invoices/${response.data.invoice_id}`);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to convert estimate', variant: 'destructive' });
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
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="space-y-6">
                {/* Customer Details */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Customer Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label>Select Contact</Label>
                            <Select
                                value={contactId?.toString() || 'none'}
                                onValueChange={handleContactChange}
                            >
                                <SelectTrigger>
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
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Name</Label>
                                <Input
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="Customer name"
                                />
                            </div>
                            <div>
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    value={customerEmail}
                                    onChange={(e) => setCustomerEmail(e.target.value)}
                                    placeholder="customer@example.com"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Phone</Label>
                                <Input
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                    placeholder="Phone number"
                                />
                            </div>
                            <div>
                                <Label>Valid Until</Label>
                                <Input
                                    type="date"
                                    value={validUntil}
                                    onChange={(e) => setValidUntil(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <Label>Address</Label>
                            <Textarea
                                value={customerAddress}
                                onChange={(e) => setCustomerAddress(e.target.value)}
                                placeholder="Customer address"
                                rows={2}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Line Items */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                Line Items
                            </span>
                            <Button variant="outline" size="sm" onClick={addLineItem}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Item
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {lineItems.map((item, index) => (
                            <div key={item.id} className="p-4 border rounded-lg space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-muted-foreground">
                                        Item {index + 1}
                                    </span>
                                    {lineItems.length > 1 && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeLineItem(item.id)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    )}
                                </div>
                                
                                {products.length > 0 && (
                                    <div>
                                        <Label>Product</Label>
                                        <Select
                                            value={item.product_id?.toString() || 'custom'}
                                            onValueChange={(v) => handleProductSelect(item.id, v)}
                                        >
                                            <SelectTrigger>
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

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <Label>Name *</Label>
                                        <Input
                                            value={item.name}
                                            onChange={(e) => updateLineItem(item.id, { name: e.target.value })}
                                            placeholder="Item name"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <Label>Description</Label>
                                    <Input
                                        value={item.description}
                                        onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                                        placeholder="Optional description"
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <Label>Quantity</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={item.quantity || ''}
                                            onChange={(e) => updateLineItem(item.id, { quantity: e.target.value === '' ? 1 : parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Unit Price</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={item.unit_price || ''}
                                            onChange={(e) => updateLineItem(item.id, { unit_price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Tax %</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.1"
                                            value={item.tax_rate}
                                            onChange={(e) => updateLineItem(item.id, { tax_rate: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>

                                <div className="text-right text-sm">
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
                <div className="grid grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Notes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Notes for the customer..."
                                rows={4}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <DollarSign className="h-5 w-5" />
                                Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between">
                                <span>Subtotal</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Tax</span>
                                <span>{formatCurrency(taxAmount)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span>Discount</span>
                                <Select
                                    value={discountType}
                                    onValueChange={(v) => setDiscountType(v as 'fixed' | 'percent')}
                                >
                                    <SelectTrigger className="w-24 h-8">
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
                                    className="w-20 h-8"
                                    value={discountValue}
                                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                />
                                <span className="ml-auto">-{formatCurrency(discountAmount)}</span>
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
                <div className="flex justify-end gap-4">
                    <Button variant="outline" onClick={() => navigate('/invoices/estimates')}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving || lineItems.filter(i => i.name).length === 0}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : isNew ? 'Create Estimate' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default EstimateEditorPage;
