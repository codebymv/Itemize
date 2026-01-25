import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
    Plus,
    Search,
    RefreshCw,
    MoreHorizontal,
    Trash2,
    Edit,
    Pause,
    Play,
    Calendar,
    CheckCircle,
    Clock,
    History,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization, getContacts } from '@/services/contactsApi';
import { getProducts, Product } from '@/services/invoicesApi';
import api from '@/lib/api';

interface RecurringInvoice {
    id: number;
    template_name: string;
    contact_id?: number;
    contact_first_name?: string;
    contact_last_name?: string;
    customer_name?: string;
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    status: 'active' | 'paused' | 'completed';
    next_run_date: string;
    start_date: string;
    end_date?: string;
    total: number;
    last_generated_at?: string;
    invoices_generated: number;
    created_at: string;
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

    const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>('all');

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
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <RefreshCw className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        RECURRING INVOICES
                    </h1>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative hidden md:block w-full max-w-xs">
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
                        <Plus className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Create Recurring</span>
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, theme, setHeaderContent]);

    useEffect(() => {
        const init = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);

                // Load contacts and products for the form
                const [contactsData, productsData] = await Promise.all([
                    getContacts({}, org.id),
                    getProducts({}, org.id)
                ]);
                setContacts(Array.isArray(contactsData) ? contactsData : contactsData.contacts || []);
                setProducts(productsData || []);
            } catch (error) {
                toast({ title: 'Error', description: 'Failed to initialize', variant: 'destructive' });
                setLoading(false);
            }
        };
        init();
    }, [toast]);

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

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await api.delete(`/api/invoices/recurring/${id}`, {
                headers: { 'x-organization-id': organizationId.toString() }
            });
            setRecurringInvoices(prev => prev.filter(r => r.id !== id));
            toast({ title: 'Deleted', description: 'Recurring invoice deleted successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
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

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'paused': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'completed': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
            default: return '';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active': return <Play className="h-4 w-4 text-green-600" />;
            case 'paused': return <Pause className="h-4 w-4 text-yellow-600" />;
            case 'completed': return <CheckCircle className="h-4 w-4 text-gray-400" />;
            default: return <Clock className="h-4 w-4 text-gray-400" />;
        }
    };

    const total = lineItems.reduce((sum, item) => {
        return sum + (item.quantity * item.unit_price * (1 + item.tax_rate / 100));
    }, 0);

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('active')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Active</p>
                                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                            </div>
                            <Play className="h-8 w-8 text-green-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('paused')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Paused</p>
                                <p className="text-2xl font-bold text-yellow-600">{stats.paused}</p>
                            </div>
                            <Pause className="h-8 w-8 text-yellow-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('all')}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Completed</p>
                                <p className="text-2xl font-bold">{stats.completed}</p>
                            </div>
                            <CheckCircle className="h-8 w-8 text-gray-400" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <div className="mb-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                        <TabsTrigger value="all">
                            All
                            <Badge variant="secondary" className="ml-2">{recurringInvoices.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="active">Active</TabsTrigger>
                        <TabsTrigger value="paused">Paused</TabsTrigger>
                    </TabsList>
                </Tabs>
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
                            {filteredRecurring.map((recurring) => (
                                <div key={recurring.id} className="p-4 hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                                {getStatusIcon(recurring.status)}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="font-medium">{recurring.template_name}</p>
                                                    <Badge className={`text-xs ${getStatusBadge(recurring.status)}`}>
                                                        {recurring.status}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-xs">
                                                        {FREQUENCY_LABELS[recurring.frequency]}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground">{getContactName(recurring)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="font-medium">{formatCurrency(recurring.total)}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {recurring.status === 'active' && recurring.next_run_date && (
                                                        <>Next: {new Date(recurring.next_run_date).toLocaleDateString()}</>
                                                    )}
                                                    {recurring.invoices_generated > 0 && (
                                                        <span className="ml-2">
                                                            ({recurring.invoices_generated} generated)
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem>
                                                        <Edit className="h-4 w-4 mr-2" />Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem>
                                                        <History className="h-4 w-4 mr-2" />View History
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    {recurring.status === 'active' && (
                                                        <DropdownMenuItem onClick={() => handlePause(recurring.id)}>
                                                            <Pause className="h-4 w-4 mr-2" />Pause
                                                        </DropdownMenuItem>
                                                    )}
                                                    {recurring.status === 'paused' && (
                                                        <DropdownMenuItem onClick={() => handleResume(recurring.id)}>
                                                            <Play className="h-4 w-4 mr-2" />Resume
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(recurring.id)}
                                                        className="text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Recurring Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RefreshCw className="h-5 w-5 text-blue-500" />
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
                                                <Trash2 className="h-4 w-4 text-destructive" />
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
        </div>
    );
}

export default RecurringInvoicesPage;
