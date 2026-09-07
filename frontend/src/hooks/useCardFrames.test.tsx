import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useCardFrames } from './useCardFrames';
import {
  WorkspaceCanvasActionsProvider,
  type WorkspaceCanvasActions,
} from '@/components/workspace/WorkspaceCanvasActions';
import type { List, WorkspaceFrame } from '@/types';

const frame = (values: Partial<WorkspaceFrame>): WorkspaceFrame => ({
  id: 1,
  user_id: 7,
  title: 'Sanchez kitchen',
  category: null,
  color_value: '#3B82F6',
  position_x: 1000,
  position_y: 1000,
  width: 1400,
  height: 900,
  z_index: 0,
  contact_id: null,
  contact_name: null,
  created_at: '2026-09-06T00:00:00.000Z',
  updated_at: '2026-09-06T00:00:00.000Z',
  archived_at: null,
  ...values,
});

const list: List = {
  id: 5,
  title: 'Scope',
  type: 'Renovation',
  items: [],
  position_x: 1100,
  position_y: 1200,
  width: 400,
  height: 300,
};

const wrapperWith = (canvas: WorkspaceCanvasActions | null) =>
  ({ children }: { children: ReactNode }) => (
    <WorkspaceCanvasActionsProvider value={canvas}>{children}</WorkspaceCanvasActionsProvider>
  );

describe('useCardFrames', () => {
  it('is absent off the canvas', () => {
    const { result } = renderHook(() => useCardFrames({ source: 'list', card: list }), { wrapper: wrapperWith(null) });
    expect(result.current).toBeUndefined();
  });

  it('knows which frame holds the card and asks the canvas to move it by kind, not category', () => {
    const canvas: WorkspaceCanvasActions = {
      createListNear: vi.fn(),
      createNoteNear: vi.fn(),
      frames: [frame({ id: 1 }), frame({ id: 2, title: 'Spring campaign', position_x: 5000, position_y: 5000 })],
      moveCardToFrame: vi.fn(),
    };
    const { result } = renderHook(() => useCardFrames({ source: 'list', card: list }), { wrapper: wrapperWith(canvas) });
    expect(result.current?.currentFrameId).toBe(1);
    expect(result.current?.frames).toHaveLength(2);

    result.current?.moveTo(2);
    expect(canvas.moveCardToFrame).toHaveBeenCalledWith(expect.objectContaining({ type: 'list', id: 5, position_x: 1100 }), 2);
  });
});
