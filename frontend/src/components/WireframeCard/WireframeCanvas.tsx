/**
 * WireframeCanvas Component
 * React Flow based canvas for creating flowcharts and diagrams
 * Styled consistently with WhiteboardCanvas toolbar
 */
import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Square, 
  Diamond, 
  Circle, 
  Type, 
  Undo2, 
  Redo2, 
  Trash2, 
  Maximize2,
  StickyNote,
  Grid3X3,
  Minus,
  MoveRight,
  Monitor,
  Smartphone,
  MessageCircle,
  Hash,
  Highlighter,
  RectangleHorizontal,
  TextCursorInput,
  PanelTop,
  LayoutTemplate,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { nodeTypes } from './nodes';
import {
  cloneWireframeFlow,
  fingerprintWireframeFlow,
  nextWireframeNodeId,
  resolveIncomingWireframeFlow,
  stampPosition,
  stripWireframeEdgeSelection,
  stripWireframeSelection,
  WIREFRAME_DEFAULT_SIZES,
} from '@/lib/wireframeFlowData';

interface WireframeCanvasProps {
  flowData?: {
    nodes: Node[];
    edges: Edge[];
    viewport?: { x: number; y: number; zoom: number };
  };
  onFlowDataChange?: (flowData: { nodes: Node[]; edges: Edge[]; viewport: { x: number; y: number; zoom: number } }) => void;
  readOnly?: boolean;
  height?: number;
}

// Shape tool definitions for the toolbar - simple, purpose-agnostic
const SHAPE_TOOLS = [
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'diamond', icon: Diamond, label: 'Diamond' },
  { id: 'circle', icon: Circle, label: 'Circle' },
  { id: 'textBox', icon: Type, label: 'Text' },
  { id: 'stickyNote', icon: StickyNote, label: 'Sticky Note' },
  { id: 'arrow', icon: MoveRight, label: 'Arrow' },
] as const;

const STORY_TOOLS = [
  { id: 'frame', icon: Monitor, label: 'Browser frame' },
  { id: 'phone', icon: Smartphone, label: 'Phone frame' },
  { id: 'callout', icon: MessageCircle, label: 'Callout' },
  { id: 'step', icon: Hash, label: 'Numbered step' },
  { id: 'highlight', icon: Highlighter, label: 'Highlight' },
] as const;

const UI_TOOLS = [
  { id: 'uiButton', icon: RectangleHorizontal, label: 'Button' },
  { id: 'uiInput', icon: TextCursorInput, label: 'Input' },
  { id: 'uiNavbar', icon: PanelTop, label: 'Navbar' },
  { id: 'uiCard', icon: LayoutTemplate, label: 'Card' },
] as const;

const isPoint = (value: unknown): value is { x: number; y: number } => {
  return !!value && typeof value === 'object' &&
    typeof (value as { x?: unknown }).x === 'number' &&
    typeof (value as { y?: unknown }).y === 'number';
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!target || !(target as HTMLElement).tagName) return false;
  const el = target as HTMLElement;
  const tagName = el.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || el.isContentEditable;
};

