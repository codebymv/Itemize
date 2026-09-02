import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Plus,
    RefreshCw,
    MoreHorizontal,
    MoreVertical,
    Trash2,
    Edit,
    Pause,
    Play,
    Calendar,
    History,
    ChevronDown,
    ChevronRight,
    Loader2,
    CalendarDays,
    ExternalLink,
    FileText,
    Receipt,
    PieChart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
} from '@/components/ui/dialog';
import { ModalBody, ModalContent, ModalFooter, ModalHeader } from '@/components/ui/modal';
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
import { Separator } from '@/components/ui/separator';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { useToast } from '@/hooks/use-toast';
import { useStableMutationKey } from '@/hooks/useStableMutationKey';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
import {
    createRecurringInvoice,
    deleteRecurringInvoice,
    generateRecurringInvoiceNow,
    getRecurringInvoice,
    getRecurringInvoicePage,
    pauseRecurringInvoice,
    RecurringFrequency,
    RecurringInvoice,
    RecurringStatus,
    resumeRecurringInvoice,
} from '@/services/recurringInvoicesApi';
import { recurringInvoiceQueryKeys } from '@/services/recurringInvoiceQueryKeys';
import { getRecurringInvoicePreviewBootstrapViaGraphql } from '@/services/recurringInvoicePreviewGraphql';
import { useOrganization } from '@/hooks/useOrganization';
import { InvoicePreviewCard } from './components/InvoicePreviewCard';
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
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { FramedSection } from '@/components/ui/framed-section';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { cn } from '@/lib/utils';
import { InvoiceViewSelect, type InvoiceView } from './components/InvoiceViewSelect';
import { getRecurringStatusVisual } from './constants/recurringConstants';
import { ExpandedRowActionLabel, ExpandedRowActions } from '@/components/ui/expanded-row';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { ContactCatalogPicker } from '@/components/ContactCatalogPicker';
import type { Contact } from '@/types';

const RECURRING_FREQUENCIES: RecurringFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
const PAGE_SIZE = 20;
const EMPTY_RECURRING_INVOICES: RecurringInvoice[] = [];

const isRecurringFrequency = (value: string): value is RecurringFrequency =>
    RECURRING_FREQUENCIES.includes(value as RecurringFrequency);

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

const getApiErrorMessage = (error: unknown, fallback: string): string => {
    if (error && typeof error === 'object' && 'response' in error) {
        const response = (error as { response?: { data?: { error?: unknown } } }).response;
        if (typeof response?.data?.error === 'string') {
            return response.data.error;
        }
    }
    return fallback;
};

