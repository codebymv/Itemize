import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArchivePage } from './ArchivePage';
import { flattenArchived } from '@/lib/archivedContent';
import type { ArchivedWorkspaceContent } from '@/services/workspaceArchiveGraphql';

const api = vi.hoisted(() => ({ getArchivedWorkspaceContentViaGraphql: vi.fn() }));
vi.mock('@/services/workspaceArchiveGraphql', () => api);
const restore = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useWorkspaceArchive', () => ({
  ARCHIVE_QUERY_KEY: ['workspace-archive'],
  useWorkspaceArchive: () => ({ archive: vi.fn(), restore }),
}));
vi.mock('@/components/layout/PageLayout', () => ({
  PageLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div><h1>{title}</h1>{children}</div>
  ),
}));

const content: ArchivedWorkspaceContent = {
  lists: [{
    id: 4, user_id: 7, title: 'Old scope', category: 'Renovation', type: 'Renovation', category_id: 1,
    items: [], color_value: '#2563eb', position_x: 0, position_y: 0, width: null, height: null, z_index: 0,
    share_token: null, is_public: false, shared_at: null, contact_id: null, contact_name: null, references: [],
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', archived_at: '2026-09-05T12:00:00.000Z',
  } as unknown as ArchivedWorkspaceContent['lists'][number]],
  notes: [],
  whiteboards: [],
  wireframes: [],
  frames: [{
    id: 1, user_id: 7, title: 'Spring campaign', category: null, color_value: '#10B981', position_x: 0, position_y: 0,
    width: 1400, height: 900, z_index: 0, contact_id: null, contact_name: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', archived_at: '2026-09-06T12:00:00.000Z',
  }],
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ArchivePage /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('ArchivePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flattens every family newest first with frames carrying no category', () => {
    expect(flattenArchived(content).map((row) => [row.type, row.title, row.category])).toEqual([
      ['frame', 'Spring campaign', null],
      ['list', 'Old scope', 'Renovation'],
    ]);
  });

  it('lists archived rows and restores one on click', async () => {
    api.getArchivedWorkspaceContentViaGraphql.mockResolvedValue(content);
    renderPage();
    expect(await screen.findByText('Spring campaign')).toBeInTheDocument();
    expect(screen.getByText('Old scope')).toBeInTheDocument();
    expect(screen.getByText('Renovation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore list Old scope' }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith('list', 4));
  });

  it('explains an empty archive', async () => {
    api.getArchivedWorkspaceContentViaGraphql.mockResolvedValue({ lists: [], notes: [], whiteboards: [], wireframes: [], frames: [] });
    renderPage();
    expect(await screen.findByText('Nothing archived')).toBeInTheDocument();
  });
});
