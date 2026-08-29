import { render, screen } from '@testing-library/react';
import type { PropsWithChildren, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminPage } from './AdminPage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuthState: () => ({ currentUser: { role: 'ADMIN' } }),
}));

vi.mock('@/components/layout/PageLayout', () => ({
  PageLayout: ({ title, icon, children }: PropsWithChildren<{
    title: ReactNode;
    icon?: ReactNode;
  }>) => (
    <>
      <header>
        <span>{icon}</span>
        <h1>{title}</h1>
      </header>
      {children}
    </>
  ),
}));

vi.mock('./admin', () => ({
  AdminNav: () => <nav>Admin navigation</nav>,
  AdminShellNavigation: () => <button type="button">Choose admin section</button>,
  CommunicationsSection: () => <div>Communications content</div>,
  StatisticsSection: () => <div>Statistics content</div>,
  OperationsSection: () => <div>Operations content</div>,
  ChangeTierSection: () => <div>Change tier content</div>,
}));

describe('AdminPage header', () => {
  it.each([
    ['/admin', 'COMMUNICATIONS'],
    ['/admin/stats', 'STATISTICS'],
    ['/admin/operations', 'OPERATIONS'],
    ['/admin/change-tier', 'CHANGE TIER'],
  ])('uses a static section icon for %s', (path, title) => {
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/*" element={<AdminPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    const icon = container.querySelector('header svg');
    expect(icon).not.toBeNull();
    expect(icon).not.toHaveClass('animate-spin');
  });
});
