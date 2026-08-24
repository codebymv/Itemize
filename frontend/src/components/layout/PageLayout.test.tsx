import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeaderProvider, useHeader } from '@/contexts/HeaderContext';
import { PageLayout } from './PageLayout';
import { PAGE_TITLE_CLASS } from '@/hooks/usePageHeader';

function HeaderSlot() {
  const { headerContent } = useHeader();
  return <div data-testid="app-header">{headerContent}</div>;
}

function renderLayout(ui: React.ReactElement) {
  return render(
    <HeaderProvider>
      <HeaderSlot />
      {ui}
    </HeaderProvider>
  );
}

describe('PageLayout', () => {
  it('renders the canonical italic page title in the shell header', () => {
    renderLayout(
      <PageLayout title="CONTACTS" icon={<span data-testid="page-icon" />}>
        <p>Body</p>
      </PageLayout>
    );

    const heading = screen.getByRole('heading', { name: 'CONTACTS' });
    expect(heading.tagName).toBe('H1');
    expect(heading).toHaveClass(...PAGE_TITLE_CLASS.split(' '));
    expect(screen.getByTestId('app-header')).toContainElement(heading);
    const icon = screen.getByTestId('page-icon');
    expect(icon).toBeInTheDocument();
    expect(icon.parentElement).toHaveClass('hidden', 'md:inline-flex');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('renders mobile actions in the mobile controls bar', () => {
    renderLayout(
      <PageLayout title="CONTACTS" mobileActions={<button type="button">Add Contact</button>}>
        Body
      </PageLayout>
    );

    expect(screen.getByRole('button', { name: 'Add Contact' })).toBeInTheDocument();
  });

  it('omits the mobile bar when mobileActions is omitted', () => {
    const { container } = renderLayout(
      <PageLayout title="CONTACTS">Body</PageLayout>
    );

    expect(container.querySelector('.md\\:hidden')).toBeNull();
  });

  it('flush frame skips the page surface', () => {
    const { container } = renderLayout(
      <PageLayout title="CANVAS" frame="flush">
        <div data-testid="canvas-body">Canvas</div>
      </PageLayout>
    );

    expect(screen.getByTestId('canvas-body')).toBeInTheDocument();
    expect(container.querySelector('.sm\\:bg-card')).toBeNull();
  });

  it('split frame uses a flush inner surface', () => {
    const { container } = renderLayout(
      <PageLayout title="INBOX" frame="split">
        Split
      </PageLayout>
    );

    expect(container.querySelector('.sm\\:p-0')).not.toBeNull();
    expect(container.querySelector('.p-0')).not.toBeNull();
  });

  it('renders a nav column beside the surface', () => {
    renderLayout(
      <PageLayout title="SETTINGS" nav={<nav aria-label="Settings">Account</nav>}>
        Profile
      </PageLayout>
    );

    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('allows pages to tighten the mobile navigation gap', () => {
    const { container } = renderLayout(
      <PageLayout
        title="SETTINGS"
        nav={<nav aria-label="Settings">Account</nav>}
        navigationClassName="gap-0 md:gap-8"
      >
        Profile
      </PageLayout>
    );

    expect(container.querySelector('.gap-0')).not.toBeNull();
    expect(container.querySelector('.md\\:gap-8')).not.toBeNull();
  });

  it('can defer split navigation until a wider viewport', () => {
    const { container } = renderLayout(
      <PageLayout
        title="SETTINGS"
        nav={<nav aria-label="Settings">Account</nav>}
        navigationBreakpoint="wide"
      >
        Profile
      </PageLayout>
    );

    expect(container.querySelector('.lg\\:flex-row')).not.toBeNull();
    expect(container.querySelector('.lg\\:gap-8')).not.toBeNull();
  });

  it('places leading chrome before the title', () => {
    renderLayout(
      <PageLayout title="ALEX" leading={<button type="button">Back</button>}>
        Detail
      </PageLayout>
    );

    const header = screen.getByTestId('app-header');
    const back = screen.getByRole('button', { name: 'Back' });
    const title = screen.getByRole('heading', { name: 'ALEX' });
    expect(header.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
