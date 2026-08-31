import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProductPageViaGraphql } from '@/services/productsGraphql';
import { ProductCatalogPicker } from './ProductCatalogPicker';

vi.mock('@/services/productsGraphql', () => ({
  getProductPageViaGraphql: vi.fn(),
}));

const product = {
  id: 21,
  organization_id: 42,
  name: 'Workshop',
  sku: 'WORK-01',
  price: 125,
  currency: 'USD',
  product_type: 'one_time' as const,
  tax_rate: 0,
  taxable: true,
  is_active: true,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

describe('ProductCatalogPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(getProductPageViaGraphql).mockResolvedValue({
      products: [product],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
      stats: { total: 1, active: 1, inactive: 0, oneTime: 1, recurring: 0 },
    });
  });

  it('keeps the catalog lazy and returns the selected product', async () => {
    const onSelect = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProductCatalogPicker organizationId={42} onSelect={onSelect} />
      </QueryClientProvider>,
    );

    expect(getProductPageViaGraphql).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('combobox'));
    expect(await screen.findByText('Workshop')).toBeInTheDocument();
    expect(getProductPageViaGraphql).toHaveBeenCalledWith(
      { page: 1, limit: 25, search: undefined, is_active: true },
      42,
      expect.any(AbortSignal),
    );

    fireEvent.click(screen.getByText('Workshop'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(product));
  });
});
