import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeaderProvider, useHeader } from '@/contexts/HeaderContext';
import { PageLayout } from './PageLayout';
import { PAGE_TITLE_CLASS } from '@/hooks/usePageHeader';

function HeaderSlot() {
  const { headerContent, desktopTools } = useHeader();
  return (
    <div data-testid="app-header">
      {headerContent}
      <div data-testid="desktop-tools">{desktopTools}</div>
    </div>
  );
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
    expect(icon.parentElement).toHaveClass('inline-flex', 'shrink-0');
    expect(icon.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(icon.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading).not.toHaveClass('truncate', 'overflow-hidden', 'text-ellipsis');
    expect(heading).toHaveClass('whitespace-normal', 'md:whitespace-nowrap');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('keeps page actions out of the shell identity header', () => {
    renderLayout(
      <PageLayout title="INVOICES" pageActions={<button type="button">New invoice</button>}>
        Body
      </PageLayout>
    );

    const header = screen.getByTestId('app-header');
    const actionRegion = screen.getByRole('region', { name: 'INVOICES actions' });
    const action = screen.getByRole('button', { name: 'New invoice' });
    expect(actionRegion).toContainElement(action);
    expect(header).not.toContainElement(action);
  });

  it('renders named desktop tools in query-to-primary order', () => {
    renderLayout(
      <PageLayout
        title="CONTENTS"
        desktopTools={{
          search: <button type="button">Search</button>,
          filters: <button type="button">Filters</button>,
          combinedQuery: <button type="button">Search and filters</button>,
          secondaryAction: <button type="button">Canvas</button>,
          primaryAction: <button type="button">Add</button>,
        }}
      >
        Body
      </PageLayout>
    );

    const tools = screen.getByTestId('desktop-tools');
    const search = screen.getByRole('button', { name: 'Search' });
    const filters = screen.getByRole('button', { name: 'Filters' });
    const secondary = screen.getByRole('button', { name: 'Canvas' });
    const primary = screen.getByRole('button', { name: 'Add' });
    expect(tools.querySelector('[data-desktop-header-tools]')).toBeInTheDocument();
    expect(search.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filters.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(secondary.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'CONTENTS actions' })).not.toBeInTheDocument();
  });

  it('keeps a secondary-only command secondary when no primary action exists', () => {
    renderLayout(
      <PageLayout
        title="SHARED"
        desktopTools={{
          search: <button type="button">Search shared content</button>,
          secondaryAction: <button type="button">Canvas</button>,
        }}
      >
        Body
      </PageLayout>
    );

    const tools = screen.getByTestId('desktop-tools');
    expect(tools.querySelector('.desktop-header-tools__secondary')).toContainElement(
      screen.getByRole('button', { name: 'Canvas' }),
    );
    expect(tools.querySelector('.desktop-header-tools__primary')).toBeNull();
  });

  it('renders compact section navigation in the shell until wide navigation takes over', () => {
    renderLayout(
      <PageLayout
        title="ORGANIZATION"
        compactNavigation={<button type="button">Choose settings section</button>}
        navigationBreakpoint="wide"
        nav={<nav aria-label="Settings sections">Organization</nav>}
      >
        Body
      </PageLayout>
    );

    const header = screen.getByTestId('app-header');
    const compactNavigation = header.querySelector('[data-page-header-compact-navigation]');
    expect(compactNavigation).toHaveClass('lg:hidden');
    expect(compactNavigation).toContainElement(
      screen.getByRole('button', { name: 'Choose settings section' }),
    );
    expect(screen.getByRole('heading', { name: 'ORGANIZATION' }).parentElement).toHaveClass(
      'hidden',
      'lg:flex',
    );
  });

  it('renders mobile actions in the mobile controls bar', () => {
    const { container } = renderLayout(
      <PageLayout title="CONTACTS" mobileActions={<button type="button">Add Contact</button>}>
        Body
      </PageLayout>
    );

    expect(screen.getByRole('button', { name: 'Add Contact' })).toBeInTheDocument();
    expect(container.querySelector('[data-mobile-controls-bar]')).toBeInTheDocument();
  });

  it('renders responsive header tools without creating a duplicate mobile body bar', () => {
    const { container } = renderLayout(
      <PageLayout
        title="DASHBOARD"
        headerTools={{
          filters: <button type="button">Performance period</button>,
          secondaryAction: <button type="button">Canvas</button>,
        }}
      >
        Body
      </PageLayout>,
    );

    expect(screen.getAllByRole('button', { name: 'Performance period' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Canvas' })).toHaveLength(2);
    expect(container.querySelector('[data-mobile-controls-bar]')).toBeNull();
    expect(container.querySelector('[data-responsive-header-tools]')).toBeInTheDocument();
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
    expect(back.parentElement).toHaveClass('h-11', 'w-11');
    expect(header.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
