import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    FileText,
    MoreVertical,
    Trash2,
    Send,
    ArrowRight,
    Pencil,
    ChevronDown,
    Loader2,
    PieChart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { useStableMutationKey } from '@/hooks/useStableMutationKey';
import {
    convertEstimateToInvoice,
    deleteEstimate,
    Estimate,
    getEstimate,
    getEstimates,
    sendEstimate,
} from '@/services/estimatesApi';
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
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { formatDateOnly } from './utils/invoiceFormatters';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { InvoicePreviewCard } from './components/InvoicePreviewCard';
import { cn } from '@/lib/utils';
import { getEstimateStatusVisual } from './constants/estimateConstants';
import { ExpandedRowActionLabel, ExpandedRowActions } from '@/components/ui/expanded-row';

const DAY_MS = 24 * 60 * 60 * 1000;

const getWholeDaysSince = (value: string): number => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 0;

    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const then = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

    return Math.max(0, Math.round((today - then) / DAY_MS));
};

const getEffectiveEstimateStatus = (estimate: Estimate): Estimate['status'] => {
    if (
        estimate.status === 'sent'
        && new Date(`${estimate.valid_until.split('T')[0]}T23:59:59`).getTime() < Date.now()
    ) {
        return 'expired';
    }

    return estimate.status;
};

