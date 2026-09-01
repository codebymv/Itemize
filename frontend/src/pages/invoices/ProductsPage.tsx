import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Plus,
    Package,
    RefreshCw,
    MoreHorizontal,
    Trash2,
    Pencil,
    Tag,
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
import { Switch } from '@/components/ui/switch';
import { AvailabilitySettingRow } from '@/components/settings/SettingsPrimitives';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
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
import {
    createProduct,
    updateProduct,
    deleteProduct,
    Product,
} from '@/services/invoicesApi';
import { getProductPageViaGraphql } from '@/services/productsGraphql';
import { productQueryKeys } from '@/services/productQueryKeys';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import {
    getProductTaxInclusiveTotal,
    type ProductStatusFilter,
    type ProductTypeFilter,
} from './productCatalog';
import { getProductStatusVisual } from './constants/productConstants';

interface ProductFormData {
    name: string;
    description: string;
    sku: string;
    price: number;
    currency: string;
    product_type: 'one_time' | 'recurring';
    billing_period?: 'monthly' | 'yearly' | 'weekly' | 'quarterly';
    tax_rate: number;
    taxable: boolean;
    is_active: boolean;
}

type BillingPeriod = NonNullable<ProductFormData['billing_period']>;

const BILLING_PERIODS: BillingPeriod[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

const isBillingPeriod = (value: string): value is BillingPeriod =>
    BILLING_PERIODS.includes(value as BillingPeriod);

const defaultFormData: ProductFormData = {
    name: '',
    description: '',
    sku: '',
    price: 0,
    currency: 'USD',
    product_type: 'one_time',
    tax_rate: 0,
    taxable: true,
    is_active: true,
};
const PAGE_SIZE = 20;

export function ProductsPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // Route-aware onboarding (will show 'invoices' onboarding for all Sales & Payments routes)
    const {
        showModal: showOnboarding,
        handleComplete: handleOnboardingComplete,
        handleDismiss: handleOnboardingDismiss,
        handleClose: handleOnboardingClose,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({
        onError: () => {
            toast({ title: 'Error', description: 'Failed to initialize', variant: 'destructive' });
            return 'Failed to initialize';
        }
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('active');
    const [typeFilter, setTypeFilter] = useState<ProductTypeFilter>('all');
    const [page, setPage] = useState(1);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<ProductFormData>(defaultFormData);
    const { pending: saving, run: runSave, dismissIfIdle } = useSingleFlightAction();
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
        return () => window.clearTimeout(timeout);
    }, [searchQuery]);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, statusFilter, typeFilter]);

    const productsQuery = useQuery({
        queryKey: productQueryKeys.page(organizationId, {
            search: debouncedSearch,
            status: statusFilter,
            type: typeFilter,
            page,
            limit: PAGE_SIZE,
        }),
        queryFn: ({ signal }) => getProductPageViaGraphql({
            page,
            limit: PAGE_SIZE,
            search: debouncedSearch || undefined,
            is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
            product_type: typeFilter === 'all' ? undefined : typeFilter,
        }, organizationId as number, signal),
        enabled: organizationId !== null,
        staleTime: QUERY_STALE_TIME_MS,
        retry: shouldRetryQuery,
        placeholderData: keepPreviousData,
    });
    const products = productsQuery.data?.products ?? [];
    const pagination = productsQuery.data?.pagination ?? {
        page, limit: PAGE_SIZE, total: 0, totalPages: 0,
    };
    const stats = productsQuery.data?.stats ?? {
        total: 0, active: 0, inactive: 0, oneTime: 0, recurring: 0,
    };
    const loading = orgLoading || (organizationId !== null && productsQuery.isPending);
    const loadError = initError ?? (productsQuery.error && !productsQuery.data
        ? 'Products could not be loaded. Please try again.'
        : null);

    useEffect(() => {
        if (!productsQuery.data) return;
        const lastAvailablePage = Math.max(1, productsQuery.data.pagination.totalPages);
        if (page > lastAvailablePage) setPage(lastAvailablePage);
    }, [page, productsQuery.data]);

    const openCreateDialog = () => {
        setEditingProduct(null);
        setFormData(defaultFormData);
        setDialogOpen(true);
    };

    const openEditDialog = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            description: product.description || '',
            sku: product.sku || '',
            price: product.price,
            currency: product.currency,
            product_type: product.product_type,
            billing_period: product.billing_period,
            tax_rate: product.tax_rate,
            taxable: product.taxable,
            is_active: product.is_active,
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!organizationId || !formData.name) return;

        await runSave(async () => {
            try {
                if (editingProduct) {
                    await updateProduct(editingProduct.id, formData, organizationId);
                    toast({ title: 'Updated', description: 'Product updated successfully' });
                } else {
                    await createProduct(formData, organizationId);
                    toast({ title: 'Created', description: 'Product created successfully' });
                }
                setDialogOpen(false);
                await queryClient.invalidateQueries({ queryKey: productQueryKeys.all(organizationId) });
            } catch {
                toast({ title: 'Error', description: 'Failed to save product', variant: 'destructive' });
            }
        });
    };

    const handleDelete = async (): Promise<boolean> => {
        if (!organizationId || !productToDelete) return false;
        try {
            await deleteProduct(productToDelete.id, organizationId);
            await queryClient.invalidateQueries({ queryKey: productQueryKeys.all(organizationId) });
            setProductToDelete(null);
            return true;
        } catch (error) {
            return false;
        }
    };

    const formatCurrency = (amount: number, currency: string = 'USD') => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    };

    const statusFilterCount = Number(statusFilter !== 'active');
    const typeFilterCount = Number(typeFilter !== 'all');
    const headerFilterCount = statusFilterCount + typeFilterCount;
    const headerQueryCount = headerFilterCount + Number(searchQuery.trim().length > 0);
    const resetCatalogQuery = () => {
        setSearchQuery('');
        setStatusFilter('active');
        setTypeFilter('all');
    };
    const statusSelect = (compact = false) => (
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ProductStatusFilter)}>
            <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[8.5rem] bg-muted/20'}>
                <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="active">Available</SelectItem>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="inactive">Unavailable</SelectItem>
            </SelectContent>
        </Select>
    );
    const typeSelect = (compact = false) => (
        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as ProductTypeFilter)}>
            <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[8.5rem] bg-muted/20'}>
                <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="one_time">One-time</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
            </SelectContent>
        </Select>
    );

    return (
        <PageLayout
            title="PRODUCTS"
            icon={<Package className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
            headerTools={{
                search: (
                    <HeaderSearch
                        label="Search products"
                        placeholder="Search products..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                    />
                ),
                filters: (
                    <div className="flex items-center gap-2">
                        <HeaderFilters
                            label="Select product status"
                            activeCount={statusFilterCount}
                            compactChildren={statusSelect(true)}
                            preferExpanded
                        >
                            {statusSelect()}
                        </HeaderFilters>
                        <HeaderFilters
                            label="Filter products by type"
                            activeCount={typeFilterCount}
                            compactChildren={typeSelect(true)}
                            preferExpanded="when-roomy"
                        >
                            {typeSelect()}
                        </HeaderFilters>
                    </div>
                ),
                combinedQuery: (
                    <HeaderCombinedQuery
                        label="Search and filter products"
                        placeholder="Search products..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        activeCount={headerQueryCount}
                    >
                        {statusSelect(true)}
                        {typeSelect(true)}
                    </HeaderCombinedQuery>
                ),
                primaryAction: (
                    <HeaderAction
                        label="Add product"
                        icon={<Plus className="h-4 w-4" />}
                        onClick={() => openCreateDialog()}
                    />
                ),
            }}
        >
            {!loadError && (
            <FramedSection title="Overview" icon={PieChart} className="mb-6">
              <ResponsiveCardRail
                  label="Product catalog summary"
                  desktopColumns="md:grid-cols-4"
                  className="responsive-stat-summary mb-0"
              >
                <StatCard
                    title="Available products"
                    badgeText="Available"
                    value={stats.active}
                    icon={getProductStatusVisual(true).icon}
                    description="Available on new invoices"
                    colorTheme={getProductStatusVisual(true).theme}
                    isLoading={loading}
                />
                <StatCard
                    title="One-time products"
                    badgeText="One-time"
                    value={stats.oneTime}
                    icon={Tag}
                    description="Single-charge catalog items"
                    colorTheme="blue"
                    isLoading={loading}
                />
                <StatCard
                    title="Recurring products"
                    badgeText="Recurring"
                    value={stats.recurring}
                    icon={RefreshCw}
                    description="Repeat-billing catalog items"
                    colorTheme="blue"
                    isLoading={loading}
                />
                <StatCard
                    title="Unavailable products"
                    badgeText="Unavailable"
                    value={stats.inactive}
                    icon={getProductStatusVisual(false).icon}
                    description="Hidden from new invoices"
                    colorTheme={getProductStatusVisual(false).theme}
                    isLoading={loading}
                />
              </ResponsiveCardRail>
            </FramedSection>
            )}

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : loadError ? (
                        initError ? (
                            <OrganizationErrorState kind="section" title="Unable to load products" />
                        ) : (
                            <ErrorState kind="section" title="Unable to load products" description={loadError} onAction={() => void productsQuery.refetch()} />
                        )
                    ) : products.length === 0 ? (
                        <EmptyState
                            icon={Package}
                            kind={stats.total === 0 ? 'collection' : 'results'}
                            title={stats.total === 0 ? 'No products yet' : 'No matching products'}
                            description={stats.total === 0
                                ? 'Create reusable products and services for faster invoicing'
                                : undefined}
                            actionLabel={stats.total === 0 ? 'Add product' : 'Clear filters'}
                            onAction={stats.total === 0 ? openCreateDialog : resetCatalogQuery}
                            className="p-12"
                        />
                    ) : (
                        <div className="divide-y">
                            {products.map((product) => {
                                const ProductTypeIcon = product.product_type === 'recurring' ? RefreshCw : Tag;
                                const statusVisual = getProductStatusVisual(product.is_active);

                                return (
                                <div key={product.id} className="group p-4 interaction-row">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 flex-1 items-center gap-2">
                                            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full md:h-10 md:w-10 ${statusVisual.iconBackgroundClass}`}>
                                                <ProductTypeIcon className={`h-4 w-4 ${statusVisual.iconClass}`} aria-hidden="true" />
                                            </div>
                                            <button
                                                type="button"
                                                className="truncate text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-base"
                                                onClick={() => openEditDialog(product)}
                                            >
                                                {product.name}
                                            </button>
                                            <span className="sr-only">
                                                {product.product_type === 'recurring' ? 'Recurring product' : 'One-time product'}
                                            </span>
                                        </div>
                                        <div className="flex flex-shrink-0 items-center gap-2">
                                            <div className="hidden lg:block">
                                                <Badge className={`pointer-events-none cursor-default text-xs ${statusVisual.badgeClass}`}>
                                                    {statusVisual.label}
                                                </Badge>
                                            </div>
                                            <div className="hidden text-right sm:block">
                                                <p className="text-sm font-semibold md:text-base">{formatCurrency(product.price, product.currency)}</p>
                                                {product.taxable && product.tax_rate > 0 && (
                                                    <>
                                                        <p className="text-xs text-muted-foreground">+{product.tax_rate}% tax</p>
                                                        <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                                                            Total {formatCurrency(getProductTaxInclusiveTotal(product), product.currency)}
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Product actions">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openEditDialog(product)} className="group/menu">
                                                        <Pencil className="mr-2 h-4 w-4" />Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => setProductToDelete(product)}
                                                        className="text-destructive focus:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-6">
                                        <span className="lg:hidden">
                                            <Badge className={`pointer-events-none cursor-default text-xs ${statusVisual.badgeClass}`}>
                                                {statusVisual.label}
                                            </Badge>
                                        </span>
                                        {product.product_type === 'recurring' && product.billing_period && (
                                            <span className="text-xs capitalize text-muted-foreground">{product.billing_period}</span>
                                        )}
                                        {product.sku && <span className="text-xs text-muted-foreground">SKU {product.sku}</span>}
                                    </div>

                                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-6 text-xs text-muted-foreground">
                                        <span className="flex flex-col sm:hidden">
                                            <span className="font-semibold text-foreground">{formatCurrency(product.price, product.currency)}</span>
                                            {product.taxable && product.tax_rate > 0 && (
                                                <>
                                                    <span>+{product.tax_rate}% tax</span>
                                                    <span className="font-semibold text-green-600 dark:text-green-400">
                                                        Total {formatCurrency(getProductTaxInclusiveTotal(product), product.currency)}
                                                    </span>
                                                </>
                                            )}
                                        </span>
                                        {product.description && <span className="truncate">{product.description}</span>}
                                    </div>
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
                        Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} products
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={productsQuery.isFetching || pagination.page <= 1}>Previous</Button>
                        <span className="min-w-20 text-center text-sm text-muted-foreground">{pagination.page} of {pagination.totalPages}</span>
                        <Button variant="outline" size="sm" onClick={() => setPage(current => Math.min(pagination.totalPages, current + 1))} disabled={productsQuery.isFetching || pagination.page >= pagination.totalPages}>Next</Button>
                    </div>
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={(open) => {
                if (open) setDialogOpen(true);
                else dismissIfIdle(() => setDialogOpen(false));
            }}>
                <ModalContent size="md">
                    <ModalHeader
                        icon={Package}
                        title={editingProduct ? 'Edit product' : 'Add product'}
                        description={editingProduct
                                ? 'Update your product or service details'
                                : 'Add a new product or service to your catalog'}
                    />
                    <ModalBody className="grid gap-4">
                        <div className="space-y-2">
                            <Label>Name *</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Product or service name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Optional description"
                                rows={2}
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>SKU</Label>
                                <Input
                                    value={formData.sku}
                                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                    placeholder="SKU-001"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select
                                    value={formData.product_type}
                                    onValueChange={(v) => setFormData({ ...formData, product_type: v as 'one_time' | 'recurring' })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="one_time">One-time</SelectItem>
                                        <SelectItem value="recurring">Recurring</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {formData.product_type === 'recurring' && (
                            <div className="space-y-2">
                                <Label>Billing period</Label>
                                <Select
                                    value={formData.billing_period || 'monthly'}
                                    onValueChange={(v) => {
                                        if (isBillingPeriod(v)) {
                                            setFormData({ ...formData, billing_period: v });
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
                        )}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Price *</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.price || ''}
                                    onChange={(e) => setFormData({ ...formData, price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Tax rate (%)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={formData.tax_rate || ''}
                                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border p-3">
                                <Label htmlFor="taxable">Taxable</Label>
                                <Switch
                                    id="taxable"
                                    checked={formData.taxable}
                                    onCheckedChange={(checked) => setFormData({ ...formData, taxable: checked })}
                                />
                            </div>
                            <AvailabilitySettingRow
                                id="is_active"
                                label="Available on new invoices"
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                help="Unavailable products remain in the catalog but cannot be added to new invoices."
                                helpLabel="About product availability"
                            />
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="outline" onClick={() => dismissIfIdle(() => setDialogOpen(false))} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving || !formData.name}
                            className="bg-blue-600 interaction-button--primary text-white"
                            aria-busy={saving || undefined}
                        >
                            {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Dialog>
        <DeleteDialog
            open={Boolean(productToDelete)}
            onOpenChange={(open) => !open && setProductToDelete(null)}
            onConfirm={handleDelete}
            itemType="product"
            itemTitle={productToDelete?.name}
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

export default ProductsPage;