export function RecurringInvoicesPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const { toast } = useToast();
    // Route-aware onboarding (will show 'invoices' onboarding for all Sales & Payments routes)
    const {
        showModal: showOnboarding,
        handleComplete: handleOnboardingComplete,
        handleDismiss: handleOnboardingDismiss,
        handleClose: handleOnboardingClose,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [activeTab, setActiveTab] = useState<string>('all');
    const [page, setPage] = useState(1);

    // Expanded recurring state
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const autoExpandedScheduleRef = useRef<number | null>(null);
    
    // Delete confirmation dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [recurringToDelete, setRecurringToDelete] = useState<RecurringInvoice | null>(null);

    // Generate invoice state
    const [generatingInvoice, setGeneratingInvoice] = useState<number | null>(null);
    const {
        begin: beginInvoiceGeneration,
        release: releaseInvoiceGeneration,
        reset: resetInvoiceGeneration,
    } = useStableMutationKey('recurring-invoice-generation');
    const {
        begin: beginRecurringCreate,
        release: releaseRecurringCreate,
        reset: resetRecurringCreate,
    } = useStableMutationKey('recurring-invoice-create');

    // Create dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const { pending: saving, run: runSave, dismissIfIdle } = useSingleFlightAction();

    // Form state
    const [templateName, setTemplateName] = useState('');
    const [contactId, setContactId] = useState<number | undefined>();
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: crypto.randomUUID(), name: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }
    ]);

    useEffect(() => {
        if (!initError) return;
        toast({ title: 'Error', description: initError, variant: 'destructive' });
    }, [initError, toast]);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [searchQuery]);

    useEffect(() => {
        setPage(1);
        setExpandedId(null);
    }, [activeTab, debouncedSearch]);

    const listParams = {
        status: activeTab as RecurringStatus | 'all',
        search: debouncedSearch || undefined,
        page,
        limit: PAGE_SIZE,
    };
    const listQueryKey = recurringInvoiceQueryKeys.page(organizationId, listParams);
    const recurringInvoicesQuery = useQuery({
        queryKey: listQueryKey,
        queryFn: ({ signal }) => getRecurringInvoicePage(listParams, organizationId!, signal),
        enabled: Boolean(organizationId) && !initError,
        staleTime: QUERY_STALE_TIME_MS,
        retry: shouldRetryQuery,
        placeholderData: keepPreviousData,
    });
    const recurringInvoices = recurringInvoicesQuery.data?.recurringInvoices
        ?? EMPTY_RECURRING_INVOICES;
    const pagination = recurringInvoicesQuery.data?.pagination ?? {
        page, limit: PAGE_SIZE, total: 0, totalPages: 0,
    };
    const stats = recurringInvoicesQuery.data?.stats ?? {
        total: 0, active: 0, paused: 0, completed: 0,
    };
    const loading = orgLoading || (
        Boolean(organizationId)
        && recurringInvoicesQuery.isPending
    );
    const loadError = recurringInvoicesQuery.isError
        ? 'Recurring schedules could not be loaded. Please try again.'
        : null;

    useEffect(() => {
        if (!recurringInvoicesQuery.data) return;
        const lastAvailablePage = Math.max(1, pagination.totalPages);
        if (page > lastAvailablePage) setPage(lastAvailablePage);
    }, [page, pagination.totalPages, recurringInvoicesQuery.data]);

    const requestedScheduleValue = Number(searchParams.get('schedule'));
    const requestedScheduleId = Number.isSafeInteger(requestedScheduleValue)
        && requestedScheduleValue > 0
        ? requestedScheduleValue
        : null;
    const requestedScheduleIsLoaded = requestedScheduleId !== null
        && recurringInvoices.some((recurring) => recurring.id === requestedScheduleId);
    const requestedScheduleQuery = useQuery({
        queryKey: ['recurring-invoice-deep-link', organizationId, requestedScheduleId],
        queryFn: ({ signal }) => getRecurringInvoice(
            requestedScheduleId!,
            organizationId!,
            signal,
        ),
        enabled: Boolean(organizationId)
            && requestedScheduleId !== null
            && !requestedScheduleIsLoaded,
        staleTime: QUERY_STALE_TIME_MS,
        retry: shouldRetryQuery,
    });
    const displayedRecurringInvoices = requestedScheduleQuery.data
        && !requestedScheduleIsLoaded
        ? [requestedScheduleQuery.data, ...recurringInvoices]
        : recurringInvoices;

    const previewQuery = useQuery({
        queryKey: ['recurring-invoice-preview', organizationId, expandedId],
        queryFn: ({ signal }) => getRecurringInvoicePreviewBootstrapViaGraphql(
            organizationId!,
            expandedId!,
            signal,
        ),
        enabled: Boolean(organizationId) && expandedId !== null,
        staleTime: QUERY_STALE_TIME_MS,
        retry: shouldRetryQuery,
    });
    const expandedData = previewQuery.data?.recurringInvoice ?? null;
    const previewInvoiceNumber = previewQuery.data?.previewInvoiceNumber ?? 'INV-00001';
    const business = previewQuery.data?.business ?? null;
    const loadingPreview = previewQuery.isPending && previewQuery.fetchStatus !== 'idle';
    const previewError = previewQuery.isError;

    const cacheRecurringInvoice = (updated: RecurringInvoice) => {
        queryClient.setQueryData(
            ['recurring-invoice-preview', organizationId, updated.id],
            (current: typeof previewQuery.data) => current
                ? { ...current, recurringInvoice: updated }
                : current,
        );
        void queryClient.invalidateQueries({
            queryKey: recurringInvoiceQueryKeys.pages(organizationId),
        });
    };

    const openCreateDialog = () => {
        setTemplateName('');
        setContactId(undefined);
        setSelectedContact(null);
        setCustomerName('');
        setFrequency('monthly');
        setStartDate(new Date().toISOString().split('T')[0]);
        setEndDate('');
        setLineItems([{ id: crypto.randomUUID(), name: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
        setDialogOpen(true);
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

        await runSave(async () => {
            const payload = {
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
            };
            const idempotencyKey = beginRecurringCreate(JSON.stringify({
                organizationId,
                recurringInvoice: payload,
            }));
            if (!idempotencyKey) return;
            let created: RecurringInvoice;
            try {
                created = await createRecurringInvoice(
                    payload,
                    idempotencyKey,
                    organizationId,
                );
            } catch {
                releaseRecurringCreate();
                toast({
                    title: 'Error',
                    description: 'Recurring schedule creation could not be confirmed. An unchanged retry is safe.',
                    variant: 'destructive',
                });
                return;
            }
            resetRecurringCreate();
            cacheRecurringInvoice(created);
            toast({ title: 'Created', description: 'Recurring invoice created successfully' });
            setDialogOpen(false);
        });
    };

    const handlePause = async (id: number) => {
        if (!organizationId) return;
        try {
            const updated = await pauseRecurringInvoice(id, organizationId);
            cacheRecurringInvoice(updated);
            toast({ title: 'Paused', description: 'Recurring invoice paused' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to pause', variant: 'destructive' });
        }
    };

    const handleResume = async (id: number) => {
        if (!organizationId) return;
        try {
            const updated = await resumeRecurringInvoice(id, organizationId);
            cacheRecurringInvoice(updated);
            toast({ title: 'Resumed', description: 'Recurring invoice resumed' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to resume', variant: 'destructive' });
        }
    };

    const handleGenerateNow = async (id: number, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!organizationId) return;
        const idempotencyKey = beginInvoiceGeneration(`${organizationId}:${id}`);
        if (!idempotencyKey) return;
        setGeneratingInvoice(id);
        try {
            const result = await generateRecurringInvoiceNow(id, organizationId, idempotencyKey);
            resetInvoiceGeneration();
            toast({ 
                title: 'Invoice Generated', 
                description: `${result.invoice_number} created successfully`
            });
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: recurringInvoiceQueryKeys.pages(organizationId),
                }),
                queryClient.invalidateQueries({
                    queryKey: ['recurring-invoice-preview', organizationId, id],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-snapshot', organizationId],
                }),
            ]);
        } catch (error: unknown) {
            releaseInvoiceGeneration();
            const message = getApiErrorMessage(error, 'Failed to generate invoice');
            toast({ title: 'Error', description: message, variant: 'destructive' });
        } finally {
            setGeneratingInvoice(null);
        }
    };

    const handleDeleteClick = (recurring: RecurringInvoice, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setRecurringToDelete(recurring);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async (): Promise<boolean> => {
        if (!organizationId || !recurringToDelete) return false;
        try {
            await deleteRecurringInvoice(recurringToDelete.id, organizationId);
            await queryClient.invalidateQueries({
                queryKey: recurringInvoiceQueryKeys.pages(organizationId),
            });
            queryClient.removeQueries({
                queryKey: ['recurring-invoice-preview', organizationId, recurringToDelete.id],
            });
            // Collapse if deleted item was expanded
            if (expandedId === recurringToDelete.id) {
                setExpandedId(null);
            }
            return true;
        } catch (error) {
            return false;
        }
    };

    const generatedInvoiceCount = recurringToDelete?.invoices_generated ?? 0;
    const recurringDeleteDescription = recurringToDelete
        ? [
            recurringToDelete.status === 'active'
                ? 'Deleting this active schedule stops all future invoice generation.'
                : 'Deletes this recurring schedule and stops future invoice generation.',
            generatedInvoiceCount > 0
                ? `${generatedInvoiceCount} previously generated invoice${generatedInvoiceCount === 1 ? '' : 's'} will stay unchanged.`
                : null,
            'This action cannot be undone.',
        ].filter(Boolean).join(' ')
        : undefined;

    const handleToggleExpand = (recurringId: number, e: React.MouseEvent) => {
        e.stopPropagation();

        if (expandedId === recurringId) {
            setExpandedId(null);
            return;
        }

        setExpandedId(recurringId);
    };

    useEffect(() => {
        if (requestedScheduleId === null || loading) return;
        const requestedScheduleIsAvailable = requestedScheduleIsLoaded
            || requestedScheduleQuery.data?.id === requestedScheduleId;
        if (!requestedScheduleIsAvailable) {
            return;
        }
        if (autoExpandedScheduleRef.current === requestedScheduleId) return;

        autoExpandedScheduleRef.current = requestedScheduleId;
        setExpandedId(requestedScheduleId);
    }, [
        loading,
        requestedScheduleId,
        requestedScheduleIsLoaded,
        requestedScheduleQuery.data,
    ]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const getContactName = (recurring: RecurringInvoice) => {
        if (recurring.customer_name) return recurring.customer_name;
        if (recurring.contact_first_name || recurring.contact_last_name) {
            return `${recurring.contact_first_name || ''} ${recurring.contact_last_name || ''}`.trim();
        }
        return 'Unknown';
    };

    const total = lineItems.reduce((sum, item) => {
        return sum + (item.quantity * item.unit_price * (1 + item.tax_rate / 100));
    }, 0);

    const headerFilterCount = Number(activeTab !== 'all');
    const headerQueryCount = headerFilterCount + Number(searchQuery.trim().length > 0);
    const handleInvoiceViewChange = (view: InvoiceView) => {
        navigate(view === 'recurring' ? '/invoices/recurring' : '/invoices');
    };
    const statusFilter = (compact = false) => (
        <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[9.5rem] bg-muted/20'}>
                <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
        </Select>
    );

    return (
        <PageLayout
            title="INVOICES"
            icon={<Receipt className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
            headerTools={{
                search: (
                    <HeaderSearch
                        label="Search recurring schedules"
                        placeholder="Search schedules..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                    />
                ),
                filters: (
                    <div className="flex items-center gap-2">
                        <HeaderFilters
                            label="Select invoice view"
                            compactChildren={(
                                <InvoiceViewSelect
                                    value="recurring"
                                    onValueChange={handleInvoiceViewChange}
                                    compact
                                />
                            )}
                            preferExpanded
                        >
                            <InvoiceViewSelect
                                value="recurring"
                                onValueChange={handleInvoiceViewChange}
                            />
                        </HeaderFilters>
                        <HeaderFilters
                            label="Filter recurring schedules by status"
                            activeCount={headerFilterCount}
                            compactChildren={statusFilter(true)}
                            preferExpanded="when-roomy"
                        >
                            {statusFilter()}
                        </HeaderFilters>
                    </div>
                ),
                combinedQuery: (
                    <HeaderCombinedQuery
                        label="Search and filter recurring schedules"
                        placeholder="Search schedules..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        activeCount={headerQueryCount}
                    >
                        <InvoiceViewSelect
                            value="recurring"
                            onValueChange={handleInvoiceViewChange}
                            compact
                        />
                        {statusFilter(true)}
                    </HeaderCombinedQuery>
                ),
                primaryAction: (
                    <HeaderAction
                        label="New schedule"
                        icon={<Plus className="h-4 w-4" />}
                        onClick={openCreateDialog}
                    />
                ),
            }}
        >
                {!loadError && (
                <FramedSection title="Overview" icon={PieChart} className="mb-6">
                  <ResponsiveCardRail
                      label="Recurring invoice summary"
                      desktopColumns="md:grid-cols-3"
                      className="responsive-stat-summary mb-0"
                  >
                <StatCard
                    title="Active"
                    badgeText="Active"
                    value={stats.active}
                    icon={getRecurringStatusVisual('active').icon}
                    description={`${stats.active} schedule${stats.active !== 1 ? 's' : ''}`}
                    colorTheme={getRecurringStatusVisual('active').theme}
                    isLoading={loading}
                />
                <StatCard
                    title="Paused"
                    badgeText="Paused"
                    value={stats.paused}
                    icon={getRecurringStatusVisual('paused').icon}
                    description={`${stats.paused} schedule${stats.paused !== 1 ? 's' : ''}`}
                    colorTheme={getRecurringStatusVisual('paused').theme}
                    isLoading={loading}
                />
                <StatCard
                    title="Completed"
                    badgeText="Completed"
                    value={stats.completed}
                    icon={getRecurringStatusVisual('completed').icon}
                    description={`${stats.completed} schedule${stats.completed !== 1 ? 's' : ''}`}
                    colorTheme={getRecurringStatusVisual('completed').theme}
                    isLoading={loading}
                />
                  </ResponsiveCardRail>
                </FramedSection>
                )}

            {/* Recurring List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : loadError ? (
                        initError ? (
                            <OrganizationErrorState kind="section" title="Unable to load recurring schedules" />
                        ) : (
                            <ErrorState kind="section" title="Unable to load recurring schedules" description={loadError} onAction={() => void recurringInvoicesQuery.refetch()} />
                        )
                    ) : displayedRecurringInvoices.length === 0 ? (
                        <EmptyState
                            icon={RefreshCw}
                            kind={headerQueryCount > 0 ? 'results' : 'collection'}
                            title={headerQueryCount > 0 ? 'No matching schedules' : 'No recurring schedules yet'}
                            description={headerQueryCount > 0 ? undefined : 'Create a schedule to automate repeat billing.'}
                            actionLabel={headerQueryCount > 0 ? 'Clear filters' : 'Create schedule'}
                            onAction={headerQueryCount > 0
                                ? () => { setSearchQuery(''); setActiveTab('all'); }
                                : openCreateDialog}
                            className="p-12"
                        />
                    ) : (
                        <div className="divide-y">
                            {displayedRecurringInvoices.map((recurring) => {
                                const isExpanded = expandedId === recurring.id;
                                const statusVisual = getRecurringStatusVisual(recurring.status);
                                const StatusIcon = statusVisual.icon;
                                return (
                                    <div key={recurring.id}>
                                        {/* Recurring Row - Aligned with VaultCard Pattern */}
                                        <div
                                            className="p-4 interaction-row cursor-pointer group"
                                            onClick={(e) => handleToggleExpand(recurring.id, e)}
                                        >
                                            {/* Header Row: Icon + Template Name on left, Amount + Chevron + Menu on right */}
                                            <div className="flex items-center justify-between">
                                                {/* Left Side: Status Icon + Template Name */}
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    {/* Status Icon */}
                                                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${statusVisual.iconBackgroundClass}`}>
                                                        <StatusIcon className={`h-4 w-4 ${statusVisual.iconClass}`} aria-hidden="true" />
                                                    </div>
                                                    {/* Template Name */}
                                                    <p className="font-medium text-sm md:text-base">{recurring.template_name}</p>
                                                </div>
                                                
                                                {/* Right Side: Amount + Chevron + Menu */}
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <div className="hidden lg:block">
                                                        <Badge className={`pointer-events-none cursor-default text-xs ${statusVisual.badgeClass}`}>
                                                            {statusVisual.label}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-right hidden sm:block">
                                                        <p className="font-semibold text-sm md:text-base">{formatCurrency(recurring.total)}</p>
                                                    </div>
                                                    {/* Chevron - Collapsible Trigger */}
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-8 w-8 p-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleToggleExpand(recurring.id, e);
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
                                                            <DropdownMenuItem className="group/menu">
                                                                <Edit className="h-4 w-4 mr-2" />Edit
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem className="group/menu">
                                                                <History className="h-4 w-4 mr-2" />View History
                                                            </DropdownMenuItem>
                                                            {recurring.status !== 'completed' && (
                                                                <DropdownMenuItem 
                                                                    onClick={(e) => handleGenerateNow(recurring.id, e)}
                                                                    disabled={generatingInvoice === recurring.id}
                                                                    className="group/menu"
                                                                >
                                                                    <FileText className="h-4 w-4 mr-2" />
                                                                    {generatingInvoice === recurring.id ? 'Generating...' : 'Generate Next Invoice'}
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            {recurring.status === 'active' && (
                                                                <DropdownMenuItem onClick={() => handlePause(recurring.id)} className="group/menu">
                                                                    <Pause className="h-4 w-4 mr-2" />Pause
                                                                </DropdownMenuItem>
                                                            )}
                                                            {recurring.status === 'paused' && (
                                                                <DropdownMenuItem onClick={() => handleResume(recurring.id)} className="group/menu">
                                                                    <Play className="h-4 w-4 mr-2" />Resume
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={(e) => handleDeleteClick(recurring, e)}
                                                                className="text-destructive focus:text-destructive"
                                                            >
                                                                <Trash2 className="h-4 w-4 mr-2" />Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                            
                                            {/* Middle Row: Contact Name + Status Badge + Frequency Badge (horizontally distributed) */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                                {/* Contact Name */}
                                                <span className="text-sm text-muted-foreground font-medium">{getContactName(recurring)}</span>
                                                
                                                {/* Status Badge */}
                                                <span className="lg:hidden">
                                                    <Badge className={`text-xs pointer-events-none cursor-default ${statusVisual.badgeClass}`}>
                                                        {statusVisual.label}
                                                    </Badge>
                                                </span>
                                                
                                                {/* Frequency Badge */}
                                                <Badge variant="outline" className="text-xs">
                                                    {FREQUENCY_LABELS[recurring.frequency] || recurring.frequency}
                                                </Badge>
                                            </div>
                                            
                                            {/* Footer Row: Amount (on mobile) + Next run date + Generated count */}
                                            <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                <span className="md:hidden font-semibold">{formatCurrency(recurring.total)}</span>
                                                {recurring.status === 'active' && recurring.next_run_date && (
                                                    <span>Next invoice: {formatDate(recurring.next_run_date)}</span>
                                                )}
                                                <span>
                                                    {recurring.invoices_generated} invoice{recurring.invoices_generated === 1 ? '' : 's'} generated
                                                </span>
                                            </div>
                                        </div>

                                        {/* Expanded Preview */}
                                        {isExpanded && (
                                            <div className="bg-muted/30 border-t px-6 py-6">
                                                <ExpandedRowActions>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Edit className="h-4 w-4 mr-2" />
                                                        <ExpandedRowActionLabel full="Edit Template" compact="Edit" />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <History className="h-4 w-4 mr-2" />
                                                        <ExpandedRowActionLabel full="View History" compact="History" />
                                                    </Button>
                                                    {recurring.status !== 'completed' && (
                                                        <Button
                                                            size="sm"
                                                            className="bg-blue-600 interaction-button--primary text-white"
                                                            onClick={(e) => handleGenerateNow(recurring.id, e)}
                                                            disabled={generatingInvoice === recurring.id}
                                                        >
                                                            <FileText className="h-4 w-4 mr-2" />
                                                            <ExpandedRowActionLabel
                                                                full={generatingInvoice === recurring.id ? 'Generating...' : 'Generate Next Invoice'}
                                                                compact={generatingInvoice === recurring.id ? 'Wait' : 'Generate'}
                                                            />
                                                        </Button>
                                                    )}
                                                    {recurring.status === 'active' && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handlePause(recurring.id);
                                                            }}
                                                        >
                                                            <Pause className="h-4 w-4 mr-2" />
                                                            <ExpandedRowActionLabel full="Pause Schedule" compact="Pause" />
                                                        </Button>
                                                    )}
                                                    {recurring.status === 'paused' && (
                                                        <Button
                                                            size="sm"
                                                            className="bg-blue-600 interaction-button--primary text-white"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleResume(recurring.id);
                                                            }}
                                                        >
                                                            <Play className="h-4 w-4 mr-2" />
                                                            <ExpandedRowActionLabel full="Resume Schedule" compact="Resume" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="border-destructive text-destructive interaction-button--destructive-ghost"
                                                        onClick={(e) => handleDeleteClick(recurring, e)}
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        <ExpandedRowActionLabel full="Delete Template" compact="Delete" />
                                                    </Button>
                                                </ExpandedRowActions>
                                                {loadingPreview ? (
                                                    <div className="flex items-center justify-center py-12">
                                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                                        <span className="ml-2 text-muted-foreground">Loading details...</span>
                                                    </div>
                                                ) : previewError ? (
                                                    <ErrorState
                                                        kind="inline"
                                                        icon={Receipt}
                                                        title="Unable to load schedule details"
                                                        description="The recurring schedule is still available to edit."
                                                        onRetry={() => void previewQuery.refetch()}
                                                    />
                                                ) : expandedData ? (
                                                    <div className="max-w-6xl mx-auto">
                                                        {/* Two Column Layout: Preview + Schedule Details */}
                                                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                                            {/* Left Column - Invoice Preview (takes 2/3 on xl) */}
                                                            <div className="xl:col-span-2">
                                                                <InvoicePreviewCard
                                                                    variant="template"
                                                                    business={business || undefined}
                                                                    documentNumber={previewInvoiceNumber}
                                                                    nextRunDate={expandedData.next_run_date}
                                                                    customerName={expandedData.customer_name}
                                                                    customerEmail={expandedData.customer_email}
                                                                    items={expandedData.items || []}
                                                                    subtotal={expandedData.subtotal || 0}
                                                                    taxAmount={expandedData.tax_amount}
                                                                    discountAmount={expandedData.discount_amount}
                                                                    total={expandedData.total}
                                                                    notes={expandedData.notes}
                                                                    className="max-w-3xl"
                                                                />
                                                            </div>

                                                            {/* Right Column - Schedule Details */}
                                                            <div className="xl:col-span-1">
                                                                <div className="bg-white dark:bg-gray-900 rounded-lg border p-5 shadow-sm sticky top-6">
                                                                    <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4 flex items-center gap-2">
                                                                        <CalendarDays className="h-4 w-4" />
                                                                        Schedule Details
                                                                    </h3>
                                                                    
                                                                    <div className="space-y-3">
                                                                        <div className="flex justify-between items-center py-2 border-b">
                                                                            <span className="text-sm text-muted-foreground">Frequency</span>
                                                                            <span className="text-sm font-medium">
                                                                                Billed {FREQUENCY_LABELS[expandedData.frequency]?.toLowerCase() || expandedData.frequency}
                                                                            </span>
                                                                        </div>
                                                                        
                                                                        <div className="flex justify-between items-center py-2 border-b">
                                                                            <span className="text-sm text-muted-foreground">Status</span>
                                                                            <Badge className={getRecurringStatusVisual(expandedData.status).badgeClass}>
                                                                                {getRecurringStatusVisual(expandedData.status).label}
                                                                            </Badge>
                                                                        </div>
                                                                        
                                                                        <div className="flex justify-between items-center py-2 border-b">
                                                                            <span className="text-sm text-muted-foreground">Start Date</span>
                                                                            <span className="text-sm font-medium">{formatDate(expandedData.start_date)}</span>
                                                                        </div>
                                                                        
                                                                        {expandedData.end_date && (
                                                                            <div className="flex justify-between items-center py-2 border-b">
                                                                                <span className="text-sm text-muted-foreground">End Date</span>
                                                                                <span className="text-sm font-medium">{formatDate(expandedData.end_date)}</span>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {expandedData.status === 'active' && expandedData.next_run_date && (
                                                                            <div className="flex justify-between items-center py-2 border-b">
                                                                                <span className="text-sm text-muted-foreground">Next Invoice</span>
                                                                                <span className="text-sm font-medium text-green-600 dark:text-green-400">{formatDate(expandedData.next_run_date)}</span>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {expandedData.last_generated_at && (
                                                                            <div className="flex justify-between items-center py-2 border-b">
                                                                                <span className="text-sm text-muted-foreground">Last Generated</span>
                                                                                <span className="text-sm font-medium">{formatDate(expandedData.last_generated_at)}</span>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        <div className="flex justify-between items-center py-2 border-b">
                                                                            <span className="text-sm text-muted-foreground">Invoices Generated</span>
                                                                            <span className="text-sm font-medium">{expandedData.invoices_generated || 0}</span>
                                                                        </div>
                                                                        
                                                                        {expandedData.source_invoice_id && expandedData.source_invoice_number && (
                                                                            <div className="flex justify-between items-center py-2">
                                                                                <span className="text-sm text-muted-foreground">Source Invoice</span>
                                                                                <Button
                                                                                    variant="link"
                                                                                    size="sm"
                                                                                    className="text-sm font-medium text-blue-600 h-auto p-0"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        navigate(`/invoices`);
                                                                                    }}
                                                                                >
                                                                                    {expandedData.source_invoice_number}
                                                                                    <ExternalLink className="h-3 w-3 ml-1" />
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {pagination.totalPages > 1 && (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                        {pagination.total} schedule{pagination.total === 1 ? '' : 's'}
                    </p>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            disabled={recurringInvoicesQuery.isFetching || pagination.page <= 1}
                        >
                            Previous
                        </Button>
                        <span className="min-w-20 text-center text-sm text-muted-foreground">
                            {pagination.page} of {pagination.totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                            disabled={recurringInvoicesQuery.isFetching || pagination.page >= pagination.totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {/* Create Recurring Dialog */}
            <Dialog open={dialogOpen} onOpenChange={(open) => {
                if (open) setDialogOpen(true);
                else dismissIfIdle(() => {
                    resetRecurringCreate();
                    setDialogOpen(false);
                });
            }}>
                <ModalContent size="lg">
                    <ModalHeader
                        icon={RefreshCw}
                        title="Create recurring schedule"
                        description="Set up an invoice that automatically generates on a schedule."
                    />
                    <ModalBody className="grid gap-4">
                        <div className="space-y-2">
                            <Label>Schedule name *</Label>
                            <Input
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="e.g., Monthly Retainer - Client Name"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Customer</Label>
                                <ContactCatalogPicker
                                    organizationId={organizationId}
                                    selectedContact={selectedContact}
                                    onSelect={(contact) => {
                                        setSelectedContact(contact);
                                        setContactId(contact?.id);
                                        setCustomerName(contact
                                            ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
                                            : '');
                                    }}
                                    placeholder="Select contact"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Frequency *</Label>
                                <Select
                                    value={frequency}
                                    onValueChange={(v) => {
                                        if (isRecurringFrequency(v)) {
                                            setFrequency(v);
                                        }
                                    }}
                                >
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
                                <Label>Start Date *</Label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>End Date (optional)</Label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <Label>Line Items</Label>
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
                                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
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
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="outline" onClick={() => dismissIfIdle(() => {
                            resetRecurringCreate();
                            setDialogOpen(false);
                        })} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveRecurring}
                            disabled={saving || !templateName || lineItems.filter(i => i.name).length === 0}
                            className="bg-blue-600 interaction-button--primary text-white"
                            aria-busy={saving || undefined}
                        >
                            {saving ? 'Creating...' : 'Create schedule'}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Dialog>

            <DeleteDialog
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                    setDeleteDialogOpen(open);
                    if (!open) setRecurringToDelete(null);
                }}
                onConfirm={confirmDelete}
                itemType="recurring-schedule"
                itemTitle={recurringToDelete?.template_name}
                title="Delete Recurring Schedule"
                description={recurringDeleteDescription}
            />
        {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={handleOnboardingClose}
                onComplete={handleOnboardingComplete}
                onDismiss={handleOnboardingDismiss}
                content={ONBOARDING_CONTENT[onboardingFeatureKey]}
            />
        )}
        </PageLayout>
    );
}

export default RecurringInvoicesPage;