export function EstimatesPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    // Route-aware onboarding (will show 'invoices' onboarding for all Sales & Payments routes)
    const {
        showModal: showOnboarding,
        handleComplete: handleOnboardingComplete,
        handleDismiss: handleOnboardingDismiss,
        handleClose: handleOnboardingClose,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const [estimates, setEstimates] = useState<Estimate[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const { organizationId, error: initError } = useOrganization({
        onError: () => {
            toast({ title: 'Error', description: 'Failed to initialize', variant: 'destructive' });
            return 'Failed to initialize';
        }
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>('all');
    const [estimateToDelete, setEstimateToDelete] = useState<Estimate | null>(null);
    const [expandedEstimateId, setExpandedEstimateId] = useState<number | null>(null);
    const [expandedEstimateData, setExpandedEstimateData] = useState<Estimate | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [previewError, setPreviewError] = useState(false);
    const [sendingEstimateId, setSendingEstimateId] = useState<number | null>(null);
    const {
        begin: beginEstimateSend,
        release: releaseEstimateSend,
        reset: resetEstimateSend,
    } = useStableMutationKey('estimate-list-send');

    useEffect(() => {
        if (!organizationId) {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        if (initError) setLoadError(initError);
    }, [initError]);

    const fetchEstimates = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const response = await getEstimates({}, organizationId);
            setEstimates(response.estimates);
        } catch (error) {
            setLoadError('Estimates could not be loaded. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        fetchEstimates();
    }, [fetchEstimates]);

    const handleSendEstimate = async (id: number) => {
        if (!organizationId) return;
        const idempotencyKey = beginEstimateSend(`${organizationId}:${id}`);
        if (!idempotencyKey) return;
        setSendingEstimateId(id);
        try {
            await sendEstimate(id, organizationId, idempotencyKey);
            resetEstimateSend();
            toast({ title: 'Sent', description: 'Estimate sent successfully' });
            fetchEstimates();
        } catch (error) {
            releaseEstimateSend();
            toast({ title: 'Error', description: 'Estimate delivery could not be confirmed. An unchanged retry is safe.', variant: 'destructive' });
        } finally {
            setSendingEstimateId(null);
        }
    };

    const handleConvertToInvoice = async (id: number) => {
        if (!organizationId) return;
        try {
            const response = await convertEstimateToInvoice(id, organizationId);
            toast({ title: 'Converted', description: 'Estimate converted to invoice successfully' });
            navigate(`/invoices/${response.invoice_id}`);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to convert estimate', variant: 'destructive' });
        }
    };

    const handleDelete = async (): Promise<boolean> => {
        if (!organizationId || !estimateToDelete) return false;
        try {
            await deleteEstimate(estimateToDelete.id, organizationId);
            setEstimates(prev => prev.filter(e => e.id !== estimateToDelete.id));
            setEstimateToDelete(null);
            return true;
        } catch (error) {
            return false;
        }
    };

    const loadExpandedEstimate = async (estimateId: number) => {
        setExpandedEstimateId(estimateId);
        setExpandedEstimateData(null);
        setPreviewError(false);
        setLoadingPreview(true);
        try {
            const estimate = await getEstimate(estimateId, organizationId || undefined);
            setExpandedEstimateData(estimate);
        } catch {
            setPreviewError(true);
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleToggleExpand = (estimateId: number, event?: React.MouseEvent) => {
        event?.stopPropagation();
        if (expandedEstimateId === estimateId) {
            setExpandedEstimateId(null);
            setExpandedEstimateData(null);
            setPreviewError(false);
            return;
        }
        void loadExpandedEstimate(estimateId);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    };

    const getContactName = (estimate: Estimate) => {
        if (estimate.customer_name) return estimate.customer_name;
        if (estimate.contact_first_name || estimate.contact_last_name) {
            return `${estimate.contact_first_name || ''} ${estimate.contact_last_name || ''}`.trim();
        }
        return 'Unknown';
    };

    const stats = useMemo(() => {
        const summarize = (status: Estimate['status']) => {
            const matches = estimates.filter(estimate => getEffectiveEstimateStatus(estimate) === status);
            return {
                total: matches.reduce((sum, estimate) => sum + (estimate.total || 0), 0),
                count: matches.length,
            };
        };

        return {
            expired: summarize('expired'),
            draft: summarize('draft'),
            sent: summarize('sent'),
            accepted: summarize('accepted'),
        };
    }, [estimates]);

    const filteredEstimates = useMemo(() => {
        let filtered = estimates;

        switch (activeTab) {
            case 'draft':
                filtered = filtered.filter(e => getEffectiveEstimateStatus(e) === 'draft');
                break;
            case 'sent':
                filtered = filtered.filter(e => getEffectiveEstimateStatus(e) === 'sent');
                break;
            case 'accepted':
                filtered = filtered.filter(e => getEffectiveEstimateStatus(e) === 'accepted');
                break;
            case 'declined':
                filtered = filtered.filter(e => getEffectiveEstimateStatus(e) === 'declined');
                break;
            case 'expired':
                filtered = filtered.filter(e => getEffectiveEstimateStatus(e) === 'expired');
                break;
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(e =>
                e.estimate_number?.toLowerCase().includes(query) ||
                getContactName(e).toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [estimates, activeTab, searchQuery]);

    const headerFilterCount = Number(activeTab !== 'all');
    const headerQueryCount = headerFilterCount + Number(searchQuery.trim().length > 0);
    const headerFilters = (
        <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="h-11 w-[8.5rem] bg-muted/20">
                <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Estimates</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
        </Select>
    );

    return (
        <PageLayout
            title="ESTIMATES"
            icon={<FileText className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
            headerTools={{
                search: (
                    <HeaderSearch
                        label="Search estimates"
                        placeholder="Search estimates..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                    />
                ),
                filters: (
                    <HeaderFilters label="Filter estimates" activeCount={headerFilterCount} preferExpanded>
                        {headerFilters}
                    </HeaderFilters>
                ),
                combinedQuery: (
                    <HeaderCombinedQuery
                        label="Search and filter estimates"
                        placeholder="Search estimates..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        activeCount={headerQueryCount}
                    >
                        {headerFilters}
                    </HeaderCombinedQuery>
                ),
                primaryAction: (
                    <HeaderAction
                        label="Create estimate"
                        icon={<Plus className="h-4 w-4" />}
                        onClick={() => navigate('/estimates/new')}
                    />
                ),
            }}
        >
            {!loadError && (
            <FramedSection title="Overview" icon={PieChart} className="mb-6">
              <ResponsiveCardRail
                  label="Estimate status summary"
                  desktopColumns="md:grid-cols-4"
                  className="responsive-stat-summary mb-0"
              >
                <StatCard
                    title="Expired"
                    badgeText="Expired"
                    value={<ResponsiveMoneyValue amount={stats.expired.total} currency="USD" locale="en-US" />}
                    icon={getEstimateStatusVisual('expired').icon}
                    description={`${stats.expired.count} estimate${stats.expired.count !== 1 ? 's' : ''}`}
                    colorTheme={getEstimateStatusVisual('expired').theme}
                    isLoading={loading}
                />
                <StatCard
                    title="Draft"
                    badgeText="Draft"
                    value={<ResponsiveMoneyValue amount={stats.draft.total} currency="USD" locale="en-US" />}
                    icon={getEstimateStatusVisual('draft').icon}
                    description={`${stats.draft.count} estimate${stats.draft.count !== 1 ? 's' : ''}`}
                    colorTheme={getEstimateStatusVisual('draft').theme}
                    isLoading={loading}
                />
                <StatCard
                    title="Sent"
                    badgeText="Sent"
                    value={<ResponsiveMoneyValue amount={stats.sent.total} currency="USD" locale="en-US" />}
                    icon={getEstimateStatusVisual('sent').icon}
                    description={`${stats.sent.count} estimate${stats.sent.count !== 1 ? 's' : ''}`}
                    colorTheme={getEstimateStatusVisual('sent').theme}
                    isLoading={loading}
                />
                <StatCard
                    title="Accepted"
                    badgeText="Accepted"
                    value={<ResponsiveMoneyValue amount={stats.accepted.total} currency="USD" locale="en-US" />}
                    icon={getEstimateStatusVisual('accepted').icon}
                    description={`${stats.accepted.count} estimate${stats.accepted.count !== 1 ? 's' : ''}`}
                    colorTheme={getEstimateStatusVisual('accepted').theme}
                    isLoading={loading}
                />
              </ResponsiveCardRail>
            </FramedSection>
            )}

            {/* Estimates List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : loadError ? (
                        initError ? (
                            <OrganizationErrorState kind="section" title="Unable to load estimates" />
                        ) : (
                            <ErrorState kind="section" title="Unable to load estimates" description={loadError} onAction={() => void fetchEstimates()} />
                        )
                    ) : filteredEstimates.length === 0 ? (
                        <EmptyState
                            icon={FileText}
                            kind={headerQueryCount > 0 ? 'results' : 'collection'}
                            title={headerQueryCount > 0 ? 'No matching estimates' : 'No estimates yet'}
                            description={headerQueryCount > 0 ? undefined : 'Create an estimate to price work for a customer.'}
                            actionLabel={headerQueryCount > 0 ? 'Clear filters' : 'Create estimate'}
                            onAction={headerQueryCount > 0
                                ? () => { setSearchQuery(''); setActiveTab('all'); }
                                : () => navigate('/estimates/new')}
                            className="p-12"
                        />
                    ) : (
                        <div className="divide-y">
                            {filteredEstimates.map((estimate) => {
                                const isExpanded = expandedEstimateId === estimate.id;
                                const effectiveStatus = getEffectiveEstimateStatus(estimate);
                                const statusVisual = getEstimateStatusVisual(effectiveStatus);
                                const StatusIcon = statusVisual.icon;

                                return (
                                    <div key={estimate.id}>
                                        <div
                                            className="group cursor-pointer p-4 interaction-row"
                                            onClick={(event) => handleToggleExpand(estimate.id, event)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full md:h-10 md:w-10 ${statusVisual.iconBackgroundClass}`}>
                                                        <StatusIcon className={`h-4 w-4 ${statusVisual.iconClass}`} aria-hidden="true" />
                                                    </div>
                                                    <p className="truncate text-sm font-medium md:text-base">{estimate.estimate_number}</p>
                                                </div>

                                                <div className="flex flex-shrink-0 items-center gap-2">
                                                    <div className="hidden lg:block">
                                                        <Badge className={`pointer-events-none cursor-default text-xs ${statusVisual.badgeClass}`}>
                                                            {statusVisual.label}
                                                        </Badge>
                                                    </div>
                                                    <div className="hidden text-right sm:block">
                                                        <p className="text-sm font-semibold md:text-base">{formatCurrency(estimate.total)}</p>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0"
                                                        aria-label={isExpanded ? 'Collapse estimate preview' : 'Expand estimate preview'}
                                                        onClick={(event) => handleToggleExpand(estimate.id, event)}
                                                    >
                                                        <ChevronDown className={cn(
                                                            'h-4 w-4 transition-transform',
                                                            isExpanded ? '' : 'rotate-180',
                                                        )} />
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Estimate actions">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                                                            <DropdownMenuItem onClick={() => navigate(`/estimates/${estimate.id}`)} className="group/menu">
                                                                <Pencil className="mr-2 h-4 w-4" />Edit
                                                            </DropdownMenuItem>
                                                            {estimate.status === 'draft' && (
                                                                <DropdownMenuItem disabled={sendingEstimateId !== null} onClick={() => handleSendEstimate(estimate.id)} className="group/menu">
                                                                    <Send className="mr-2 h-4 w-4" />Send
                                                                </DropdownMenuItem>
                                                            )}
                                                            {['sent', 'accepted'].includes(estimate.status) && !estimate.converted_invoice_id && (
                                                                <DropdownMenuItem onClick={() => handleConvertToInvoice(estimate.id)} className="group/menu">
                                                                    <ArrowRight className="mr-2 h-4 w-4" />Convert to Invoice
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => setEstimateToDelete(estimate)}
                                                                className="text-destructive focus:text-destructive"
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>

                                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-6">
                                                <span className="text-sm font-medium text-muted-foreground">{getContactName(estimate)}</span>
                                                <span className="lg:hidden">
                                                    <Badge className={`pointer-events-none cursor-default text-xs ${statusVisual.badgeClass}`}>
                                                        {statusVisual.label}
                                                    </Badge>
                                                </span>
                                                {estimate.converted_invoice_id && (
                                                    <Badge variant="outline" className="text-xs">Converted</Badge>
                                                )}
                                                <span className="text-xs text-muted-foreground">
                                                    Valid until {formatDateOnly(estimate.valid_until)}
                                                </span>
                                            </div>

                                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-6 text-xs text-muted-foreground">
                                                <span className="font-semibold md:hidden">{formatCurrency(estimate.total)}</span>
                                                {effectiveStatus === 'expired' && (
                                                    <span className="font-medium text-red-600 dark:text-red-400">
                                                        {getWholeDaysSince(estimate.valid_until)}d expired
                                                    </span>
                                                )}
                                                {effectiveStatus === 'accepted' && estimate.accepted_at && (
                                                    <span className="font-medium text-green-600 dark:text-green-400">
                                                        Accepted {getWholeDaysSince(estimate.accepted_at)}d ago
                                                    </span>
                                                )}
                                                {effectiveStatus === 'declined' && estimate.declined_at && (
                                                    <span className="font-medium text-red-600 dark:text-red-400">
                                                        Declined {getWholeDaysSince(estimate.declined_at)}d ago
                                                    </span>
                                                )}
                                                {effectiveStatus === 'sent' && estimate.viewed_at && (
                                                    <span className="font-medium text-orange-600 dark:text-orange-400">
                                                        Viewed {getWholeDaysSince(estimate.viewed_at)}d ago
                                                    </span>
                                                )}
                                                {effectiveStatus === 'sent' && !estimate.viewed_at && estimate.sent_at && (
                                                    <span className="font-medium text-orange-600 dark:text-orange-400">
                                                        Sent {getWholeDaysSince(estimate.sent_at)}d ago
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="border-t bg-muted/30 px-6 py-6">
                                                <ExpandedRowActions>
                                                    <Button variant="outline" size="sm" onClick={() => navigate(`/estimates/${estimate.id}`)}>
                                                        <Pencil className="mr-2 h-4 w-4" />
                                                        <ExpandedRowActionLabel full="Edit estimate" compact="Edit" />
                                                    </Button>
                                                    {estimate.status === 'draft' && (
                                                        <Button size="sm" disabled={sendingEstimateId !== null} aria-busy={sendingEstimateId === estimate.id} onClick={() => handleSendEstimate(estimate.id)}>
                                                            <Send className="mr-2 h-4 w-4" />
                                                            <ExpandedRowActionLabel full="Send estimate" compact="Send" />
                                                        </Button>
                                                    )}
                                                    {['sent', 'accepted'].includes(estimate.status) && !estimate.converted_invoice_id && (
                                                        <Button size="sm" onClick={() => handleConvertToInvoice(estimate.id)}>
                                                            <ArrowRight className="mr-2 h-4 w-4" />
                                                            <ExpandedRowActionLabel full="Convert to invoice" compact="Convert" />
                                                        </Button>
                                                    )}
                                                </ExpandedRowActions>
                                                {loadingPreview ? (
                                                    <div className="flex items-center justify-center py-12">
                                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                                        <span className="ml-2 text-muted-foreground">Loading preview...</span>
                                                    </div>
                                                ) : previewError ? (
                                                    <ErrorState
                                                        kind="inline"
                                                        icon={FileText}
                                                        title="Unable to load estimate preview"
                                                        description="The estimate is still available to edit."
                                                        onRetry={() => void loadExpandedEstimate(estimate.id)}
                                                    />
                                                ) : expandedEstimateData ? (
                                                    <div className="mx-auto max-w-3xl">
                                                        <InvoicePreviewCard
                                                            variant="estimate"
                                                            documentNumber={expandedEstimateData.estimate_number}
                                                            issueDate={expandedEstimateData.issue_date}
                                                            dueDate={expandedEstimateData.valid_until}
                                                            customerName={expandedEstimateData.customer_name || undefined}
                                                            customerEmail={expandedEstimateData.customer_email || undefined}
                                                            customerPhone={expandedEstimateData.customer_phone || undefined}
                                                            customerAddress={expandedEstimateData.customer_address || undefined}
                                                            items={(expandedEstimateData.items || []).map(item => ({
                                                                name: item.name,
                                                                description: item.description || undefined,
                                                                quantity: item.quantity,
                                                                unit_price: item.unit_price,
                                                                tax_rate: item.tax_rate,
                                                            }))}
                                                            subtotal={expandedEstimateData.subtotal}
                                                            taxAmount={expandedEstimateData.tax_amount}
                                                            discountAmount={expandedEstimateData.discount_amount}
                                                            total={expandedEstimateData.total}
                                                            currency={expandedEstimateData.currency}
                                                            notes={expandedEstimateData.notes || undefined}
                                                            termsAndConditions={expandedEstimateData.terms_and_conditions || undefined}
                                                        />

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
        {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={handleOnboardingClose}
                onComplete={handleOnboardingComplete}
                onDismiss={handleOnboardingDismiss}
                content={ONBOARDING_CONTENT[onboardingFeatureKey]}
            />
        )}
        <DeleteDialog
            open={Boolean(estimateToDelete)}
            onOpenChange={(open) => !open && setEstimateToDelete(null)}
            onConfirm={handleDelete}
            itemType="estimate"
            itemTitle={estimateToDelete?.estimate_number}
        />
        </PageLayout>
    );
}

export default EstimatesPage;
