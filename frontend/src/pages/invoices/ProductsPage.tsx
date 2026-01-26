import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import {
    Plus,
    Search,
    Package,
    MoreHorizontal,
    Trash2,
    Edit,
    DollarSign,
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
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    Product,
} from '@/services/invoicesApi';

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
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showInactive, setShowInactive] = useState(false);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<ProductFormData>(defaultFormData);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <Package className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SALES & PAYMENTS | Products
                    </h1>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    {/* Show inactive toggle - Desktop */}
                    <div className="hidden md:flex items-center gap-2">
                        <Switch
                            id="show-inactive-header"
                            checked={showInactive}
                            onCheckedChange={setShowInactive}
                        />
                        <Label htmlFor="show-inactive-header" className="text-sm text-muted-foreground">
                            Show inactive
                        </Label>
                    </div>
                    <div className="relative hidden md:block w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={() => openCreateDialog()}
                    >
                        <Plus className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Add Product</span>
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, theme, setHeaderContent, showInactive]);

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

    const fetchProducts = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const data = await getProducts(
                { is_active: showInactive ? undefined : true },
                organizationId
            );
            setProducts(data || []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load products', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, showInactive, toast]);

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

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await deleteProduct(id, organizationId);
            setProducts(prev => prev.filter(p => p.id !== id));
            toast({ title: 'Deleted', description: 'Product deleted successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete product', variant: 'destructive' });
        }
    };

    const formatCurrency = (amount: number, currency: string = 'USD') => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            {/* Mobile controls + product count */}
            <div className="flex items-center justify-between mb-6">
                {/* Show inactive toggle - Mobile only */}
                <div className="flex items-center gap-4 md:hidden">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="show-inactive"
                            checked={showInactive}
                            onCheckedChange={setShowInactive}
                        />
                        <Label htmlFor="show-inactive" className="text-sm text-muted-foreground">
                            Show inactive
                        </Label>
                    </div>
                </div>
                {/* Desktop spacer */}
                <div className="hidden md:block" />
                <p className="text-sm text-muted-foreground">
                    {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
                </p>
            </div>

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No products yet</h3>
                            <p className="text-muted-foreground mb-4">Create products or services to use in your invoices</p>
                            <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="h-4 w-4 mr-2" />Add Product
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredProducts.map((product) => (
                                <div key={product.id} className="p-4 hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                                <Package className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="font-medium">{product.name}</p>
                                                    {!product.is_active && (
                                                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                                                    )}
                                                    {product.product_type === 'recurring' && (
                                                        <Badge variant="outline" className="text-xs">
                                                            {product.billing_period}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">
                                                    {product.sku && <span className="mr-3">SKU: {product.sku}</span>}
                                                    {product.description && product.description.slice(0, 50)}
                                                    {product.description && product.description.length > 50 && '...'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="font-medium">{formatCurrency(product.price, product.currency)}</p>
                                                {product.tax_rate > 0 && (
                                                    <p className="text-xs text-muted-foreground">
                                                        +{product.tax_rate}% tax
                                                    </p>
                                                )}
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openEditDialog(product)} className="group/menu">
                                                        <Edit className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(product.id)}
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

            {/* Create/Edit Product Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-blue-500" />
                            {editingProduct ? 'Edit Product' : 'Add Product'}
                        </DialogTitle>
                        <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                            {editingProduct 
                                ? 'Update your product or service details'
                                : 'Add a new product or service to your catalog'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Name *</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Product or service name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Optional description"
                                rows={2}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>SKU</Label>
                                <Input
                                    value={formData.sku}
                                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                    placeholder="SKU-001"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Type</Label>
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
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Billing Period</Label>
                                <Select
                                    value={formData.billing_period || 'monthly'}
                                    onValueChange={(v) => setFormData({ ...formData, billing_period: v as any })}
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
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Price *</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.price || ''}
                                    onChange={(e) => setFormData({ ...formData, price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Tax Rate (%)</Label>
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
                                <Label htmlFor="taxable" style={{ fontFamily: '"Raleway", sans-serif' }}>Taxable</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="is_active"
                                    checked={formData.is_active}
                                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                />
                                <Label htmlFor="is_active" style={{ fontFamily: '"Raleway", sans-serif' }}>Active</Label>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} style={{ fontFamily: '"Raleway", sans-serif' }}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving || !formData.name}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            style={{ fontFamily: '"Raleway", sans-serif' }}
                        >
                            {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default ProductsPage;
