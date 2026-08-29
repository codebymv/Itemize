import { describe, expect, it } from 'vitest';
import type { Product } from '@/services/invoicesApi';
import {
    filterProductCatalog,
    getProductCatalogStats,
    getProductTaxInclusiveTotal,
} from './productCatalog';

const products: Product[] = [
    {
        id: 1,
        organization_id: 10,
        name: 'Brand strategy',
        description: 'Discovery and positioning',
        sku: 'BRAND-01',
        price: 2400,
        currency: 'USD',
        product_type: 'one_time',
        tax_rate: 0,
        taxable: false,
        is_active: true,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 2,
        organization_id: 10,
        name: 'Monthly support',
        description: 'Ongoing product support',
        sku: 'SUPPORT-01',
        price: 750,
        currency: 'USD',
        product_type: 'recurring',
        billing_period: 'monthly',
        tax_rate: 8.5,
        taxable: true,
        is_active: true,
        created_at: '2026-08-02T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:00.000Z',
    },
    {
        id: 3,
        organization_id: 10,
        name: 'Legacy audit',
        price: 900,
        currency: 'USD',
        product_type: 'one_time',
        tax_rate: 0,
        taxable: false,
        is_active: false,
        created_at: '2026-08-03T00:00:00.000Z',
        updated_at: '2026-08-03T00:00:00.000Z',
    },
];

describe('product catalog helpers', () => {
    it('defaults cleanly to active catalog items', () => {
        expect(filterProductCatalog(products, {
            searchQuery: '',
            status: 'active',
            type: 'all',
        }).map((product) => product.id)).toEqual([1, 2]);
    });

    it('combines status, type, and text filters', () => {
        expect(filterProductCatalog(products, {
            searchQuery: 'support-01',
            status: 'all',
            type: 'recurring',
        }).map((product) => product.id)).toEqual([2]);
    });

    it('summarizes the whole catalog independently of the current filters', () => {
        expect(getProductCatalogStats(products)).toEqual({
            active: 2,
            inactive: 1,
            oneTime: 2,
            recurring: 1,
        });
    });

    it('calculates a currency-safe tax-inclusive product total', () => {
        expect(getProductTaxInclusiveTotal(products[1])).toBe(813.75);
        expect(getProductTaxInclusiveTotal({
            price: 3980,
            taxable: true,
            tax_rate: 8.25,
        })).toBe(4308.35);
    });

    it('keeps the base price when tax does not apply', () => {
        expect(getProductTaxInclusiveTotal(products[0])).toBe(2400);
    });
});
