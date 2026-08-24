import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteSuggestions } from './use-note-suggestions';
import { fetchNoteSuggestions } from '@/services/aiGraphql';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('@/services/aiGraphql', () => ({
  fetchNoteSuggestions: vi.fn(),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};

describe('useNoteSuggestions request ordering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
    vi.mocked(fetchNoteSuggestions).mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores a slow response for text that has already changed', async () => {
    const first = deferred<{ suggestions: string[] }>();
    const second = deferred<{ suggestions: string[] }>();
    vi.mocked(fetchNoteSuggestions)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ noteContent }) => useNoteSuggestions({ enabled: true, noteContent }),
      { initialProps: { noteContent: 'The launch plan needs a clear owner and timeline' } },
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(fetchNoteSuggestions).toHaveBeenCalledTimes(1);

    rerender({ noteContent: 'The customer handoff needs billing details and next steps' });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(fetchNoteSuggestions).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({ suggestions: ['Confirm billing ownership'] });
      await Promise.resolve();
    });
    expect(result.current.currentSuggestion).toBe('Confirm billing ownership');

    await act(async () => { first.resolve({ suggestions: ['Publish the old launch plan'] }); });
    expect(result.current.currentSuggestion).toBe('Confirm billing ownership');
  });

  it('surfaces a client-safe provider error', async () => {
    vi.mocked(fetchNoteSuggestions).mockResolvedValue({
      suggestions: [],
      error: 'AI suggestions are temporarily unavailable',
    });

    const { result } = renderHook(() => useNoteSuggestions({
      enabled: true,
      noteContent: 'The launch plan needs a clear owner and timeline',
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
    });
    expect(result.current.error).toBe('AI suggestions are temporarily unavailable');
    expect(result.current.currentSuggestion).toBeNull();
  });

  it('explains an empty provider response instead of failing silently', async () => {
    vi.mocked(fetchNoteSuggestions).mockResolvedValue({ suggestions: [] });

    const { result } = renderHook(() => useNoteSuggestions({
      enabled: true,
      noteContent: 'The launch plan needs a clear owner and timeline',
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
    });

    expect(result.current.error).toBe('No useful suggestion yet. Add more context and try again.');
    expect(result.current.currentSuggestion).toBeNull();
  });
});
