import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentEditorPage } from './SegmentEditorPage';

const getSegmentEditorBootstrap = vi.fn();

vi.mock('@/services/segmentsApi', () => ({
  createSegment: vi.fn(),
  previewSegment: vi.fn(),
  updateSegment: vi.fn(),
}));

vi.mock('@/services/segmentsGraphql', () => ({
  getSegmentEditorBootstrapViaGraphql: (...args: unknown[]) => getSegmentEditorBootstrap(...args),
}));

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({ organizationId: 7, isLoading: false, error: null }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => ({ confirmLeave: () => true }) }));
vi.mock('@/components/layout/PageLayout', () => ({
  PageLayout: ({ title, headerTools, children }: { title: string; headerTools?: { status?: ReactNode; primaryAction?: ReactNode }; children: ReactNode }) => <main><h1>{title}</h1>{headerTools?.status}{headerTools?.primaryAction}{children}</main>,
}));
vi.mock('@/components/layout/ShellBackButton', () => ({ ShellBackButton: () => <button type="button">Back</button> }));
vi.mock('@/components/layout/DesktopHeaderTools', () => ({
  HeaderAction: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => <button type="button" onClick={onClick} disabled={disabled}>{label}</button>,
}));

describe('SegmentEditorPage', () => {
  beforeEach(() => {
    getSegmentEditorBootstrap.mockResolvedValue({
      segment: null,
      filterOptions: {
        fields: [{ id: 'status', label: 'Status', type: 'select', operators: ['equals'], options: ['active', 'inactive'] }],
        tags: [], users: [], pipelines: [],
      },
    });
  });

  it('uses a durable full-page editor and expands matching rules inline', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/segments/new']}>
          <Routes><Route path="/segments/new" element={<SegmentEditorPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'NEW SEGMENT' })).toBeInTheDocument();
    expect(screen.getByText('Segment settings')).toBeInTheDocument();
    expect(screen.getByText('Audience preview')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Add condition' })[0]);

    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Rule')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove condition 1' })).toBeInTheDocument();
  });
});
