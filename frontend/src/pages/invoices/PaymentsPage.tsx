import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
    Search,
    CreditCard,
    DollarSign,
    Calendar,
    CheckCircle,
    XCircle,
    Clock,
    Banknote,
    Building,
    Receipt,
    FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import api from '@/lib/api';

interface Payment {
    id: number;
    invoice_id?: number;
    invoice_number?: string;
    contact_id?: number;
    contact_name?: string;
    amount: number;
    currency: string;
    payment_method: 'card' | 'bank_transfer' | 'cash' | 'check' | 'other' | 'stripe';
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
    card_last4?: string;
    card_brand?: string;
    description?: string;
    notes?: string;
    paid_at?: string;
    created_at: string;
}

const PAYMENT_METHOD_ICONS: Record<string, React.ReactNode> = {
    card: <CreditCard className="h-4 w-4" />,
    stripe: <CreditCard className="h-4 w-4" />,
    bank_transfer: <Building className="h-4 w-4" />,
    cash: <Banknote className="h-4 w-4" />,
    check: <FileText className="h-4 w-4" />,
    other: <DollarSign className="h-4 w-4" />,
};

const STATUS_STYLES: Record<string, string> = {
    succeeded: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    refunded: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

export function PaymentsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [methodFilter, setMethodFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Summary stats
    const [stats, setStats] = useState({
        total: 0,
        succeeded: 0,
        pending: 0,
        thisMonth: 0,
    });

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <DollarSign className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SALES & PAYMENTS | Payments
                    </h1>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative hidden md:block w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search payments..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                        <SelectTrigger className="w-[130px] h-9 hidden sm:flex">
                            <SelectValue placeholder="Method" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Methods</SelectItem>
                            <SelectItem value="card">Card</SelectItem>
                            <SelectItem value="bank_transfer">Bank</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[120px] h-9 hidden sm:flex">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="succeeded">Succeeded</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                            <SelectItem value="refunded">Refunded</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, methodFilter, statusFilter, theme, setHeaderContent]);

    useEffect(() => {
        const init = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);
            } catch (error) {
                toast({ title: 'Error', description: 'Failed to initialize', variant: 'destructive' });
                setLoading(false);
            }
        };
        init();
    }, [toast]);

    const fetchPayments = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            // Fetch all payments (need to add this endpoint to backend)
            const response = await api.get('/api/invoices/payments', {
                params: {
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    payment_method: methodFilter !== 'all' ? methodFilter : undefined,
                },
                headers: { 'x-organization-id': organizationId.toString() }
            });
            const data = response.data.payments || response.data || [];
            setPayments(Array.isArray(data) ? data : []);

            // Calculate stats
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            
            const succeededPayments = data.filter((p: Payment) => p.status === 'succeeded');
            const pendingPayments = data.filter((p: Payment) => p.status === 'pending');
            const thisMonthPayments = succeededPayments.filter((p: Payment) => 
                new Date(p.paid_at || p.created_at) >= startOfMonth
            );

            setStats({
                total: succeededPayments.reduce((sum: number, p: Payment) => sum + p.amount, 0),
                succeeded: succeededPayments.length,
                pending: pendingPayments.length,
                thisMonth: thisMonthPayments.reduce((sum: number, p: Payment) => sum + p.amount, 0),
            });
        } catch (error) {
            // If endpoint doesn't exist yet, show empty state
            setPayments([]);
            toast({ title: 'Error', description: 'Failed to load payments', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, statusFilter, methodFilter, toast]);

    useEffect(() => {
        fetchPayments();
    }, [fetchPayments]);

    const formatCurrency = (amount: number, currency: string = 'USD') => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'succeeded': return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'failed': return <XCircle className="h-4 w-4 text-red-600" />;
            case 'pending':
            case 'processing': return <Clock className="h-4 w-4 text-yellow-600" />;
            default: return <DollarSign className="h-4 w-4 text-gray-400" />;
        }
    };

    const filteredPayments = payments.filter(p => {
        const searchLower = searchQuery.toLowerCase();
        return (
            (p.invoice_number && p.invoice_number.toLowerCase().includes(searchLower)) ||
            (p.contact_name && p.contact_name.toLowerCase().includes(searchLower)) ||
            (p.description && p.description.toLowerCase().includes(searchLower))
        );
    });

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Total Received</p>
                                <p className="text-2xl font-bold">{formatCurrency(stats.total)}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                <DollarSign className="h-5 w-5 text-green-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">This Month</p>
                                <p className="text-2xl font-bold">{formatCurrency(stats.thisMonth)}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                <Calendar className="h-5 w-5 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Succeeded</p>
                                <p className="text-2xl font-bold">{stats.succeeded}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                <CheckCircle className="h-5 w-5 text-green-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Pending</p>
                                <p className="text-2xl font-bold">{stats.pending}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center">
                                <Clock className="h-5 w-5 text-yellow-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Payments List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                        </div>
                    ) : filteredPayments.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <DollarSign className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No payments yet</h3>
                            <p className="text-muted-foreground mb-4">
                                Payments will appear here when you record them on invoices
                            </p>
                            <Button
                                variant="outline"
                                onClick={() => navigate('/invoices')}
                            >
                                <Receipt className="h-4 w-4 mr-2" />
                                Go to Invoices
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredPayments.map((payment) => (
                                <div
                                    key={payment.id}
                                    className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => payment.invoice_id && navigate(`/invoices/${payment.invoice_id}`)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                                {getStatusIcon(payment.status)}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="font-medium">
                                                        {formatCurrency(payment.amount, payment.currency)}
                                                    </p>
                                                    <Badge className={`text-xs ${STATUS_STYLES[payment.status] || ''}`}>
                                                        {payment.status}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                                    {payment.invoice_number && (
                                                        <span className="flex items-center gap-1">
                                                            <Receipt className="h-3 w-3" />
                                                            {payment.invoice_number}
                                                        </span>
                                                    )}
                                                    {payment.contact_name && (
                                                        <span>{payment.contact_name}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <div className="flex items-center gap-2 text-sm">
                                                    {PAYMENT_METHOD_ICONS[payment.payment_method] || PAYMENT_METHOD_ICONS.other}
                                                    <span className="capitalize">
                                                        {payment.payment_method === 'bank_transfer' ? 'Bank' : payment.payment_method}
                                                    </span>
                                                    {payment.card_last4 && (
                                                        <span className="text-muted-foreground">
                                                            •••• {payment.card_last4}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {formatDate(payment.paid_at || payment.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default PaymentsPage;
