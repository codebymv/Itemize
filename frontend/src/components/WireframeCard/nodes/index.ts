/**
 * Custom nodes for WireframeCanvas
 */
import RectangleNode from './RectangleNode';
import DiamondNode from './DiamondNode';
import CircleNode from './CircleNode';
import TextBoxNode from './TextBoxNode';
import StickyNoteNode from './StickyNoteNode';
import ArrowNode from './ArrowNode';
import FrameNode from './FrameNode';
import CalloutNode from './CalloutNode';
import StepNode from './StepNode';
import HighlightNode from './HighlightNode';
import UiBlockNode from './UiBlockNode';

export const nodeTypes = {
  rectangle: RectangleNode,
  diamond: DiamondNode,
  circle: CircleNode,
  textBox: TextBoxNode,
  stickyNote: StickyNoteNode,
  arrow: ArrowNode,
  frame: FrameNode,
  callout: CalloutNode,
  step: StepNode,
  highlight: HighlightNode,
  uiButton: UiBlockNode,
  uiInput: UiBlockNode,
  uiNavbar: UiBlockNode,
  uiCard: UiBlockNode,
};
