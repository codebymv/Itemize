import {
  fingerprintWireframeFlow,
  resolveIncomingWireframeFlow,
  stampPosition,
  stripWireframeSelection,
} from './wireframeFlowData';
import type { Node } from '@xyflow/react';

const node = (overrides: Partial<Node> = {}): Node => ({
  id: 'rectangle-1',
  type: 'rectangle',
  position: { x: 10, y: 20 },
  data: { label: 'Screen' },
  ...overrides,
});

describe('stripWireframeSelection', () => {
  it('drops selected and dragging so saves do not persist pointer state', () => {
    expect(
      stripWireframeSelection([
        node({ selected: true, dragging: true }),
      ]),
    ).toEqual([
      {
        id: 'rectangle-1',
        type: 'rectangle',
        position: { x: 10, y: 20 },
        data: { label: 'Screen' },
      },
    ]);
  });
});

describe('fingerprintWireframeFlow', () => {
  it('treats selection-only changes as the same diagram', () => {
    const idle = [node()];
    const selected = [node({ selected: true })];
    expect(fingerprintWireframeFlow(idle, [])).toBe(fingerprintWireframeFlow(selected, []));
  });
});

describe('stampPosition', () => {
  it('centers shapes on the click, matching board tools', () => {
    expect(stampPosition({ x: 100, y: 80 }, 'rectangle', { width: 140, height: 56 })).toEqual({
      x: 30,
      y: 52,
    });
  });

  it('keeps arrows anchored at the click so the shaft grows from the cursor', () => {
    expect(stampPosition({ x: 100, y: 80 }, 'arrow', { width: 100, height: 8 })).toEqual({
      x: 100,
      y: 80,
    });
  });
});

describe('resolveIncomingWireframeFlow', () => {
  it('ignores parent re-renders of the same saved diagram', () => {
    expect(
      resolveIncomingWireframeFlow({
        incomingFingerprint: 'a',
        appliedFingerprint: 'a',
        currentFingerprint: 'b',
        isDragging: false,
      }),
    ).toBe('skip');
  });

  it('does not clobber local edits with stale parent data', () => {
    expect(
      resolveIncomingWireframeFlow({
        incomingFingerprint: 'saved',
        appliedFingerprint: 'saved',
        currentFingerprint: 'dirty',
        isDragging: false,
      }),
    ).toBe('skip');
  });

  it('defers while a node is being dragged', () => {
    expect(
      resolveIncomingWireframeFlow({
        incomingFingerprint: 'next',
        appliedFingerprint: 'saved',
        currentFingerprint: 'dirty',
        isDragging: true,
      }),
    ).toBe('defer');
  });

  it('acks an echo of the local save without resetting nodes', () => {
    expect(
      resolveIncomingWireframeFlow({
        incomingFingerprint: 'next',
        appliedFingerprint: 'saved',
        currentFingerprint: 'next',
        isDragging: false,
      }),
    ).toBe('ack');
  });

  it('applies an external diagram that differs from local state', () => {
    expect(
      resolveIncomingWireframeFlow({
        incomingFingerprint: 'shared',
        appliedFingerprint: 'saved',
        currentFingerprint: 'saved',
        isDragging: false,
      }),
    ).toBe('apply');
  });
});
