import type { Edge, Node } from '@xyflow/react';

export type WireframeSize = { width: number; height: number };

export const WIREFRAME_DEFAULT_SIZES: Record<string, WireframeSize> = {
  frame: { width: 320, height: 220 },
  phone: { width: 180, height: 320 },
  highlight: { width: 180, height: 110 },
  callout: { width: 180, height: 88 },
  uiNavbar: { width: 280, height: 40 },
  uiCard: { width: 180, height: 120 },
  uiInput: { width: 180, height: 36 },
  uiButton: { width: 96, height: 36 },
  rectangle: { width: 140, height: 56 },
  diamond: { width: 140, height: 80 },
  circle: { width: 88, height: 88 },
  textBox: { width: 160, height: 40 },
  stickyNote: { width: 140, height: 140 },
  step: { width: 40, height: 40 },
};

export function stripWireframeSelection(nodes: Node[]): Node[] {
  return nodes.map(({ selected: _selected, dragging: _dragging, ...rest }) => rest);
}

export function stripWireframeEdgeSelection(edges: Edge[]): Edge[] {
  return edges.map(({ selected: _selected, ...rest }) => rest);
}

export function fingerprintWireframeFlow(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify({
    nodes: stripWireframeSelection(nodes),
    edges: stripWireframeEdgeSelection(edges),
  });
}

export function cloneWireframeFlow(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: JSON.parse(JSON.stringify(nodes)) as Node[],
    edges: JSON.parse(JSON.stringify(edges)) as Edge[],
  };
}

export function nextWireframeNodeId(type: string): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function stampPosition(
  click: { x: number; y: number },
  type: string,
  size?: WireframeSize,
): { x: number; y: number } {
  if (type === 'arrow' || !size) return click;
  return {
    x: click.x - size.width / 2,
    y: click.y - size.height / 2,
  };
}

export function resolveIncomingWireframeFlow(args: {
  incomingFingerprint: string;
  appliedFingerprint: string;
  currentFingerprint: string;
  isDragging: boolean;
}): 'skip' | 'defer' | 'ack' | 'apply' {
  if (args.incomingFingerprint === args.appliedFingerprint) return 'skip';
  if (args.isDragging) return 'defer';
  if (args.incomingFingerprint === args.currentFingerprint) return 'ack';
  return 'apply';
}
