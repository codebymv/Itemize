import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicEstimatePage from './PublicEstimatePage';

const api = vi.hoisted(() => ({
  getPublicEstimate: vi.fn(),
  acceptPublicEstimate: vi.fn(),
  declinePublicEstimate: vi.fn(),
}));
const setTheme = vi.hoisted(() => vi.fn());

vi.mock('@/services/publicEstimatesApi', () => api);
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme }),
}));

const estimate = {
  estimate: {
    number: 'EST-00007',
    status: 'sent' as const,
    issue_date: '2026-08-20',
    valid_until: '2026-09-19',
    currency: 'USD',
    subtotal: '100.00',
    tax_amount: '0.00',
    discount_amount: '0.00',
    total: '100.00',
    notes: 'Thank you',
    terms_and_conditions: null,
    sent_at: '2026-08-20T23:52:25.821Z',
    viewed_at: null,
    accepted_at: null,
    declined_at: null,
  },
  customer: { name: 'Ada Lovelace' },
  business: { name: 'Analytical Studio', email: 'hello@example.com' },
  items: [{
    name: 'Consulting',
    description: 'Discovery session',
    quantity: '1',
    unit_price: '100.00',
    tax_rate: '0.00',
    tax_amount: '0.00',
    total: '100.00',
  }],
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/estimate/test-token']}>
    <Routes>
      <Route path="/estimate/:token" element={<PublicEstimatePage />} />
    </Routes>
  </MemoryRouter>,
);

describe('PublicEstimatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPublicEstimate.mockResolvedValue(estimate);
    api.acceptPublicEstimate.mockResolvedValue({
      ...estimate,
      estimate: { ...estimate.estimate, status: 'accepted' },
    });
  });

  it('uses the Itemize brand assets and semantic theme primitives', async () => {
    const { container } = renderPage();

    expect(await screen.findByText('Analytical Studio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Itemize home' })).toContainElement(
      screen.getByAltText('Itemize'),
    );
    expect(container.querySelector('img[src="/icon.png"]')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try Itemize' })).toHaveAttribute(
      'href',
      '/register?mode=trial',
    );
    expect(screen.queryByText('Private estimate')).not.toBeInTheDocument();
    expect(screen.getByText('your response is shared immediately')).toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass('bg-background', 'text-foreground');
    const estimateBadge = screen.getByText('EST-00007').parentElement;
    expect(estimateBadge).toHaveClass(
      'bg-primary',
      'text-primary-foreground',
    );
    expect(estimateBadge).toHaveTextContent(/^EST-00007$/);
    expect(estimateBadge?.querySelector('svg')).toBeNull();
    screen.getAllByText('Discovery session').forEach((element) => {
      expect(element).toHaveClass('text-muted-foreground');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('keeps recipient acceptance behind explicit confirmation', async () => {
    renderPage();
    await screen.findByText('Analytical Studio');

    fireEvent.click(screen.getByRole('button', { name: 'Accept estimate' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept estimate' }));

    await waitFor(() => expect(api.acceptPublicEstimate).toHaveBeenCalledWith('test-token'));
    expect(await screen.findByText('Estimate accepted')).toBeInTheDocument();
  });
});
