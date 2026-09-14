import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhiteboardCanvas } from './WhiteboardCanvas';
import type { Whiteboard } from '@/types';

const drawing = vi.hoisted(() => [{
  paths: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
  strokeWidth: 2, strokeColor: '#2563eb', drawMode: true,
}] as const);

vi.mock('react-sketch-canvas', () => ({
  ReactSketchCanvas: React.forwardRef(({ onStroke }: { onStroke: () => void }, ref) => {
    React.useImperativeHandle(ref, () => ({
      loadPaths: vi.fn(), exportPaths: async () => drawing,
    }), []);
    return <button onClick={onStroke}>Draw test stroke</button>;
  }),
}));

describe('WhiteboardCanvas autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not flush another save when an optimistic parent update replaces onSave', async () => {
    let finishSave!: () => void;
    const request = new Promise<void>(resolve => { finishSave = resolve; });
    const save = vi.fn(() => request);
    const whiteboard = { id: 1, canvas_data: [], canvas_width: 700, canvas_height: 400 } as unknown as Whiteboard;
    const props = { whiteboard, onCanvasChange: vi.fn(), whiteboardColor: '#2563eb', aiEnabled: false };
    const view = render(<WhiteboardCanvas {...props} onSave={save} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    fireEvent.click(screen.getByRole('button', { name: 'Draw test stroke' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(save).toHaveBeenCalledTimes(1);

    const replacement = vi.fn(() => request);
    view.rerender(<WhiteboardCanvas {...props} onSave={replacement} />);
    expect(replacement).not.toHaveBeenCalled();
    await act(async () => { finishSave(); await request; });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    view.unmount();
    expect(save).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
  });
});
