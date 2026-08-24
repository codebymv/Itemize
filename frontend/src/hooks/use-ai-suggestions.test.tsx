import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAISuggestions } from './use-ai-suggestions';
import { fetchListSuggestions } from '@/services/aiGraphql';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('@/services/aiGraphql', () => ({
  fetchListSuggestions: vi.fn(),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};

describe('useAISuggestions request ordering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
    vi.mocked(fetchListSuggestions).mockReset();
    localStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  it('does not show results generated for an older list state', async () => {
    const first = deferred<{ suggestions: string[] }>();
    const second = deferred<{ suggestions: string[] }>();
    vi.mocked(fetchListSuggestions)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ existingItems }) => useAISuggestions({ enabled: true, listTitle: 'Launch', existingItems }),
      { initialProps: { existingItems: ['Confirm pricing'] } },
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(fetchListSuggestions).toHaveBeenCalledTimes(1);

    rerender({ existingItems: ['Confirm pricing', 'Publish landing page'] });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
    expect(fetchListSuggestions).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({ suggestions: ['Schedule launch review'] });
      await Promise.resolve();
    });
    expect(result.current.currentSuggestion).toBe('Schedule launch review');

    await act(async () => {
      first.resolve({ suggestions: ['Old result'] });
      await Promise.resolve();
    });
    expect(result.current.currentSuggestion).toBe('Schedule launch review');
  });

  it('surfaces provider payload errors', async () => {
    vi.mocked(fetchListSuggestions).mockResolvedValue({ suggestions: [], error: 'Suggestion limit reached' });
    const { result } = renderHook(() => useAISuggestions({
      enabled: true,
      listTitle: 'Launch',
      existingItems: ['Confirm pricing'],
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    expect(result.current.error).toBe('Suggestion limit reached');
    expect(result.current.currentSuggestion).toBeNull();
  });
});
