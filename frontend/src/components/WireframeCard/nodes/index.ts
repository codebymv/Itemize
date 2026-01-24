/**
 * Custom nodes for WireframeCanvas
 * Export all node types for use in React Flow
 */
export { default as RectangleNode } from './RectangleNode';
export { default as DiamondNode } from './DiamondNode';
export { default as CircleNode } from './CircleNode';
export { default as TextBoxNode } from './TextBoxNode';
export { default as StickyNoteNode } from './StickyNoteNode';
export { default as ArrowNode } from './ArrowNode';

// Node types configuration for React Flow
export const nodeTypes = {
  rectangle: RectangleNode,
  diamond: DiamondNode,
  circle: CircleNode,
  textBox: TextBoxNode,
  stickyNote: StickyNoteNode,
  arrow: ArrowNode,
};

// Import after exports to avoid circular dependency
import RectangleNode from './RectangleNode';
import DiamondNode from './DiamondNode';
import CircleNode from './CircleNode';
import TextBoxNode from './TextBoxNode';
import StickyNoteNode from './StickyNoteNode';
import ArrowNode from './ArrowNode';
