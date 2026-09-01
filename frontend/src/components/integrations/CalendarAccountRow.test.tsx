import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncCalendar, type CalendarConnection, type SyncResult } from '@/services/calendarIntegrationsApi';
import { CalendarAccountRow } from './CalendarAccountRow';

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/services/calendarIntegrationsApi', () => ({ syncCalendar: vi.fn() }));
vi.mock('@/components/brand/IntegrationProviderMark', () => ({
  IntegrationProviderMark: () => <span>Calendar</span>,
}));

const connection = (id: number): CalendarConnection => ({
  id,
  provider: 'google',
  provider_email: `calendar-${id}@example.test`,
  sync_enabled: true,
  sync_direction: 'both',
  last_sync_at: null,
  is_active: true,
  error_message: null,
  error_count: 0,
  selected_calendars: ['primary'],
  created_at: '2026-08-31T00:00:00.000Z',
  updated_at: '2026-08-31T00:00:00.000Z',
});

const result = (connectionId: number, created = true): SyncResult => ({
  message: created ? 'Sync queued' : 'Sync already queued',
  created,
  job: {
    id: connectionId + 100,
    connection_id: connectionId,
    direction: 'both',
    status: 'queued',
    attempt_count: 0,
    next_attempt_at: '2026-08-31T00:00:00.000Z',
    result: null,
    last_error: null,
    completed_at: null,
    created_at: '2026-08-31T00:00:00.000Z',
    updated_at: '2026-08-31T00:00:00.000Z',
  },
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
};

describe('CalendarAccountRow sync lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let sequence = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `calendar-sync-request-${++sequence}` });
  });

  it('coalesces duplicate events per row while allowing separate accounts to sync concurrently', async () => {
    const first = deferred<SyncResult>();
    const second = deferred<SyncResult>();
    vi.mocked(syncCalendar)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(
      <>
        <CalendarAccountRow connection={connection(4)} organizationId={3} onDisconnect={vi.fn()} />
        <CalendarAccountRow connection={connection(5)} organizationId={3} onDisconnect={vi.fn()} />
      </>,
    );

    const [firstSync, secondSync] = screen.getAllByRole('button', { name: 'Sync' });
    fireEvent.click(firstSync);
    fireEvent.click(firstSync);
    fireEvent.click(secondSync);

    expect(syncCalendar).toHaveBeenCalledTimes(2);
    expect(syncCalendar).toHaveBeenNthCalledWith(1, 4, 3, 'calendar-sync-request-1');
    expect(syncCalendar).toHaveBeenNthCalledWith(2, 5, 3, 'calendar-sync-request-2');
    expect(firstSync).toHaveAttribute('aria-busy', 'true');
    expect(secondSync).toHaveAttribute('aria-busy', 'true');

    first.resolve(result(4));
    second.resolve(result(5));
    await waitFor(() => expect(firstSync).not.toBeDisabled());
    await waitFor(() => expect(secondSync).not.toBeDisabled());
  });

  it('retains the key after an unconfirmed failure and rotates it when row scope changes', async () => {
    vi.mocked(syncCalendar)
      .mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockRejectedValueOnce(new Error('Connection interrupted again'))
      .mockRejectedValueOnce(new Error('Provider unavailable'));
    const { rerender } = render(
      <CalendarAccountRow connection={connection(4)} organizationId={3} onDisconnect={vi.fn()} />,
    );

    let sync = screen.getByRole('button', { name: 'Sync' });
    fireEvent.click(sync);
    await waitFor(() => expect(sync).not.toBeDisabled());
    fireEvent.click(sync);
    await waitFor(() => expect(syncCalendar).toHaveBeenCalledTimes(2));

    rerender(<CalendarAccountRow connection={connection(4)} organizationId={8} onDisconnect={vi.fn()} />);
    sync = screen.getByRole('button', { name: 'Sync' });
    fireEvent.click(sync);
    await waitFor(() => expect(syncCalendar).toHaveBeenCalledTimes(3));

    expect(vi.mocked(syncCalendar).mock.calls.map((call) => call[2])).toEqual([
      'calendar-sync-request-1',
      'calendar-sync-request-1',
      'calendar-sync-request-2',
    ]);
  });

  it('surfaces an existing job as recovery and preserves confirmation across follow-up failure', async () => {
    vi.mocked(syncCalendar).mockResolvedValue(result(4, false));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSyncConfirmed = vi.fn(() => { throw new Error('Refresh failed'); });
    render(
      <CalendarAccountRow
        connection={connection(4)}
        organizationId={3}
        onDisconnect={vi.fn()}
        onSyncConfirmed={onSyncConfirmed}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sync' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Sync already queued',
      description: 'The existing calendar sync request is still active.',
    }));

    expect(onSyncConfirmed).toHaveBeenCalledWith(expect.objectContaining({ created: false }));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({
      title: 'Unable to queue sync',
    }));
    expect(consoleError).toHaveBeenCalledWith(
      'Calendar sync queued, but follow-up UI work failed:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