// Inner component that uses React Flow hooks
const WireframeCanvasInner: React.FC<WireframeCanvasProps> = ({
  flowData,
  onFlowDataChange,
  readOnly = false,
  height = 400,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, screenToFlowPosition, getViewport } = useReactFlow();
  
  // Selected tool state
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  
  // Clipboard for copy/paste
  const [clipboardNodes, setClipboardNodes] = useState<Node[]>([]);
  
  // History for undo/redo — seed index 0 so the first action can be undone
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>(() => [
    cloneWireframeFlow(flowData?.nodes || [], flowData?.edges || []),
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [spacePan, setSpacePan] = useState(false);
  
  const initialNodes = useMemo(() => flowData?.nodes || [], []);
  const initialEdges = useMemo(() => flowData?.edges || [], []);
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const lastPersistedRef = useRef<string>('');
  const appliedIncomingRef = useRef(fingerprintWireframeFlow(flowData?.nodes || [], flowData?.edges || []));
  const flowDataRef = useRef(flowData);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  flowDataRef.current = flowData;
  nodesRef.current = nodes;
  edgesRef.current = edges;
  historyRef.current = history;
  historyIndexRef.current = historyIndex;

  const commitHistory = useCallback((nextNodes: Node[], nextEdges: Edge[]) => {
    const snapshot = cloneWireframeFlow(nextNodes, nextEdges);
    const next = historyRef.current.slice(0, historyIndexRef.current + 1);
    next.push(snapshot);
    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
    setHistory(next);
    setHistoryIndex(next.length - 1);
  }, []);

  const saveToHistory = useCallback(() => {
    commitHistory(nodesRef.current, edgesRef.current);
  }, [commitHistory]);

  const persistNow = useCallback(() => {
    if (!onFlowDataChange) return;
    if (nodesRef.current.some((node) => node.dragging)) return;
    const sanitizedNodes = stripWireframeSelection(nodesRef.current);
    const sanitizedEdges = stripWireframeEdgeSelection(edgesRef.current);
    let viewport = { x: 0, y: 0, zoom: 1 };
    try {
      viewport = getViewport();
    } catch {
      return;
    }
    const serialized = JSON.stringify({ nodes: sanitizedNodes, edges: sanitizedEdges, viewport });
    if (serialized === lastPersistedRef.current) return;
    lastPersistedRef.current = serialized;
    onFlowDataChange({ nodes: sanitizedNodes, edges: sanitizedEdges, viewport });
  }, [getViewport, onFlowDataChange]);

  const persistNowRef = useRef(persistNow);
  persistNowRef.current = persistNow;

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  useEffect(() => {
    if (nodes.some((node) => node.dragging)) return;
    const timeout = window.setTimeout(() => persistNowRef.current(), 300);
    return () => window.clearTimeout(timeout);
  }, [nodes, edges]);

  useEffect(() => {
    const flush = () => persistNowRef.current();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);

  const incomingFingerprint = fingerprintWireframeFlow(flowData?.nodes || [], flowData?.edges || []);

  useEffect(() => {
    const incoming = flowDataRef.current;
    const action = resolveIncomingWireframeFlow({
      incomingFingerprint,
      appliedFingerprint: appliedIncomingRef.current,
      currentFingerprint: fingerprintWireframeFlow(nodesRef.current, edgesRef.current),
      isDragging: nodesRef.current.some((node) => node.dragging),
    });
    if (action === 'skip' || action === 'defer') return;
    appliedIncomingRef.current = incomingFingerprint;
    if (action === 'ack') return;
    setNodes(incoming?.nodes || []);
    setEdges(incoming?.edges || []);
  }, [incomingFingerprint, setNodes, setEdges]);

  // Add new node to the canvas
  const addNode = useCallback(
    (type: string, position?: { x: number; y: number }, extraData?: Record<string, unknown>) => {
      const resolvedType = type === 'phone' ? 'frame' : type;
      const defaultLabels: Record<string, string> = {
        rectangle: 'Rectangle',
        diamond: 'Diamond',
        circle: 'Circle',
        textBox: 'Text',
        stickyNote: 'Note',
        arrow: '',
        frame: type === 'phone' ? 'Mobile' : 'Screen',
        callout: 'Call this out',
        step: String(nodesRef.current.filter((node) => node.type === 'step').length + 1),
        highlight: '',
        uiButton: 'Button',
        uiInput: 'Search…',
        uiNavbar: 'Product',
        uiCard: 'Card title',
      };
      const size = type === 'phone'
        ? WIREFRAME_DEFAULT_SIZES.phone
        : WIREFRAME_DEFAULT_SIZES[resolvedType];

      let nodePosition = position
        ? stampPosition(position, resolvedType, size)
        : { x: 150 + Math.random() * 100, y: 150 + Math.random() * 100 };
      
      let nodeData: Record<string, unknown> = { label: defaultLabels[resolvedType] ?? defaultLabels[type] ?? type };
      
      if (resolvedType === 'arrow') {
        const endOffset = isPoint(extraData?.endOffset) ? extraData.endOffset : { x: 100, y: 0 };
        const minX = Math.min(0, endOffset.x) - 4;
        const minY = Math.min(0, endOffset.y) - 4;
        nodeData = {
          ...nodeData,
          endOffset,
          boundsAligned: true,
        };
        nodePosition = { x: nodePosition.x + minX, y: nodePosition.y + minY };
      }

      if (type === 'phone') {
        nodeData.variant = 'phone';
      }
      if (type === 'frame') {
        nodeData.variant = 'browser';
      }
      if (resolvedType === 'uiButton') nodeData.variant = 'button';
      if (resolvedType === 'uiInput') nodeData.variant = 'input';
      if (resolvedType === 'uiNavbar') nodeData.variant = 'navbar';
      if (resolvedType === 'uiCard') nodeData.variant = 'card';
      
      if (extraData) {
        nodeData = { ...nodeData, ...extraData };
      }

      const newNode: Node = {
        id: nextWireframeNodeId(resolvedType),
        type: resolvedType,
        position: nodePosition,
        data: nodeData,
        zIndex: resolvedType === 'frame' || resolvedType === 'highlight' ? 0 : Date.now(),
        ...(size ? { style: { width: size.width, height: size.height }, width: size.width, height: size.height } : {}),
      };

      const nextNodes = [...nodesRef.current, newNode];
      setNodes(nextNodes);
      commitHistory(nextNodes, edgesRef.current);
    },
    [setNodes, commitHistory]
  );

  const handleToolClick = useCallback((toolId: string) => {
    if (readOnly) return;
    setSelectedTool((current) => (current === toolId ? null : toolId));
  }, [readOnly]);

  const handlePaneClick = useCallback((event: React.MouseEvent | MouseEvent) => {
    if (readOnly || !selectedTool || spacePan) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addNode(selectedTool, position);
  }, [addNode, readOnly, selectedTool, screenToFlowPosition, spacePan]);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    const newIndex = historyIndexRef.current - 1;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    const snapshot = historyRef.current[newIndex];
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    const newIndex = historyIndexRef.current + 1;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    const snapshot = historyRef.current[newIndex];
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setNodes, setEdges]);

  const handleDeleteSelected = useCallback(() => {
    const nextNodes = nodesRef.current.filter((n) => !n.selected);
    const nextEdges = edgesRef.current.filter((e) => !e.selected);
    if (nextNodes.length === nodesRef.current.length && nextEdges.length === edgesRef.current.length) {
      return;
    }
    setNodes(nextNodes);
    setEdges(nextEdges);
    commitHistory(nextNodes, nextEdges);
  }, [commitHistory, setNodes, setEdges]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2 });
  }, [fitView]);

  const handleClearAll = useCallback(() => {
    if (nodesRef.current.length === 0 && edgesRef.current.length === 0) return;
    setNodes([]);
    setEdges([]);
    commitHistory([], []);
  }, [commitHistory, setNodes, setEdges]);

  const handleCopy = useCallback(() => {
    const selectedNodes = nodesRef.current.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;
    const clonedNodes = selectedNodes.map((node) => ({
      ...node,
      data: node.data ? JSON.parse(JSON.stringify(node.data)) : node.data,
    }));
    setClipboardNodes(clonedNodes);
  }, []);

  const handlePaste = useCallback(() => {
    if (clipboardNodes.length === 0) return;
    const timestamp = Date.now();
    const offset = 24;
    const deselected = nodesRef.current.map((node) => ({ ...node, selected: false }));
    const pasted = clipboardNodes.map((node, index) => ({
      ...node,
      id: `${node.type}-${timestamp}-${index}`,
      position: {
        x: node.position.x + offset,
        y: node.position.y + offset,
      },
      selected: true,
      data: node.data ? JSON.parse(JSON.stringify(node.data)) : node.data,
    }));
    const nextNodes = [...deselected, ...pasted];
    setNodes(nextNodes);
    commitHistory(nextNodes, edgesRef.current);
  }, [clipboardNodes, commitHistory, setNodes]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (readOnly || node.type === 'frame' || node.type === 'highlight') return;
    setNodes((current) =>
      current.map((item) => (item.id === node.id ? { ...item, zIndex: Date.now() } : item))
    );
  }, [readOnly, setNodes]);

  const handleNodeDragStop = useCallback(() => {
    saveToHistory();
    persistNow();
  }, [persistNow, saveToHistory]);

  const pointerInsideRef = useRef(false);

  useEffect(() => {
    if (readOnly) return;

    const inCanvas = (target: EventTarget | null) =>
      pointerInsideRef.current || !!(target && reactFlowWrapper.current?.contains(target as HTMLElement));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat && !isEditableTarget(event.target) && inCanvas(event.target)) {
        event.preventDefault();
        setSpacePan(true);
      }
      if (isEditableTarget(event.target) || !inCanvas(event.target)) return;
      if (event.key === 'Escape') {
        setSelectedTool(null);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        handleDeleteSelected();
        return;
      }
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        handleCopy();
      } else if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        handlePaste();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePan(false);
    };
    const handleBlur = () => setSpacePan(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleCopy, handlePaste, handleDeleteSelected, handleUndo, handleRedo, readOnly]);

  // Theme-aware colors
  const bgColor = 'hsl(var(--background))';
  const gridColor = 'hsl(var(--border))';
  const minimapMaskColor = 'hsl(var(--background) / 0.8)';
  const toolbarBg = 'hsl(var(--muted))';
  const toolbarBorder = 'hsl(var(--border))';
  const buttonBg = 'hsl(var(--card))';
  const buttonBorder = 'hsl(var(--border))';
  const textColor = 'hsl(var(--foreground))';
  const savedViewport = flowData?.viewport;
  const hasCustomViewport = Boolean(
    savedViewport && (savedViewport.x !== 0 || savedViewport.y !== 0 || savedViewport.zoom !== 1)
  );

  const renderToolGroup = (tools: readonly { id: string; icon: typeof Square; label: string }[]) => (
            <div 
              className="flex items-center gap-1 p-1 rounded-md border" 
              style={{ backgroundColor: buttonBg, borderColor: buttonBorder }}
            >
              <TooltipProvider delayDuration={300}>
                {tools.map((tool) => (
                  <Tooltip key={tool.id}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToolClick(tool.id)}
                        className={cn(
                          "h-8 w-8 p-0 transition-colors",
                          selectedTool === tool.id 
                            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                            : ''
                        )}
                        style={selectedTool !== tool.id ? { 
                          backgroundColor: 'transparent', 
                          color: textColor 
                        } : {}}
                      >
                        <tool.icon className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{tool.label} — click canvas to place · Space to pan</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>
  );

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full flex-1 flex flex-col rounded-lg overflow-hidden border border-border"
      style={{ height: height || '100%', minHeight: '300px' }}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
      }}
    >
      <style>{`
        /* Allow handle interactions even with multi-select box visible */
        .react-flow__nodesselection,
        .react-flow__nodesselection-rect,
        .react-flow__selection,
        .react-flow__selection-rect {
          pointer-events: none;
        }
      `}</style>
      {/* Toolbar - styled like WhiteboardCanvas */}
      {!readOnly && (
        <div 
          className="flex items-center justify-between p-2 border-b flex-shrink-0" 
          style={{ backgroundColor: toolbarBg, borderBottomColor: toolbarBorder }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {renderToolGroup(SHAPE_TOOLS)}
            <Separator orientation="vertical" className="h-6 mx-1 hidden sm:block" />
            {renderToolGroup(STORY_TOOLS)}
            <Separator orientation="vertical" className="h-6 mx-1 hidden sm:block" />
            {renderToolGroup(UI_TOOLS)}

            {selectedTool && (
              <span className="text-[11px] text-muted-foreground font-raleway">
                Click to place · Space to pan · Esc to cancel
              </span>
            )}

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Actions */}
            <div 
              className="flex items-center gap-1 p-1 rounded-md border" 
              style={{ backgroundColor: buttonBg, borderColor: buttonBorder }}
            >
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleUndo}
                      disabled={historyIndex <= 0}
                      className="h-8 w-8 p-0"
                      style={{ backgroundColor: 'transparent', color: textColor }}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Undo (Ctrl+Z)</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRedo}
                      disabled={historyIndex >= history.length - 1}
                      className="h-8 w-8 p-0"
                      style={{ backgroundColor: 'transparent', color: textColor }}
                    >
                      <Redo2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Redo (Ctrl+Y)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Spacer */}
            <div className="flex-grow hidden sm:block" />

            {/* Right side actions */}
            <div 
              className="flex items-center gap-1 p-1 rounded-md border" 
              style={{ backgroundColor: buttonBg, borderColor: buttonBorder }}
            >
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeleteSelected}
                      className="h-8 w-8 p-0"
                      style={{ backgroundColor: 'transparent', color: textColor }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Delete Selected</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleFitView}
                      className="h-8 w-8 p-0"
                      style={{ backgroundColor: 'transparent', color: textColor }}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Fit View</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowGrid(!showGrid)}
                      className={cn(
                        "h-8 w-8 p-0",
                        showGrid ? 'bg-blue-100 dark:bg-blue-900' : ''
                      )}
                      style={{ backgroundColor: showGrid ? undefined : 'transparent', color: textColor }}
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Toggle Grid</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearAll}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                      style={{ backgroundColor: 'transparent' }}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Clear All</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      )}

      {/* React Flow Canvas */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={readOnly ? undefined : handleNodesChange}
          onEdgesChange={readOnly ? undefined : handleEdgesChange}
          onPaneClick={readOnly ? undefined : handlePaneClick}
          onNodeClick={readOnly ? undefined : handleNodeClick}
          onMoveEnd={readOnly ? undefined : persistNow}
          nodeTypes={nodeTypes}
          fitView={!hasCustomViewport}
          defaultViewport={savedViewport}
          attributionPosition="bottom-left"
          style={{
            backgroundColor: bgColor,
            cursor: spacePan ? 'grab' : selectedTool ? 'crosshair' : undefined,
          }}
          nodesDraggable={!readOnly && !spacePan}
          nodesConnectable={false}
          elementsSelectable={!readOnly && !spacePan}
          selectionOnDrag={!readOnly && !selectedTool && !spacePan}
          selectionMode={SelectionMode.Full}
          panOnDrag={spacePan ? true : [2]}
          panOnScroll
          multiSelectionKeyCode={['Shift']}
          deleteKeyCode={null}
          onNodeDragStop={readOnly ? undefined : handleNodeDragStop}
        >
          {showGrid && (
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color={gridColor} />
          )}
          <Controls showInteractive={!readOnly} />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'stickyNote') return '#FCD34D';
              if (node.type === 'step') return 'hsl(var(--primary))';
              if (node.type === 'highlight') return 'hsl(var(--primary) / 0.4)';
              if (node.type === 'callout') return 'hsl(var(--card))';
              if (node.type === 'frame') return 'hsl(var(--muted))';
              return 'hsl(var(--muted-foreground))';
            }}
            maskColor={minimapMaskColor}
          />
        </ReactFlow>
      </div>
    </div>
  );
};

// Wrapper component with ReactFlowProvider
const WireframeCanvas: React.FC<WireframeCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <WireframeCanvasInner {...props} />
    </ReactFlowProvider>
  );
};

export default WireframeCanvas;
