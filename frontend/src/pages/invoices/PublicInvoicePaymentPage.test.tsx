import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicInvoicePaymentPage from './PublicInvoicePaymentPage';

const api = vi.hoisted(() => ({ getPublicInvoicePaymentResult: vi.fn() }));
vi.mock('@/services/publicInvoicePaymentsApi', () => api);
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

describe('PublicInvoicePaymentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPublicInvoicePaymentResult.mockResolvedValue({
      invoiceNumber: 'INV-00003',
      businessName: 'Itemize Studio',
      amount: '125.00',
      currency: 'USD',
      status: 'paid',
      updatedAt: '2026-08-26T12:00:00.000Z',
    });
  });

  it('renders a branded public receipt without requiring app authentication', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/invoice/payment/success?session_id=cs_test_Receipt123']}>
        <PublicInvoicePaymentPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Payment received' })).toBeInTheDocument();
    expect(screen.getByText('INV-00003')).toBeInTheDocument();
    expect(screen.getByText('$125.00')).toBeInTheDocument();
    expect(screen.getByText(/Itemize Studio has been notified/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Itemize home' })).toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass('bg-background', 'text-foreground');
    expect(api.getPublicInvoicePaymentResult).toHaveBeenCalledWith('cs_test_Receipt123');
  });

  it('uses a calm, explicit cancellation state without querying payment data', () => {
    render(
      <MemoryRouter initialEntries={['/invoice/payment/cancelled']}>
        <PublicInvoicePaymentPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Payment not completed' })).toBeInTheDocument();
    expect(screen.getByText(/No payment was recorded/)).toBeInTheDocument();
    expect(api.getPublicInvoicePaymentResult).not.toHaveBeenCalled();
  });
});
