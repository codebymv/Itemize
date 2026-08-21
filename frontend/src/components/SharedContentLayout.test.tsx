import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SharedContentLayout } from './SharedContentLayout';
import { SharedItemCard } from './public/BrandedPublicPage';

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

describe('workspace share public shell', () => {
  it('uses the estimate-derived brand shell and current product copy', () => {
    const { container } = render(
      <SharedContentLayout title="Roadmap" contentType="note">
        <SharedItemCard
          title="Roadmap"
          contentType="note"
          category="Planning"
          creatorName="Ada Lovelace"
          createdAt="2026-08-20T12:00:00.000Z"
          isLive
          accentColor="#8b5cf6"
        >
          <p>Shared content</p>
        </SharedItemCard>
      </SharedContentLayout>,
    );

    expect(screen.getByRole('link', { name: 'Itemize home' })).toContainElement(
      screen.getByAltText('Itemize'),
    );
    expect(container.querySelector('main')).toHaveClass('bg-background', 'text-foreground');
    expect(screen.getByText('Shared Note')).toHaveClass('text-muted-foreground');
    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    expect(screen.getByText(/Shared by Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText('Planning')).toHaveClass('bg-secondary', 'text-secondary-foreground');
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bring your work together' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try Itemize' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start Free Trial' })).toHaveAttribute(
      'href',
      '/register?mode=trial',
    );
    expect(screen.getByText(/private link provides access to this note/i)).toBeInTheDocument();
    expect(screen.queryByText(/Create your own note/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('uses stronger private-link guidance for vaults', () => {
    render(
      <SharedContentLayout title="Credentials" contentType="vault" showCTA={false}>
        <p>Vault content</p>
      </SharedContentLayout>,
    );

    expect(screen.getByText(/Treat it like the information it contains/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bring your work together' })).not.toBeInTheDocument();
  });
});
