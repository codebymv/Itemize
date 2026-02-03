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
    ChevronRight,
    ChevronDown,
    ExternalLink,
    Download,
    Copy,
    MoreVertical,
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
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { useOrganization } from '@/hooks/useOrganization';
import api from '@/lib/api';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Payment {
    id: number;
    invoice_id?: number;
    invoice_number?: string;
    contact_id?: number;
    contact_name?: string;
    first_name?: string;
    last_name?: string;
    amount: number;
    currency: string;
    payment_method: 'card' | 'bank_transfer' | 'cash' | 'check' | 'other' | 'stripe';
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
    card_last4?: string;
    card_brand?: string;
    description?: string;
    notes?: string;
    receipt_url?: string;
    stripe_payment_intent_id?: string;
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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    card: 'Card',
    stripe: 'Stripe',
    bank_transfer: 'Bank Transfer',
    cash: 'Cash',
    check: 'Check',
    other: 'Other',
};

const STATUS_STYLES: Record<string, string> = {
    succeeded: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    pending: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
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

    // Route-aware onboarding (will show 'invoices' onboarding for all Sales & Payments routes)
    const {
        showModal: showOnboarding,
        handleComplete: handleOnboardingComplete,
        handleDismiss: handleOnboardingDismiss,
        handleClose: handleOnboardingClose,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [methodFilter, setMethodFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Expanded payment state
    const [expandedId, setExpandedId] = useState<number | null>(null);

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
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <DollarSign className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className={`text-xl font-semibold italic truncate font-raleway ${theme === 'dark' ? 'text-white' : 'text-black'}`}
                    >
                        PAYMENTS
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                        <SelectTrigger className="w-[130px] h-9">
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
                        <SelectTrigger className="w-[120px] h-9">
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
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search payments..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, methodFilter, statusFilter, theme, setHeaderContent]);

    useEffect(() => {
        if (!initError) return;
        toast({ title: 'Error', description: initError, variant: 'destructive' });
        setLoading(false);
    }, [initError, toast]);

    const fetchPayments = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
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
                total: succeededPayments.reduce((sum: number, p: Payment) => sum + (Number(p.amount) || 0), 0),
                succeeded: succeededPayments.length,
                pending: pendingPayments.length,
                thisMonth: thisMonthPayments.reduce((sum: number, p: Payment) => sum + (Number(p.amount) || 0), 0),
            });
        } catch (error) {
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
        const validAmount = Number(amount) || 0;
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(validAmount);
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

    const formatDateShort = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const getStatusBadge = (status: string) => {
        return STATUS_STYLES[status] || '';
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'succeeded': return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
            case 'failed': return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
            case 'pending': return <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
            case 'processing': return <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
            case 'refunded': return <DollarSign className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
            default: return <DollarSign className="h-4 w-4 text-gray-400 dark:text-gray-500" />;
        }
    };

    const getStatusIconBg = (status: string) => {
        switch (status) {
            case 'succeeded': return 'bg-green-100 dark:bg-green-900';
            case 'failed': return 'bg-red-100 dark:bg-red-900';
            case 'pending': return 'bg-orange-100 dark:bg-orange-900';
            case 'processing': return 'bg-blue-100 dark:bg-blue-900';
            case 'refunded': return 'bg-purple-100 dark:bg-purple-900';
            default: return 'bg-gray-100 dark:bg-gray-800';
        }
    };

    const getContactName = (payment: Payment) => {
        if (payment.contact_name) return payment.contact_name;
        if (payment.first_name || payment.last_name) {
            return `${payment.first_name || ''} ${payment.last_name || ''}`.trim();
        }
        return 'Unknown';
    };

    const handleToggleExpand = (paymentId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedId(expandedId === paymentId ? null : paymentId);
    };

    const handleCopyToClipboard = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast({ title: 'Copied', description: `${label} copied to clipboard` });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to copy', variant: 'destructive' });
        }
    };

    const filteredPayments = payments.filter(p => {
        const searchLower = searchQuery.toLowerCase();
        return (
            (p.invoice_number && p.invoice_number.toLowerCase().includes(searchLower)) ||
            (p.contact_name && p.contact_name.toLowerCase().includes(searchLower)) ||
            (p.first_name && p.first_name.toLowerCase().includes(searchLower)) ||
            (p.last_name && p.last_name.toLowerCase().includes(searchLower)) ||
            (p.description && p.description.toLowerCase().includes(searchLower))
        );
    });

    return (
        <>
            {/* Mobile Controls Bar */}
            <MobileControlsBar className="flex-col items-stretch">
                <div className="flex items-center gap-2 w-full">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search payments..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full">
                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                        <SelectTrigger className="flex-1 h-9">
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
                        <SelectTrigger className="flex-1 h-9">
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
            </MobileControlsBar>

            <PageContainer>
                <PageSurface>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className="text-xs mb-2 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">This Month</Badge>
                                <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.thisMonth)}</p>
                                <p className="text-xs text-muted-foreground">Received this month</p>
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
                                <Badge className={`text-xs mb-2 ${getStatusBadge('pending')}`}>Pending</Badge>
                                <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
                                <p className="text-xs text-muted-foreground">{stats.pending} payment{stats.pending !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                                <Clock className="h-5 w-5 text-orange-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge className={`text-xs mb-2 ${getStatusBadge('succeeded')}`}>Succeeded</Badge>
                                <p className="text-2xl font-bold text-green-600">{stats.succeeded}</p>
                                <p className="text-xs text-muted-foreground">{stats.succeeded} payment{stats.succeeded !== 1 ? 's' : ''}</p>
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
                                <Badge className={`text-xs mb-2 ${getStatusBadge('succeeded')}`}>Total Received</Badge>
                                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.total)}</p>
                                <p className="text-xs text-muted-foreground">{stats.succeeded} payment{stats.succeeded !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                <DollarSign className="h-5 w-5 text-green-600" />
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
                                onClick={() => navigate('/invoices')}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <Receipt className="h-4 w-4 mr-2" />
                                Go to Invoices
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredPayments.map((payment) => {
                                const isExpanded = expandedId === payment.id;
                                
                                return (
                                    <div key={payment.id}>
                                        {/* Payment Row - Aligned with VaultCard Pattern */}
                                        <div
                                            className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                                            onClick={(e) => handleToggleExpand(payment.id, e)}
                                        >
                                            {/* Header Row: Icon + Amount on left, Date + Chevron + Menu on right */}
                                            <div className="flex items-center justify-between">
                                                {/* Left Side: Status Icon + Amount */}
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    {/* Status Icon */}
                                                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getStatusIconBg(payment.status)}`}>
                                                        {getStatusIcon(payment.status)}
                                                    </div>
                                                    {/* Amount */}
                                                    <p className="font-medium text-sm md:text-base">
                                                        {formatCurrency(payment.amount, payment.currency)}
                                                    </p>
                                                </div>
                                                
                                                {/* Right Side: Date + Chevron + Menu */}
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <div className="text-right hidden sm:block">
                                                        <p className="text-sm text-muted-foreground">
                                                            {formatDateShort(payment.paid_at || payment.created_at)}
                                                        </p>
                                                        {payment.card_last4 && (
                                                            <p className="text-xs text-muted-foreground">
                                                                {payment.card_brand && <span className="capitalize">{payment.card_brand}</span>} •••• {payment.card_last4}
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
                                                            handleToggleExpand(payment.id, e);
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
                                                            {payment.invoice_number && (
                                                                <DropdownMenuItem 
                                                                    onClick={() => navigate(`/invoices/${payment.invoice_id}`)}
                                                                    className="group/menu"
                                                                >
                                                                    <Receipt className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                                                                    View Invoice
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem className="group/menu">
                                                                <Download className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                                                                Download Receipt
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                            
                                            {/* Middle Row: Contact Name + Status Badge + Payment Method + Invoice # (horizontally distributed) */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                                {/* Contact Name */}
                                                <span className="text-sm text-muted-foreground font-medium">{getContactName(payment)}</span>
                                                
                                                {/* Status Badge */}
                                                <Badge className={`text-xs pointer-events-none cursor-default ${getStatusBadge(payment.status)}`}>
                                                    {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                                                </Badge>
                                                
                                                {/* Payment Method */}
                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                    {PAYMENT_METHOD_ICONS[payment.payment_method]}
                                                    {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}
                                                </span>
                                                
                                                {/* Invoice Number */}
                                                {payment.invoice_number && (
                                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                        <Receipt className="h-3 w-3" />
                                                        {payment.invoice_number}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* Footer Row: Date (on mobile) + Card info */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                <span className="sm:hidden">
                                                    {formatDateShort(payment.paid_at || payment.created_at)}
                                                </span>
                                                {payment.card_last4 && (
                                                    <span>
                                                        {payment.card_brand && <span className="capitalize">{payment.card_brand}</span>} •••• {payment.card_last4}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded Payment Details */}
                                        {isExpanded && (
                                            <div className="bg-muted/30 border-t px-6 py-6">
                                                <div className="max-w-4xl mx-auto">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        {/* Payment Details Card */}
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border p-5 shadow-sm">
                                                            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4 flex items-center gap-2">
                                                                <DollarSign className="h-4 w-4" />
                                                                Payment Details
                                                            </h3>
                                                            
                                                            <div className="space-y-3">
                                                                <div className="flex justify-between items-center py-2 border-b">
                                                                    <span className="text-sm text-muted-foreground">Amount</span>
                                                                    <span className="text-lg font-bold text-green-600">
                                                                        {formatCurrency(payment.amount, payment.currency)}
                                                                    </span>
                                                                </div>
                                                                
                                                                <div className="flex justify-between items-center py-2 border-b">
                                                                    <span className="text-sm text-muted-foreground">Status</span>
                                                                    <Badge className={getStatusBadge(payment.status)}>
                                                                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                                                                    </Badge>
                                                                </div>
                                                                
                                                                <div className="flex justify-between items-center py-2 border-b">
                                                                    <span className="text-sm text-muted-foreground">Payment Method</span>
                                                                    <span className="text-sm font-medium flex items-center gap-2">
                                                                        {PAYMENT_METHOD_ICONS[payment.payment_method]}
                                                                        {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}
                                                                    </span>
                                                                </div>
                                                                
                                                                {payment.card_last4 && (
                                                                    <div className="flex justify-between items-center py-2 border-b">
                                                                        <span className="text-sm text-muted-foreground">Card</span>
                                                                        <span className="text-sm font-medium">
                                                                            {payment.card_brand && <span className="capitalize">{payment.card_brand}</span>} •••• {payment.card_last4}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                
                                                                <div className="flex justify-between items-center py-2 border-b">
                                                                    <span className="text-sm text-muted-foreground">Date</span>
                                                                    <span className="text-sm font-medium">
                                                                        {formatDate(payment.paid_at || payment.created_at)}
                                                                    </span>
                                                                </div>

                                                                {payment.stripe_payment_intent_id && (
                                                                    <div className="flex justify-between items-center py-2">
                                                                        <span className="text-sm text-muted-foreground">Transaction ID</span>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-auto p-0 text-sm font-mono text-blue-600"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleCopyToClipboard(payment.stripe_payment_intent_id!, 'Transaction ID');
                                                                            }}
                                                                        >
                                                                            {payment.stripe_payment_intent_id.slice(0, 20)}...
                                                                            <Copy className="h-3 w-3 ml-1" />
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Invoice & Notes Card */}
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border p-5 shadow-sm">
                                                            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4 flex items-center gap-2">
                                                                <Receipt className="h-4 w-4" />
                                                                Invoice & Notes
                                                            </h3>
                                                            
                                                            <div className="space-y-3">
                                                                {payment.invoice_id && payment.invoice_number && (
                                                                    <div className="flex justify-between items-center py-2 border-b">
                                                                        <span className="text-sm text-muted-foreground">Invoice</span>
                                                                        <Button
                                                                            variant="link"
                                                                            size="sm"
                                                                            className="text-sm font-medium text-blue-600 h-auto p-0"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                navigate(`/invoices`);
                                                                            }}
                                                                        >
                                                                            {payment.invoice_number}
                                                                            <ExternalLink className="h-3 w-3 ml-1" />
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                                
                                                                <div className="flex justify-between items-center py-2 border-b">
                                                                    <span className="text-sm text-muted-foreground">Customer</span>
                                                                    <span className="text-sm font-medium">{getContactName(payment)}</span>
                                                                </div>

                                                                {payment.notes && (
                                                                    <div className="py-2">
                                                                        <span className="text-sm text-muted-foreground block mb-1">Notes</span>
                                                                        <p className="text-sm bg-muted/50 p-2 rounded">{payment.notes}</p>
                                                                    </div>
                                                                )}

                                                                {payment.description && (
                                                                    <div className="py-2">
                                                                        <span className="text-sm text-muted-foreground block mb-1">Description</span>
                                                                        <p className="text-sm bg-muted/50 p-2 rounded">{payment.description}</p>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Action Buttons */}
                                                            <div className="mt-6 pt-4 border-t space-y-2">
                                                                {payment.invoice_id && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="w-full justify-start"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            navigate('/invoices');
                                                                        }}
                                                                    >
                                                                        <Receipt className="h-4 w-4 mr-2" />View Invoice
                                                                    </Button>
                                                                )}
                                                                {payment.receipt_url && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="w-full justify-start"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            window.open(payment.receipt_url, '_blank');
                                                                        }}
                                                                    >
                                                                        <Download className="h-4 w-4 mr-2" />Download Receipt
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
                </Card>
            </PageSurface>
            </PageContainer>

        {/* Route-aware onboarding modal */}
        {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={handleOnboardingClose}
                onComplete={handleOnboardingComplete}
                onDismiss={handleOnboardingDismiss}
                content={ONBOARDING_CONTENT[onboardingFeatureKey]}
            />
        )}
        </>
    );
}

export default PaymentsPage;
