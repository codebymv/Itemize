import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import {
    Plus,
    CreditCard,
    DollarSign,
    Clock,
    Banknote,
    Building,
    Receipt,
    FileText,
    ChevronDown,
    ExternalLink,
    Download,
    Copy,
    MoreVertical,
    RotateCcw,
    Loader2,
    TrendingUp,
    PieChart,
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
import { useOrganization } from '@/hooks/useOrganization';
import {
    createInvoicePayment,
    getInvoicePaymentLedger,
    PAYMENT_PERIOD_LABELS,
    PAYMENT_PERIODS,
    refundInvoicePayment,
    type InvoicePayment,
    type PaymentOverview,
    type PaymentOverviewCurrency,
    type PaymentPeriod,
    type RevenueFlow,
} from '@/services/invoicePaymentsApi';
import { PageLayout } from '@/components/layout/PageLayout';
import {
    HeaderAction,
    HeaderCombinedQuery,
    HeaderFilters,
    HeaderSearch,
} from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { StatCard } from '@/components/StatCard';
import { ResponsiveMoneyValue } from '@/components/ui/responsive-value';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { FramedSection } from '@/components/ui/framed-section';
import { RevenueFlowChart, RevenueFlowSeriesControls } from '@/components/payments/RevenueFlowChart';
import { RevenueFlowSizeControls } from '@/components/payments/RevenueFlowSizeControls';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { CreatePaymentModal } from './components/CreatePaymentModal';
import type { PaymentData } from './components/CreatePaymentModal';
import { getPaymentStatusVisual } from './constants/paymentConstants';
import { ExpandedRowActionLabel, ExpandedRowActions } from '@/components/ui/expanded-row';
import { useRevenueFlowPreferences } from '@/hooks/useRevenueFlowPreferences';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';

type Payment = InvoicePayment;

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

const EMPTY_PAYMENT_OVERVIEW: PaymentOverviewCurrency = {
    currency: 'USD',
    failedAmount: 0,
    failedCount: 0,
    grossAmount: 0,
    grossCount: 0,
    inProgressAmount: 0,
    inProgressCount: 0,
    refundedAmount: 0,
    refundedCount: 0,
    netAmount: 0,
};

export function PaymentsPage() {
    const navigate = useNavigate();
    const { currentUser } = useAuthState();
    const [searchParams, setSearchParams] = useSearchParams();
    const { toast } = useToast();
    // Route-aware onboarding (will show 'invoices' onboarding for all Sales & Payments routes)
    const {
        showModal: showOnboarding,
        handleComplete: handleOnboardingComplete,
        handleDismiss: handleOnboardingDismiss,
        handleClose: handleOnboardingClose,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const [payments, setPayments] = useState<Payment[]>([]);
    const [overview, setOverview] = useState<PaymentOverview | null>(null);
    const [revenueFlow, setRevenueFlow] = useState<RevenueFlow | null>(null);
    const [page, setPage] = useState(1);
    const [pageInfo, setPageInfo] = useState({
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
    });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const { organizationId, organization, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const revenueFlowPreferences = useRevenueFlowPreferences({
        organizationId,
        userId: currentUser?.uid,
        context: 'payments',
    });
    const canRefund = organization?.role === 'owner' || organization?.role === 'admin';
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [methodFilter, setMethodFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const periodParam = searchParams.get('period');
    const period: PaymentPeriod = PAYMENT_PERIODS.includes(periodParam as PaymentPeriod)
        ? periodParam as PaymentPeriod
        : '30days';
    
    // Payment creation state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const {
        pending: creating,
        run: runCreatePayment,
        dismissIfIdle: dismissCreateIfIdle,
    } = useSingleFlightAction();
    const [refundRequest, setRefundRequest] = useState<{ payment: Payment; key: string } | null>(null);
    const [refundAmount, setRefundAmount] = useState('');
    const [refundReason, setRefundReason] = useState('');
    const {
        pending: refunding,
        run: runRefund,
        dismissIfIdle: dismissRefundIfIdle,
    } = useSingleFlightAction();

    // Expanded payment state
    const [expandedId, setExpandedId] = useState<number | null>(null);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setDebouncedSearch(searchQuery.trim());
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timeout);
    }, [searchQuery]);

    const handlePeriodChange = (nextPeriod: PaymentPeriod) => {
        const next = new URLSearchParams(searchParams);
        next.set('period', nextPeriod);
        setSearchParams(next, { replace: true });
        setPage(1);
        setExpandedId(null);
    };

    const handleMethodFilterChange = (value: string) => {
        setMethodFilter(value);
        setPage(1);
        setExpandedId(null);
    };

    const handleStatusFilterChange = (value: string) => {
        setStatusFilter(value);
        setPage(1);
        setExpandedId(null);
    };

    const fetchPayments = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const data = await getInvoicePaymentLedger(organizationId, {
                period,
                page,
                pageSize: 25,
                status: statusFilter !== 'all' ? statusFilter : undefined,
                payment_method: methodFilter !== 'all' ? methodFilter : undefined,
                search: debouncedSearch || undefined,
            });
            setPayments(data.payments.nodes);
            setPageInfo(data.payments.pageInfo);
            setOverview(data.overview);
            setRevenueFlow(data.revenueFlow);
        } catch (error) {
            setPayments([]);
            setOverview(null);
            setRevenueFlow(null);
            setLoadError('Payments could not be loaded. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, methodFilter, organizationId, page, period, statusFilter]);

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

    const getContactName = (payment: Payment) => {
        if (payment.contact_name) return payment.contact_name;
        if (payment.first_name || payment.last_name) {
            return `${payment.first_name || ''} ${payment.last_name || ''}`.trim();
        }
        return 'Unknown';
    };

    const getPaymentIdentifier = (payment: Payment) => `Payment #${payment.id}`;

    const getWholeDaysSince = (dateString: string) => Math.max(
        0,
        Math.floor((Date.now() - new Date(dateString).getTime()) / 86_400_000),
    );

    const getPaymentAge = (payment: Payment) => {
        if (payment.refunded_amount > 0 && payment.refunded_at) {
            return {
                label: `Refunded ${getWholeDaysSince(payment.refunded_at)}d ago`,
                className: 'text-muted-foreground',
            };
        }
        const days = getWholeDaysSince(
            payment.paid_at || payment.created_at,
        );

        switch (payment.status) {
            case 'succeeded':
                return { label: `Received ${days}d ago`, className: 'text-green-600 dark:text-green-400' };
            case 'pending':
                return { label: `Pending ${days}d`, className: 'text-orange-600 dark:text-orange-400' };
            case 'processing':
                return { label: `Processing ${days}d`, className: 'text-orange-600 dark:text-orange-400' };
            case 'failed':
                return { label: `Failed ${days}d ago`, className: 'text-red-600 dark:text-red-400' };
            case 'refunded':
                return { label: `Refunded ${days}d ago`, className: 'text-muted-foreground' };
            case 'cancelled':
                return { label: `Cancelled ${days}d ago`, className: 'text-red-600 dark:text-red-400' };
            default:
                return null;
        }
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

    const overviewCurrencies = useMemo(
        () => overview?.currencies.length ? overview.currencies : [EMPTY_PAYMENT_OVERVIEW],
        [overview],
    );

    const handleCreatePayment = async (paymentData: PaymentData) => {
        if (!organizationId) return;
        
        await runCreatePayment(async () => {
            try {
                await createInvoicePayment(organizationId, {
                    ...paymentData,
                    status: 'succeeded',
                });
                toast({ title: 'Payment recorded' });
                setShowCreateModal(false);
                void fetchPayments();
            } catch (error) {
                toast({ title: 'Error', description: 'Failed to record payment', variant: 'destructive' });
            }
        });
    };

    const openRefund = (payment: Payment) => {
        setRefundAmount(payment.refundable_amount.toFixed(2));
        setRefundReason('');
        setRefundRequest({ payment, key: crypto.randomUUID() });
    };

    const handleRefund = async () => {
        if (!organizationId || !refundRequest) return;
        const amount = Number(refundAmount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > refundRequest.payment.refundable_amount) {
            toast({
                title: 'Invalid refund amount',
                description: `Enter an amount up to ${formatCurrency(refundRequest.payment.refundable_amount, refundRequest.payment.currency)}.`,
                variant: 'destructive',
            });
            return;
        }
        await runRefund(async () => {
            try {
                const result = await refundInvoicePayment(organizationId, refundRequest.payment.id, {
                    amount,
                    reason: refundReason,
                    idempotencyKey: refundRequest.key,
                });
                toast({
                    title: result.refundStatus === 'succeeded'
                        ? amount === refundRequest.payment.refundable_amount
                            ? 'Payment refunded'
                            : 'Partial refund completed'
                        : 'Refund submitted',
                    description: result.refundStatus === 'succeeded'
                        ? `${formatCurrency(amount, refundRequest.payment.currency)} was sent back through Stripe.`
                        : 'Refund processing. Itemize updates after Stripe confirms.',
                });
                setRefundRequest(null);
                await fetchPayments();
            } catch (error) {
                toast({
                    title: 'Refund failed',
                    description: error instanceof Error ? error.message : 'Stripe could not complete this refund.',
                    variant: 'destructive',
                });
            }
        });
    };

    const headerFilterCount = Number(methodFilter !== 'all') + Number(statusFilter !== 'all');
    const headerQueryCount = headerFilterCount + Number(searchQuery.trim().length > 0);
    const periodSelect = (compact = false) => (
        <Select value={period} onValueChange={(value) => handlePeriodChange(value as PaymentPeriod)}>
            <SelectTrigger className={compact ? 'h-11 w-full bg-muted/20' : 'h-11 w-[9.5rem] bg-muted/20'}>
                <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
                {PAYMENT_PERIODS.map(value => (
                    <SelectItem key={value} value={value}>{PAYMENT_PERIOD_LABELS[value]}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
    const paymentFilters = (compact = false) => (
        <>
            <Select value={methodFilter} onValueChange={handleMethodFilterChange}>
                <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[8.5rem] bg-muted/20'}>
                    <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All methods</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[8.5rem] bg-muted/20'}>
                    <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="succeeded">Succeeded</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
            </Select>
        </>
    );

    if (initError) {
        return (
            <PageLayout
                title="PAYMENTS"
                icon={<DollarSign className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
            >
                <OrganizationErrorState title="Unable to load payments" icon={DollarSign} />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="PAYMENTS"
            icon={<DollarSign className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
            headerTools={{
                search: (
                    <HeaderSearch
                        label="Search payments"
                        placeholder="Search payments..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                    />
                ),
                filters: (
                    <div className="flex items-center gap-2">
                        <HeaderFilters
                            label="Select payment period"
                            compactChildren={periodSelect(true)}
                            preferExpanded
                        >
                            {periodSelect()}
                        </HeaderFilters>
                        <HeaderFilters
                            label="Filter payments"
                            activeCount={headerFilterCount}
                            compactChildren={paymentFilters(true)}
                        >
                            {paymentFilters()}
                        </HeaderFilters>
                    </div>
                ),
                combinedQuery: (
                    <HeaderCombinedQuery
                        label="Search and filter payments"
                        placeholder="Search payments..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        activeCount={headerQueryCount}
                    >
                        {periodSelect(true)}
                        {paymentFilters(true)}
                    </HeaderCombinedQuery>
                ),
                primaryAction: (
                    <HeaderAction
                        label="Add payment"
                        icon={<Plus className="h-4 w-4" />}
                        onClick={() => setShowCreateModal(true)}
                    />
                ),
            }}
        >
            {!loadError && overviewCurrencies.length > 0 ? (
              <FramedSection title="Overview" icon={PieChart} className="mb-6">
              <div className="space-y-4">
              {overviewCurrencies.map((currencyOverview) => {
                const netIsNegative = currencyOverview.netAmount < 0;
                return (
                <section key={currencyOverview.currency} className="space-y-2">
                {overviewCurrencies.length > 1 && (
                    <div className="px-1 text-xs font-medium text-muted-foreground">
                        {currencyOverview.currency}
                    </div>
                )}
                <ResponsiveCardRail
                    label={`Payment summary in ${currencyOverview.currency} for ${PAYMENT_PERIOD_LABELS[period]}`}
                    desktopColumns="md:grid-cols-4"
                    className="responsive-stat-summary mb-0"
                >
                    <StatCard
                        title="Failed"
                        badgeText="Failed"
                        value={<ResponsiveMoneyValue amount={currencyOverview.failedAmount} currency={currencyOverview.currency} locale="en-US" />}
                        icon={getPaymentStatusVisual('failed').icon}
                        description={`${currencyOverview.failedCount} payment${currencyOverview.failedCount !== 1 ? 's' : ''}`}
                        colorTheme={getPaymentStatusVisual('failed').theme}
                        isLoading={loading}
                    />
                    <StatCard
                        title="Gross volume"
                        badgeText="Gross volume"
                        value={<ResponsiveMoneyValue amount={currencyOverview.grossAmount} currency={currencyOverview.currency} locale="en-US" />}
                        icon={CreditCard}
                        description={`${currencyOverview.grossCount} successful`}
                        colorTheme="blue"
                        isLoading={loading}
                    />
                    <StatCard
                        title="In progress"
                        badgeText="In progress"
                        value={<ResponsiveMoneyValue amount={currencyOverview.inProgressAmount} currency={currencyOverview.currency} locale="en-US" />}
                        icon={Clock}
                        description={`${currencyOverview.inProgressCount} payment${currencyOverview.inProgressCount !== 1 ? 's' : ''}`}
                        colorTheme="orange"
                        isLoading={loading}
                    />
                    <StatCard
                        title="Net received"
                        badgeText="Net received"
                        value={<ResponsiveMoneyValue amount={currencyOverview.netAmount} currency={currencyOverview.currency} locale="en-US" />}
                        icon={netIsNegative
                            ? getPaymentStatusVisual('failed').icon
                            : getPaymentStatusVisual('succeeded').icon}
                        description={currencyOverview.refundedAmount > 0
                            ? `${formatCurrency(currencyOverview.refundedAmount, currencyOverview.currency)} refunded`
                            : 'After refunds'}
                        colorTheme={netIsNegative
                            ? getPaymentStatusVisual('failed').theme
                            : getPaymentStatusVisual('succeeded').theme}
                        isLoading={loading}
                    />
                </ResponsiveCardRail>
                </section>
                );
              })}
              </div>
              </FramedSection>
            ) : null}

            {!loadError && (
                <Card className="revenue-flow-card">
                    <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            Revenue flow
                        </CardTitle>
                        <RevenueFlowSeriesControls
                            visibleSeries={revenueFlowPreferences.visibleSeries}
                            onVisibleSeriesChange={revenueFlowPreferences.setVisibleSeries}
                            variant="direct"
                            className="revenue-flow-series-header min-w-0 shrink-0"
                        />
                        <RevenueFlowSizeControls
                            size={revenueFlowPreferences.size}
                            onSizeChange={revenueFlowPreferences.setSize}
                        />
                    </CardHeader>
                    <CardContent surface="inset" className="p-0">
                        <RevenueFlowChart
                            data={revenueFlow}
                            isLoading={loading}
                            context="payments"
                            size={revenueFlowPreferences.size}
                            visibleSeries={revenueFlowPreferences.visibleSeries}
                            onVisibleSeriesChange={revenueFlowPreferences.setVisibleSeries}
                        />
                    </CardContent>
                </Card>
            )}

            {/* Payments List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : loadError ? (
                        <ErrorState
                            title="Could not load payments"
                            description={loadError}
                            onAction={() => void fetchPayments()}
                            className="p-12"
                        />
                    ) : payments.length === 0 ? (
                        <EmptyState
                            icon={DollarSign}
                            kind={headerQueryCount > 0 ? 'results' : 'collection'}
                            title={headerQueryCount > 0
                                ? 'No matching payments'
                                : period === 'all' ? 'No payments yet' : 'No payments in this period'}
                            description={headerQueryCount > 0
                                ? undefined
                                : period === 'all'
                                    ? 'Record a payment or receive one through an invoice.'
                                    : `There was no payment activity in ${PAYMENT_PERIOD_LABELS[period].toLowerCase()}.`}
                            actionLabel={headerQueryCount > 0 ? 'Clear filters' : 'Add payment'}
                            onAction={headerQueryCount > 0
                                ? () => { setSearchQuery(''); setMethodFilter('all'); setStatusFilter('all'); }
                                : () => setShowCreateModal(true)}
                            className="p-12"
                        />
                    ) : (
                        <div className="divide-y">
                            {payments.map((payment) => {
                                const isExpanded = expandedId === payment.id;
                                const statusVisual = getPaymentStatusVisual(payment.status);
                                const StatusIcon = statusVisual.icon;
                                const paymentAge = getPaymentAge(payment);
                                
                                return (
                                    <div key={payment.id}>
                                        {/* Payment Row - Aligned with VaultCard Pattern */}
                                        <div
                                            className="p-4 interaction-row cursor-pointer group"
                                            onClick={(e) => handleToggleExpand(payment.id, e)}
                                        >
                                            {/* Header Row: Icon + Amount on left, Date + Chevron + Menu on right */}
                                            <div className="flex items-center justify-between">
                                                {/* Left Side: Status Icon + Payment Number */}
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    {/* Status Icon */}
                                                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${statusVisual.iconBackgroundClass}`}>
                                                        <StatusIcon className={`h-4 w-4 ${statusVisual.iconClass}`} aria-hidden="true" />
                                                    </div>
                                                    <p className="truncate font-medium text-sm md:text-base">{getPaymentIdentifier(payment)}</p>
                                                </div>
                                                
                                                {/* Right Side: Date + Chevron + Menu */}
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <div className="hidden lg:block">
                                                        <Badge className={`pointer-events-none cursor-default text-xs ${statusVisual.badgeClass}`}>
                                                            {statusVisual.label}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-right hidden sm:block">
                                                        <p className="font-semibold text-sm md:text-base">
                                                            {formatCurrency(payment.amount, payment.currency)}
                                                        </p>
                                                        {payment.refunded_amount > 0 && (
                                                            <p className="text-xs text-muted-foreground">
                                                                -{formatCurrency(payment.refunded_amount, payment.currency)} refunded
                                                            </p>
                                                        )}
                                                    </div>
                                                    {/* Chevron - Collapsible Trigger */}
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-8 w-8 p-0"
                                                        aria-label={isExpanded ? 'Collapse payment details' : 'Expand payment details'}
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
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Payment actions">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                            {payment.invoice_id && payment.invoice_number && (
                                                                <DropdownMenuItem 
                                                                    onClick={() => navigate(`/invoices/${payment.invoice_id}`)}
                                                                    className="group/menu"
                                                                >
                                                                    <Receipt className="h-4 w-4 mr-2" />
                                                                    View Invoice
                                                                </DropdownMenuItem>
                                                            )}
                                                            {payment.receipt_url && (
                                                                <DropdownMenuItem
                                                                    className="group/menu"
                                                                    onClick={() => window.open(payment.receipt_url, '_blank', 'noopener,noreferrer')}
                                                                >
                                                                    <Download className="h-4 w-4 mr-2" />
                                                                    Download Receipt
                                                                </DropdownMenuItem>
                                                            )}
                                                            {canRefund && payment.payment_method === 'stripe' && payment.refundable_amount > 0 && (
                                                                <DropdownMenuItem
                                                                    className="group/menu"
                                                                    onClick={() => openRefund(payment)}
                                                                >
                                                                    <RotateCcw className="h-4 w-4 mr-2" />
                                                                    Refund payment
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                            
                                            {/* Middle Row: Contact Name + Status Badge + Payment Method + Invoice # (horizontally distributed) */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                                {/* Contact Name */}
                                                <span className="text-sm text-muted-foreground font-medium">{getContactName(payment)}</span>
                                                
                                                {/* Status Badge */}
                                                <span className="lg:hidden">
                                                    <Badge className={`text-xs pointer-events-none cursor-default ${statusVisual.badgeClass}`}>
                                                        {statusVisual.label}
                                                    </Badge>
                                                </span>
                                                
                                                {/* Payment Method */}
                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                    {PAYMENT_METHOD_ICONS[payment.payment_method]}
                                                    {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}
                                                </span>
                                                
                                                {/* Invoice Number */}
                                                {payment.invoice_number && (
                                                    <Button
                                                        type="button"
                                                        variant="link"
                                                        className="h-auto gap-1 p-0 text-xs font-normal"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            navigate(`/invoices/${payment.invoice_id}`);
                                                        }}
                                                    >
                                                        <Receipt className="h-3 w-3" />
                                                        {payment.invoice_number}
                                                    </Button>
                                                )}
                                                <span className="text-xs text-muted-foreground">
                                                    {payment.paid_at ? 'Paid' : 'Created'} {formatDateShort(payment.paid_at || payment.created_at)}
                                                </span>
                                            </div>
                                            
                                            {/* Footer Row: Date (on mobile) + Card info */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                <span className="font-semibold md:hidden">{formatCurrency(payment.amount, payment.currency)}</span>
                                                {paymentAge && (
                                                    <span className={`font-medium ${paymentAge.className}`}>{paymentAge.label}</span>
                                                )}
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
                                                {(payment.invoice_id || payment.receipt_url) && (
                                                    <ExpandedRowActions>
                                                        {payment.invoice_id && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigate(`/invoices/${payment.invoice_id}`);
                                                                }}
                                                            >
                                                                <Receipt className="h-4 w-4 mr-2" />
                                                                <ExpandedRowActionLabel full="View Invoice" compact="Invoice" />
                                                            </Button>
                                                        )}
                                                        {payment.receipt_url && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    window.open(payment.receipt_url, '_blank', 'noopener,noreferrer');
                                                                }}
                                                            >
                                                                <Download className="h-4 w-4 mr-2" />
                                                                <ExpandedRowActionLabel full="Download Receipt" compact="Download" />
                                                            </Button>
                                                        )}
                                                    </ExpandedRowActions>
                                                )}
                                                <div className="max-w-3xl mx-auto">
                                                    <div className="grid grid-cols-1 overflow-hidden rounded-lg border bg-card md:grid-cols-2">
                                                        {/* Payment Details Card */}
                                                        <div className="p-5 md:border-r">
                                                            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4 flex items-center gap-2">
                                                                <DollarSign className="h-4 w-4" />
                                                                Payment Details
                                                            </h3>
                                                            
                                                            <div className="space-y-3">
                                                                <div className="flex justify-between items-center py-2 border-b">
                                                                    <span className="text-sm text-muted-foreground">Amount</span>
                                                                    <span className="text-lg font-bold">
                                                                        {formatCurrency(payment.amount, payment.currency)}
                                                                    </span>
                                                                </div>
                                                                {payment.refunded_amount > 0 && (
                                                                    <div className="flex justify-between items-center py-2 border-b">
                                                                        <span className="text-sm text-muted-foreground">Refunded</span>
                                                                        <span className="text-sm font-semibold text-muted-foreground">
                                                                            {formatCurrency(payment.refunded_amount, payment.currency)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                
                                                                <div className="flex justify-between items-center py-2 border-b">
                                                                    <span className="text-sm text-muted-foreground">Status</span>
                                                                    <Badge className={statusVisual.badgeClass}>
                                                                        {statusVisual.label}
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
                                                        <div className="border-t p-5 md:border-t-0">
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
                                                                                navigate(`/invoices/${payment.invoice_id}`);
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

            {!loading && !loadError && pageInfo.totalPages > 1 && (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {((pageInfo.page - 1) * pageInfo.pageSize) + 1} to{' '}
                        {Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total)} of{' '}
                        {pageInfo.total} payments
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setPage(current => Math.max(1, current - 1));
                                setExpandedId(null);
                            }}
                            disabled={!pageInfo.hasPreviousPage}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setPage(current => current + 1);
                                setExpandedId(null);
                            }}
                            disabled={!pageInfo.hasNextPage}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={handleOnboardingClose}
                onComplete={handleOnboardingComplete}
                onDismiss={handleOnboardingDismiss}
                content={ONBOARDING_CONTENT[onboardingFeatureKey]}
            />
        )}
        
        <CreatePaymentModal
            open={showCreateModal}
            onOpenChange={(nextOpen) => {
                if (nextOpen) setShowCreateModal(true);
                else dismissCreateIfIdle(() => setShowCreateModal(false));
            }}
            onConfirm={handleCreatePayment}
            creating={creating}
        />
        <Dialog
            open={refundRequest !== null}
            onOpenChange={(open) => {
                if (!open) dismissRefundIfIdle(() => setRefundRequest(null));
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Refund payment</DialogTitle>
                    <DialogDescription>
                        Stripe refunds the original payment method. Cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                {refundRequest && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="refund-amount" className="text-sm font-medium">Amount</label>
                            <Input
                                id="refund-amount"
                                type="number"
                                min="0.01"
                                max={refundRequest.payment.refundable_amount}
                                step="0.01"
                                value={refundAmount}
                                onChange={(event) => setRefundAmount(event.target.value)}
                                disabled={refunding}
                            />
                            <p className="text-xs text-muted-foreground">
                                Up to {formatCurrency(refundRequest.payment.refundable_amount, refundRequest.payment.currency)} is available.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="refund-reason" className="text-sm font-medium">Reason <span className="text-muted-foreground">(optional)</span></label>
                            <textarea
                                id="refund-reason"
                                className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                maxLength={500}
                                value={refundReason}
                                onChange={(event) => setRefundReason(event.target.value)}
                                placeholder="Customer request, duplicate payment, or another note"
                                disabled={refunding}
                            />
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => dismissRefundIfIdle(() => setRefundRequest(null))} disabled={refunding}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleRefund()} disabled={refunding} aria-busy={refunding || undefined}>
                        {refunding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Refund {refundAmount && refundRequest
                            ? formatCurrency(Number(refundAmount), refundRequest.payment.currency)
                            : 'payment'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </PageLayout>
    );
}

export default PaymentsPage;
