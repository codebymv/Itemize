import type { Product } from '@/services/invoicesApi';

export type ProductStatusFilter = 'active' | 'inactive' | 'all';
export type ProductTypeFilter = Product['product_type'] | 'all';

export interface ProductCatalogFilters {
    searchQuery: string;
    status: ProductStatusFilter;
    type: ProductTypeFilter;
}

export interface ProductCatalogStats {
    active: number;
    inactive: number;
    oneTime: number;
    recurring: number;
}

export function filterProductCatalog(
    products: Product[],
    filters: ProductCatalogFilters,
): Product[] {
    const query = filters.searchQuery.trim().toLocaleLowerCase();

    return products.filter((product) => {
        const matchesStatus = filters.status === 'all'
            || (filters.status === 'active' ? product.is_active : !product.is_active);
        const matchesType = filters.type === 'all' || product.product_type === filters.type;
        const searchableText = [product.name, product.sku, product.description]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase();

        return matchesStatus && matchesType && (!query || searchableText.includes(query));
    });
}

export function getProductCatalogStats(products: Product[]): ProductCatalogStats {
    return products.reduce<ProductCatalogStats>((stats, product) => {
        if (product.is_active) stats.active += 1;
        else stats.inactive += 1;

        if (product.product_type === 'recurring') stats.recurring += 1;
        else stats.oneTime += 1;

        return stats;
    }, {
        active: 0,
        inactive: 0,
        oneTime: 0,
        recurring: 0,
    });
}

export function getProductTaxInclusiveTotal(
    product: Pick<Product, 'price' | 'taxable' | 'tax_rate'>,
): number {
    if (!product.taxable || product.tax_rate <= 0) return product.price;

    const total = product.price * (1 + product.tax_rate / 100);
    return Math.round((total + Number.EPSILON) * 100) / 100;
}
