import React, { useState, useEffect, useCallback } from 'react';
import {
    Plus,
    Search,
    Package,
    PackageCheck,
    PackageX,
    RefreshCw,
    MoreHorizontal,
    Trash2,
    Pencil,
    Tag,
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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { PageLayout } from '@/components/layout/PageLayout';
import {
    HeaderAction,
    HeaderCombinedQuery,
    HeaderFilters,
    HeaderSearch,
} from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    Product,
} from '@/services/invoicesApi';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import {
    filterProductCatalog,
    getProductCatalogStats,
    getProductTaxInclusiveTotal,
    type ProductStatusFilter,
    type ProductTypeFilter,
} from './productCatalog';

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

export function ProductsPage() {
    const { toast } = useToast();
    // Route-aware onboarding (will show 'invoices' onboarding for all Sales & Payments routes)
    const {
        showModal: showOnboarding,
        handleComplete: handleOnboardingComplete,
        handleDismiss: handleOnboardingDismiss,
        handleClose: handleOnboardingClose,
        featureKey: onboardingFeatureKey,
    } = useRouteOnboarding();

    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId } = useOrganization({
        onError: () => {
            toast({ title: 'Error', description: 'Failed to initialize', variant: 'destructive' });
            return 'Failed to initialize';
        }
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('active');
    const [typeFilter, setTypeFilter] = useState<ProductTypeFilter>('all');

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<ProductFormData>(defaultFormData);
    const [saving, setSaving] = useState(false);
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);

    useEffect(() => {
        if (!organizationId) {
            setLoading(false);
        }
    }, [organizationId]);

    const fetchProducts = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const data = await getProducts({}, organizationId);
            setProducts(data || []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load products', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, toast]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

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

        setSaving(true);
        try {
            if (editingProduct) {
                await updateProduct(editingProduct.id, formData, organizationId);
                toast({ title: 'Updated', description: 'Product updated successfully' });
            } else {
                await createProduct(formData, organizationId);
                toast({ title: 'Created', description: 'Product created successfully' });
            }
            setDialogOpen(false);
            fetchProducts();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save product', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (): Promise<boolean> => {
        if (!organizationId || !productToDelete) return false;
        try {
            await deleteProduct(productToDelete.id, organizationId);
            setProducts(prev => prev.filter(p => p.id !== productToDelete.id));
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

    const filteredProducts = filterProductCatalog(products, {
        searchQuery,
        status: statusFilter,
        type: typeFilter,
    });
    const stats = getProductCatalogStats(products);
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
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
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
            mobileClassName="flex-col items-stretch gap-2"
            desktopTools={{
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
            mobileActions={
                <>
                <div className="flex w-full items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 w-full border-border/50 bg-muted/20 pl-10"
                        />
                    </div>
                    <Button
                        size="icon"
                        aria-label="Add product"
                        className="h-9 w-9 bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => openCreateDialog()}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                {statusSelect(true)}
                {typeSelect(true)}
                </>
            }
        >
            <ResponsiveCardRail
                label="Product catalog summary"
                desktopColumns="md:grid-cols-4"
                className="responsive-stat-summary"
            >
                <StatCard
                    title="Active products"
                    badgeText="Active"
                    value={stats.active}
                    icon={PackageCheck}
                    description="Available on new invoices"
                    colorTheme="blue"
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
                    title="Inactive products"
                    badgeText="Inactive"
                    value={stats.inactive}
                    icon={PackageX}
                    description="Hidden from new invoices"
                    colorTheme="orange"
                    isLoading={loading}
                />
            </ResponsiveCardRail>

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <EmptyState
                            icon={Package}
                            title={products.length === 0 ? 'No products yet' : 'No matching products'}
                            description={products.length === 0
                                ? 'Create reusable products and services for faster invoicing'
                                : 'Try adjusting your search or catalog filters'}
                            actionLabel={products.length === 0 ? 'Add product' : 'Clear filters'}
                            onAction={products.length === 0 ? openCreateDialog : resetCatalogQuery}
                            className="p-12"
                        />
                    ) : (
                        <div className="divide-y">
                            {filteredProducts.map((product) => {
                                const ProductTypeIcon = product.product_type === 'recurring' ? RefreshCw : Tag;

                                return (
                                <div key={product.id} className="group p-4 transition-colors hover:bg-muted/50">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 flex-1 items-center gap-2">
                                            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full md:h-10 md:w-10 ${product.is_active ? 'bg-blue-100 dark:bg-blue-900' : 'bg-orange-100 dark:bg-orange-900'}`}>
                                                <ProductTypeIcon className={`h-4 w-4 ${product.is_active ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`} aria-hidden="true" />
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
                                                <Badge className={`pointer-events-none cursor-default text-xs ${product.is_active ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'}`}>
                                                    {product.is_active ? 'Active' : 'Inactive'}
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
                                                        <Pencil className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Edit
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
                                            <Badge className={`pointer-events-none cursor-default text-xs ${product.is_active ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'}`}>
                                                {product.is_active ? 'Active' : 'Inactive'}
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

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-blue-600" />
                            {editingProduct ? 'Edit Product' : 'Add Product'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingProduct 
                                ? 'Update your product or service details'
                                : 'Add a new product or service to your catalog'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
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
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="taxable"
                                    checked={formData.taxable}
                                    onCheckedChange={(checked) => setFormData({ ...formData, taxable: checked })}
                                />
                                <Label htmlFor="taxable">Taxable</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="is_active"
                                    checked={formData.is_active}
                                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                />
                                <Label htmlFor="is_active">Active</Label>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving || !formData.name}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
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
