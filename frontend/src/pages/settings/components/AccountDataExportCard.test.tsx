import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDataExportAction } from './AccountDataExportCard';

const mocks = vi.hoisted(() => ({
  exportData: vi.fn(),
  toast: vi.fn(),
  createObjectURL: vi.fn(() => 'blob:itemize-export'),
  revokeObjectURL: vi.fn(),
}));

vi.mock('@/services/authGraphql', () => ({
  getViewerDataExportViaGraphql: (...args: unknown[]) => mocks.exportData(...args),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

describe('AccountDataExportAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', {
      createObjectURL: mocks.createObjectURL,
      revokeObjectURL: mocks.revokeObjectURL,
    });
    mocks.exportData.mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-08-27T12:00:00.000Z',
      filename: 'itemize-account-export-2026-08-27.json',
      data: { account: { email: 'member@example.com' }, memberships: [] },
    });
  });

  it('downloads the versioned export and reports completion', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<AccountDataExportAction />);

    fireEvent.click(screen.getByRole('button', { name: 'Download JSON export' }));

    await waitFor(() => expect(mocks.exportData).toHaveBeenCalledTimes(1));
    expect(click).toHaveBeenCalledTimes(1);
    expect(mocks.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:itemize-export');
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Account export downloaded',
    }));
    click.mockRestore();
  });

  it('shows a destructive error without creating a download', async () => {
    mocks.exportData.mockRejectedValue(new Error('Export unavailable'));
    render(<AccountDataExportAction />);

    fireEvent.click(screen.getByRole('button', { name: 'Download JSON export' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Could not export account data',
      description: 'Export unavailable',
      variant: 'destructive',
    }));
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });
});
