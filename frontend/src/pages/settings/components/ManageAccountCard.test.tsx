import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let available = true;

vi.mock('./AccountDataExportCard', () => ({
  AccountDataExportAction: () => <div>Export action</div>,
}));
vi.mock('./AccountDeletionCard', () => ({
  AccountDeletionAction: () => <div>Deletion action</div>,
}));
vi.mock('./ManageSubscriptionCard', () => ({
  ManageSubscriptionAction: () => <div>Subscription action</div>,
}));
vi.mock('./useManageSubscription', () => ({
  useManageSubscription: () => ({ available, opening: false, open: vi.fn() }),
}));

import { ManageAccountCard } from './ManageAccountCard';

describe('ManageAccountCard', () => {
  beforeEach(() => {
    available = true;
  });

  it('puts subscription, export, and deletion on one row for a live paid plan', () => {
    const { container } = render(<ManageAccountCard />);

    expect(screen.getByText('Manage account')).toBeInTheDocument();
    const cells = [...container.querySelectorAll('.grid > div')].map(cell => cell.textContent);
    expect(cells).toEqual(['Subscription action', 'Export action', 'Deletion action']);
    expect(container.querySelector('.grid')).toHaveClass('md:grid-cols-3');
  });

  it('keeps export and deletion only when there is no subscription to manage', () => {
    available = false;
    const { container } = render(<ManageAccountCard />);

    expect(screen.queryByText('Subscription action')).not.toBeInTheDocument();
    expect(screen.getByText('Export action')).toBeInTheDocument();
    expect(screen.getByText('Deletion action')).toBeInTheDocument();
    expect(container.querySelector('.grid')).toHaveClass('md:grid-cols-2');
  });
});
