import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useWorkspaceActions } from './useWorkspaceActions';
import {
  WorkspaceCanvasActionsProvider,
  type WorkspaceCanvasActions,
} from '@/components/workspace/WorkspaceCanvasActions';
import { ESTIMATE_PREFILL_STATE } from '@/lib/workspaceActions';
import type { List, Note } from '@/types';

const list: List = {
  id: 'list-7',
  title: 'Kitchen scope',
  type: 'General',
  items: [{ id: 'a', text: 'Demo old cabinets', completed: false }],
  position_x: 100,
  position_y: 200,
  width: 400,
  contact_id: 12,
};

const note: Note = {
  id: 3,
  user_id: 1,
  title: 'Site visit',
  content: '<p>hi</p>',
  color_value: '#fff',
  position_x: 0,
  position_y: 0,
  width: 500,
  height: 300,
  z_index: 0,
  created_at: '2026-09-06T00:00:00.000Z',
  updated_at: '2026-09-06T00:00:00.000Z',
};

let lastLocation: ReturnType<typeof useLocation> | null = null;
const LocationProbe = () => {
  lastLocation = useLocation();
  return null;
};

const wrapperWith = (canvas: WorkspaceCanvasActions | null) =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/canvas']}>
      <WorkspaceCanvasActionsProvider value={canvas}>
        <Routes>
          <Route path="*" element={<><LocationProbe />{children}</>} />
        </Routes>
      </WorkspaceCanvasActionsProvider>
    </MemoryRouter>
  );

describe('useWorkspaceActions', () => {
  it('offers estimate promotion to lists and neighbours only on the canvas', () => {
    const canvas = { createListNear: vi.fn(), createNoteNear: vi.fn() };
    const onCanvas = renderHook(
      () => useWorkspaceActions({ source: 'list', card: list }, { onShare: vi.fn() }),
      { wrapper: wrapperWith(canvas) },
    );
    expect(onCanvas.result.current.available).toEqual([
      'turn-into-estimate', 'new-list', 'new-note', 'share', 'mention-client', 'reference-document',
    ]);

    const noteOffCanvas = renderHook(
      () => useWorkspaceActions({ source: 'note', card: note }, { onShare: vi.fn() }),
      { wrapper: wrapperWith(null) },
    );
    expect(noteOffCanvas.result.current.available).toEqual(['share', 'mention-client', 'reference-document']);
  });

  it('hands the list to the estimate editor as an id in the URL and items in router state', () => {
    const { result } = renderHook(
      () => useWorkspaceActions({ source: 'list', card: list }, { onShare: vi.fn() }),
      { wrapper: wrapperWith(null) },
    );
    act(() => result.current.run('turn-into-estimate'));
    expect(lastLocation?.pathname).toBe('/estimates/new');
    expect(lastLocation?.search).toBe('?contactId=12');
    expect(lastLocation?.state).toEqual({
      [ESTIMATE_PREFILL_STATE]: {
        source: { type: 'list', id: 'list-7', title: 'Kitchen scope' },
        lineItems: [{ name: 'Demo old cabinets' }],
      },
    });
  });

  it('leaves the URL bare for an unbound list', () => {
    const { result } = renderHook(
      () => useWorkspaceActions({ source: 'list', card: { ...list, contact_id: null } }, { onShare: vi.fn() }),
      { wrapper: wrapperWith(null) },
    );
    act(() => result.current.run('turn-into-estimate'));
    expect(lastLocation?.search).toBe('');
  });

  it('routes neighbours to the canvas with the card as anchor and share to the card', () => {
    const canvas = { createListNear: vi.fn(), createNoteNear: vi.fn() };
    const onShare = vi.fn();
    const { result } = renderHook(
      () => useWorkspaceActions({ source: 'note', card: note }, { onShare }),
      { wrapper: wrapperWith(canvas) },
    );
    act(() => result.current.run('new-list'));
    expect(canvas.createListNear).toHaveBeenCalledWith(note);
    act(() => result.current.run('new-note'));
    expect(canvas.createNoteNear).toHaveBeenCalledWith(note);
    act(() => result.current.run('share'));
    expect(onShare).toHaveBeenCalledTimes(1);
    // Door actions are the adapter's job; the runner ignores them.
    act(() => result.current.run('mention-client'));
    expect(onShare).toHaveBeenCalledTimes(1);
  });
});
