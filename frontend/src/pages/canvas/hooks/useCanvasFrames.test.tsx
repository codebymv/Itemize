import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasFrames } from './useCanvasFrames';
import type { List, Note, WorkspaceFrame } from '@/types';

const framesApi = vi.hoisted(() => ({
  createWorkspaceFrameViaGraphql: vi.fn(),
  updateWorkspaceFrameViaGraphql: vi.fn(),
  deleteWorkspaceFrameViaGraphql: vi.fn(),
}));
vi.mock('@/services/workspaceFramesGraphql', () => framesApi);
vi.mock('@/services/workspaceMutationReconciliation', () => ({
  runWorkspaceCreationAttempt: (_type: string, _payload: object, create: (key: string) => Promise<unknown>) =>
    create('11111111-2222-4333-8444-555555555555'),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const frame: WorkspaceFrame = {
  id: 1,
  user_id: 7,
  title: 'Sanchez kitchen',
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
};

const inside: List = { id: 5, title: 'Scope', type: 'General', items: [], position_x: 1100, position_y: 1200, width: 400, height: 300 };
const outside: List = { id: 6, title: 'Elsewhere', type: 'General', items: [], position_x: 4000, position_y: 4000, width: 400, height: 300 };
const note: Note = {
  id: 9, user_id: 7, title: 'Notes', content: '', color_value: '#fff',
  position_x: 1500, position_y: 1300, width: 500, height: 300, z_index: 1,
  created_at: '2026-09-06T00:00:00.000Z', updated_at: '2026-09-06T00:00:00.000Z',
};

const setup = (overrides: { frames?: WorkspaceFrame[]; lists?: List[]; notes?: Note[] } = {}) => {
  const setFrames = vi.fn();
  const setters = {
    setLists: vi.fn(),
    setNotes: vi.fn(),
    setWhiteboards: vi.fn(),
    setWireframes: vi.fn(),
    setVaults: vi.fn(),
  };
  const enqueuePositionUpdate = vi.fn();
  const contactUpdaters = { list: vi.fn(), note: vi.fn(), whiteboard: vi.fn(), wireframe: vi.fn() };
  const hook = renderHook(() => useCanvasFrames({
    frames: overrides.frames ?? [frame],
    setFrames,
    cards: {
      lists: overrides.lists ?? [inside, outside],
      notes: overrides.notes ?? [note],
      whiteboards: [],
      wireframes: [],
      vaults: [],
    },
    setters,
    enqueuePositionUpdate,
    contactUpdaters,
  }));
  return { hook, setFrames, setters, enqueuePositionUpdate, contactUpdaters };
};

describe('useCanvasFrames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves the frame and every card whose centre it contained, in one position batch', () => {
    const { hook, setFrames, setters, enqueuePositionUpdate } = setup();
    act(() => hook.result.current.moveFrame(1, { x: 1300, y: 1050 }));

    expect(enqueuePositionUpdate).toHaveBeenCalledWith({
      type: 'frame', id: 1, position_x: 1300, position_y: 1050, width: 1400, height: 900,
    });
    expect(enqueuePositionUpdate).toHaveBeenCalledWith({ type: 'list', id: 5, position_x: 1400, position_y: 1250 });
    expect(enqueuePositionUpdate).toHaveBeenCalledWith({ type: 'note', id: 9, position_x: 1800, position_y: 1350 });
    expect(enqueuePositionUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ id: 6 }));
    expect(enqueuePositionUpdate).toHaveBeenCalledTimes(3);

    const nextLists = (setters.setLists.mock.calls[0][0] as (lists: List[]) => List[])([inside, outside]);
    expect(nextLists).toEqual([
      { ...inside, position_x: 1400, position_y: 1250 },
      outside,
    ]);
    const nextFrames = (setFrames.mock.calls[0][0] as (frames: WorkspaceFrame[]) => WorkspaceFrame[])([frame]);
    expect(nextFrames[0]).toMatchObject({ position_x: 1300, position_y: 1050 });
  });

  it('resizes without touching the cards', () => {
    const { hook, setters, enqueuePositionUpdate } = setup();
    act(() => hook.result.current.moveFrame(1, { x: 1000, y: 1000 }, { width: 1600, height: 1000 }));
    expect(enqueuePositionUpdate).toHaveBeenCalledTimes(1);
    expect(enqueuePositionUpdate).toHaveBeenCalledWith({
      type: 'frame', id: 1, position_x: 1000, position_y: 1000, width: 1600, height: 1000,
    });
    expect(setters.setLists).not.toHaveBeenCalled();
    expect(setters.setNotes).not.toHaveBeenCalled();
  });

  it('creates a frame at the requested spot and opens its title for editing', async () => {
    const created = { ...frame, id: 2, title: 'Untitled frame', position_x: 50, position_y: 60 };
    framesApi.createWorkspaceFrameViaGraphql.mockResolvedValue(created);
    const { hook, setFrames } = setup();
    await act(async () => {
      await hook.result.current.createFrameAt({ x: 50, y: 60 });
    });
    expect(framesApi.createWorkspaceFrameViaGraphql).toHaveBeenCalledWith(
      { position_x: 50, position_y: 60, width: 1400, height: 900 },
      '11111111-2222-4333-8444-555555555555',
    );
    const next = (setFrames.mock.calls[0][0] as (frames: WorkspaceFrame[]) => WorkspaceFrame[])([frame]);
    expect(next.map((entry) => entry.id)).toEqual([1, 2]);
    expect(hook.result.current.editingFrameId).toBe(2);
  });

  it('applies title, colour, and binding optimistically and keeps the server row', async () => {
    const saved = { ...frame, title: 'Phase 2', contact_id: 3, contact_name: 'Casey Sanchez', updated_at: '2026-09-06T00:01:00.000Z' };
    framesApi.updateWorkspaceFrameViaGraphql.mockResolvedValue(saved);
    const { hook, setFrames } = setup();
    await act(async () => {
      await hook.result.current.updateFrame(1, { title: 'Phase 2', contact_id: 3, contact_name: 'Casey Sanchez' });
    });
    expect(framesApi.updateWorkspaceFrameViaGraphql).toHaveBeenCalledWith(1, { title: 'Phase 2', contact_id: 3 });
    const optimistic = (setFrames.mock.calls[0][0] as (frames: WorkspaceFrame[]) => WorkspaceFrame[])([frame]);
    expect(optimistic[0]).toMatchObject({ title: 'Phase 2', contact_name: 'Casey Sanchez' });
    const settled = (setFrames.mock.calls[1][0] as (frames: WorkspaceFrame[]) => WorkspaceFrame[])([frame]);
    expect(settled[0]).toEqual(saved);
  });

  it('rolls back a failed update and reports it', async () => {
    framesApi.updateWorkspaceFrameViaGraphql.mockRejectedValue(new Error('offline'));
    const { hook, setFrames } = setup();
    await act(async () => {
      await expect(hook.result.current.updateFrame(1, { title: 'Nope' })).rejects.toThrow('offline');
    });
    const rollback = (setFrames.mock.calls[1][0] as (frames: WorkspaceFrame[]) => WorkspaceFrame[])([{ ...frame, title: 'Nope' }]);
    expect(rollback[0]).toEqual(frame);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('deletes a frame and leaves the cards where they are', async () => {
    framesApi.deleteWorkspaceFrameViaGraphql.mockResolvedValue(undefined);
    const { hook, setFrames, setters } = setup();
    let result: boolean | undefined;
    await act(async () => {
      result = await hook.result.current.deleteFrame(1);
    });
    expect(result).toBe(true);
    const next = (setFrames.mock.calls[0][0] as (frames: WorkspaceFrame[]) => WorkspaceFrame[])([frame]);
    expect(next).toEqual([]);
    expect(setters.setLists).not.toHaveBeenCalled();
  });
  it('binding a frame writes the client onto every card inside it', async () => {
    const saved = { ...frame, contact_id: 3, contact_name: 'Casey Sanchez', updated_at: '2026-09-06T00:01:00.000Z' };
    framesApi.updateWorkspaceFrameViaGraphql.mockResolvedValue(saved);
    const { hook, contactUpdaters } = setup();
    await act(async () => {
      await hook.result.current.updateFrame(1, { contact_id: 3, contact_name: 'Casey Sanchez' });
    });
    const binding = { contact_id: 3, contact_name: 'Casey Sanchez' };
    expect(contactUpdaters.list).toHaveBeenCalledTimes(1);
    expect(contactUpdaters.list).toHaveBeenCalledWith(inside, binding);
    expect(contactUpdaters.note).toHaveBeenCalledWith(9, binding);
    expect(contactUpdaters.list).not.toHaveBeenCalledWith(outside, expect.anything());
  });

  it('unlinking a frame clears only the cards that shared its client', async () => {
    const bound = { ...frame, contact_id: 3, contact_name: 'Casey Sanchez' };
    const saved = { ...bound, contact_id: null, contact_name: null, updated_at: '2026-09-06T00:02:00.000Z' };
    framesApi.updateWorkspaceFrameViaGraphql.mockResolvedValue(saved);
    const shared: List = { ...inside, id: 51, contact_id: 3 };
    const own: List = { ...inside, id: 52, position_x: 1500, contact_id: 8 };
    const { hook, contactUpdaters } = setup({ frames: [bound], lists: [shared, own], notes: [] });
    await act(async () => {
      await hook.result.current.updateFrame(1, { contact_id: null, contact_name: null });
    });
    expect(contactUpdaters.list).toHaveBeenCalledTimes(1);
    expect(contactUpdaters.list).toHaveBeenCalledWith(shared, { contact_id: null, contact_name: null });
  });

  it('a card entering a bound frame without a client takes the frame\'s; bound cards keep theirs', () => {
    const bound = { ...frame, contact_id: 3, contact_name: 'Casey Sanchez' };
    const { hook, contactUpdaters } = setup({ frames: [bound] });
    hook.result.current.inheritFrameContact('list', outside, { x: 1100, y: 1200 });
    expect(contactUpdaters.list).toHaveBeenCalledWith(outside, { contact_id: 3, contact_name: 'Casey Sanchez' });

    hook.result.current.inheritFrameContact('note', { ...note, contact_id: 8 }, { x: 1100, y: 1200 });
    expect(contactUpdaters.note).not.toHaveBeenCalled();

    hook.result.current.inheritFrameContact('note', note, { x: 5000, y: 5000 });
    expect(contactUpdaters.note).not.toHaveBeenCalled();
  });
});
