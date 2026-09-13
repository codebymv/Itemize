import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEmailOutcomeRefresh } from './useEmailOutcomeRefresh';
afterEach(()=>{ vi.useRealTimers(); vi.restoreAllMocks(); });
describe('email outcome refresh',()=>{
  it('refreshes visibly, stops after ten minutes even without successful updates, and cleans up',()=>{
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-13T00:00:00Z'));
    vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
    const refresh=vi.fn().mockResolvedValue(undefined);
    const records=[{updated_at:new Date().toISOString()}];
    const {unmount}=renderHook(()=>useEmailOutcomeRefresh(records,refresh));
    act(()=>vi.advanceTimersByTime(15000)); expect(refresh).toHaveBeenCalledWith(true);
    act(()=>vi.advanceTimersByTime(600000)); const count=refresh.mock.calls.length;
    act(()=>vi.advanceTimersByTime(60000)); expect(refresh).toHaveBeenCalledTimes(count);
    unmount(); act(()=>window.dispatchEvent(new Event('focus'))); expect(refresh).toHaveBeenCalledTimes(count);
  });
  it('does not poll hidden tabs',()=>{
    vi.useFakeTimers(); vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
    const refresh=vi.fn().mockResolvedValue(undefined);
    const {unmount}=renderHook(()=>useEmailOutcomeRefresh([{updated_at:new Date().toISOString()}],refresh));
    act(()=>vi.advanceTimersByTime(15000)); expect(refresh).not.toHaveBeenCalled(); unmount();
  });
});
