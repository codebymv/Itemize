import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadOnStaleChunk } from './reloadOnStaleChunk';

describe('reloadOnStaleChunk', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('reloads once when a Vite preload fails after a deploy', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    reloadOnStaleChunk();

    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads when a dynamic import rejects with a stale-chunk message', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    reloadOnStaleChunk();

    const event = new Event('unhandledrejection', { cancelable: true }) as Event & {
      reason: Error;
    };
    event.reason = new Error('Failed to fetch dynamically imported module');
    window.dispatchEvent(event);

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
