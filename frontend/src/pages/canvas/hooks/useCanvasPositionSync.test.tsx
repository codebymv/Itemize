import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateCanvasPositions } from '@/services/api';
import { POSITION_UPDATE_DEBOUNCE_MS, POSITION_UPDATE_RETRY_MS } from '../constants/canvasConstants';
import { useCanvasPositionSync } from './useCanvasPositionSync';

vi.mock('@/services/api', () => ({
  updateCanvasPositions: vi.fn(),
}));

const position = (x: number) => ({
  type: 'list' as const,
  id: 4,
  position_x: x,
  position_y: 20,
});

describe('useCanvasPositionSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let key = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => `position-attempt-${++key}`),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('coalesces repeated movement for one item before the debounce flush', async () => {
    vi.mocked(updateCanvasPositions).mockResolvedValue({
      updated: [],
      failed: [],
    });
    const { result } = renderHook(() => useCanvasPositionSync());

    act(() => {
      result.current.enqueuePositionUpdate(position(10));
      result.current.enqueuePositionUpdate(position(12));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POSITION_UPDATE_DEBOUNCE_MS);
    });

    expect(updateCanvasPositions).toHaveBeenCalledTimes(1);
    expect(updateCanvasPositions).toHaveBeenCalledWith(
      [position(12)],
      'position-attempt-1',
    );
  });

  it('reuses the mutation ID when an unchanged batch is retried ambiguously', async () => {
    vi.mocked(updateCanvasPositions)
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce({ updated: [], failed: [] });
    const { result } = renderHook(() => useCanvasPositionSync());

    act(() => result.current.enqueuePositionUpdate(position(12)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POSITION_UPDATE_DEBOUNCE_MS);
      await vi.advanceTimersByTimeAsync(POSITION_UPDATE_RETRY_MS);
    });

    expect(updateCanvasPositions).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateCanvasPositions).mock.calls.map((call) => call[1]))
      .toEqual(['position-attempt-1', 'position-attempt-1']);
  });

  it('does not replace a newer queued position with stale retry data', async () => {
    let rejectFirst!: (reason?: unknown) => void;
    const firstAttempt = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject;
    });
    vi.mocked(updateCanvasPositions)
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValueOnce({ updated: [], failed: [] });
    const { result } = renderHook(() => useCanvasPositionSync());

    act(() => result.current.enqueuePositionUpdate(position(10)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POSITION_UPDATE_DEBOUNCE_MS);
    });
    act(() => result.current.enqueuePositionUpdate(position(30)));
    await act(async () => {
      rejectFirst(new Error('connection lost'));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POSITION_UPDATE_DEBOUNCE_MS);
    });

    expect(updateCanvasPositions).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateCanvasPositions).mock.calls[1]).toEqual([
      [position(30)],
      'position-attempt-2',
    ]);
  });
});
