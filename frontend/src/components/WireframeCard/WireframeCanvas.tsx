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
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTheme } from 'next-themes';
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

// Inner component that uses React Flow hooks
const WireframeCanvasInner: React.FC<WireframeCanvasProps> = ({
  flowData,
  onFlowDataChange,
  readOnly = false,
  height = 400,
}) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, getNodes, setNodes: setFlowNodes } = useReactFlow();
  
  // Selected tool state
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  
  // Clipboard for copy/paste
  const [clipboardNodes, setClipboardNodes] = useState<Node[]>([]);
  
  // History for undo/redo
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Initialize nodes and edges from flowData
  const initialNodes = useMemo(() => flowData?.nodes || [], []);
  const initialEdges = useMemo(() => flowData?.edges || [], []);
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const lastFlowDataRef = useRef<string>('');

  // Save to history
  const saveToHistory = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: [...nodes], edges: [...edges] });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex, nodes, edges]);

  // Sync flow data changes back to parent
  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      if (onFlowDataChange) {
        setTimeout(() => {
          onFlowDataChange({
            nodes,
            edges,
            viewport: { x: 0, y: 0, zoom: 1 },
          });
        }, 100);
      }
    },
    [onNodesChange, onFlowDataChange, nodes, edges]
  );

  const handleEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChange(changes);
      if (onFlowDataChange) {
        setTimeout(() => {
          onFlowDataChange({
            nodes,
            edges,
            viewport: { x: 0, y: 0, zoom: 1 },
          });
        }, 100);
      }
    },
    [onEdgesChange, onFlowDataChange, nodes, edges]
  );

  // Persist flow data for direct node updates (e.g., label edits)
  useEffect(() => {
    if (!onFlowDataChange) return;

    const sanitizedNodes = nodes.map(({ selected, dragging, ...rest }) => rest);
    const sanitizedEdges = edges.map(({ selected, ...rest }) => rest);
    const serialized = JSON.stringify({ nodes: sanitizedNodes, edges: sanitizedEdges });

    if (serialized === lastFlowDataRef.current) return;
    lastFlowDataRef.current = serialized;

    const timeout = setTimeout(() => {
      onFlowDataChange({
        nodes,
        edges,
        viewport: { x: 0, y: 0, zoom: 1 },
      });
    }, 150);

    return () => clearTimeout(timeout);
  }, [nodes, edges, onFlowDataChange]);

  // Add new node to the canvas
  const addNode = useCallback(
    (type: string, position?: { x: number; y: number }, extraData?: Record<string, any>) => {
      const defaultLabels: Record<string, string> = {
        rectangle: 'Rectangle',
        diamond: 'Diamond',
        circle: 'Circle',
        textBox: 'Text',
        stickyNote: 'Note',
        arrow: '',
      };

      saveToHistory();

      const nodePosition = position || { x: 150 + Math.random() * 100, y: 150 + Math.random() * 100 };
      
      // Default data based on node type
      let nodeData: Record<string, any> = { label: defaultLabels[type] };
      
      // Add default endOffset for arrows
      if (type === 'arrow') {
        const endOffset = extraData?.endOffset || { x: 100, y: 0 };
        const minX = Math.min(0, endOffset.x) - 4;
        const minY = Math.min(0, endOffset.y) - 4;
        nodeData = {
          ...nodeData,
          endOffset,
          boundsAligned: true,
        };
        // Adjust initial position so node bounds align with arrow extents
        if (position) {
          position = { x: position.x + minX, y: position.y + minY };
        } else {
          nodePosition.x += minX;
          nodePosition.y += minY;
        }
      }
      
      // Merge any extra data
      if (extraData) {
        nodeData = { ...nodeData, ...extraData };
      }

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type: type,
        position: nodePosition,
        data: nodeData,
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedTool(null); // Deselect tool after adding
    },
    [setNodes, saveToHistory]
  );

  // Handle tool click - add node immediately
  const handleToolClick = useCallback((toolId: string) => {
    if (!readOnly) {
      addNode(toolId);
    }
  }, [addNode, readOnly]);

  // Undo action
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setNodes(history[newIndex].nodes);
      setEdges(history[newIndex].edges);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  // Redo action
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setNodes(history[newIndex].nodes);
      setEdges(history[newIndex].edges);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  // Delete selected nodes
  const handleDeleteSelected = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);
    
    if (selectedNodes.length > 0 || selectedEdges.length > 0) {
      saveToHistory();
      setNodes((nds) => nds.filter((n) => !n.selected));
      setEdges((eds) => eds.filter((e) => !e.selected));
    }
  }, [nodes, edges, saveToHistory, setNodes, setEdges]);

  // Fit view
  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2 });
  }, [fitView]);

  // Clear all
  const handleClearAll = useCallback(() => {
    if (nodes.length > 0 || edges.length > 0) {
      saveToHistory();
      setNodes([]);
      setEdges([]);
    }
  }, [nodes, edges, saveToHistory, setNodes, setEdges]);

  const handleCopy = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;
    const clonedNodes = selectedNodes.map((node) => ({
      ...node,
      data: node.data ? JSON.parse(JSON.stringify(node.data)) : node.data,
    }));
    setClipboardNodes(clonedNodes);
  }, [nodes]);

  const handlePaste = useCallback(() => {
    if (clipboardNodes.length === 0) return;
    saveToHistory();
    const timestamp = Date.now();
    const offset = 24;

    setNodes((nds) => {
      const deselected = nds.map((node) => ({ ...node, selected: false }));
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
      return [...deselected, ...pasted];
    });
  }, [clipboardNodes, saveToHistory, setNodes]);

  useEffect(() => {
    if (readOnly) return;

    const isEditableTarget = (target: EventTarget | null) => {
      if (!target || !(target as HTMLElement).tagName) return false;
      const el = target as HTMLElement;
      const tagName = el.tagName.toLowerCase();
      return tagName === 'input' || tagName === 'textarea' || el.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const isCopy = (isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'c';
      const isPaste = (isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'v';

      if (isCopy) {
        event.preventDefault();
        handleCopy();
      } else if (isPaste) {
        event.preventDefault();
        handlePaste();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCopy, handlePaste, readOnly]);

  // Theme-aware colors
  const bgColor = isLight ? '#f8fafc' : '#1e293b';
  const gridColor = isLight ? '#e2e8f0' : '#334155';
  const minimapMaskColor = isLight ? 'rgba(248, 250, 252, 0.8)' : 'rgba(30, 41, 59, 0.8)';
  const toolbarBg = isLight ? '#f9fafb' : '#334155';
  const toolbarBorder = isLight ? '#e5e7eb' : '#475569';
  const buttonBg = isLight ? 'white' : '#475569';
  const buttonBorder = isLight ? '#d1d5db' : '#64748b';
  const textColor = isLight ? '#374151' : '#e5e7eb';

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full flex-1 flex flex-col rounded-lg overflow-hidden border border-border"
      style={{ height: height || '100%', minHeight: '300px' }}
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
            {/* Shape tools */}
            <div 
              className="flex items-center gap-1 p-1 rounded-md border" 
              style={{ backgroundColor: buttonBg, borderColor: buttonBorder }}
            >
              <TooltipProvider delayDuration={300}>
                {SHAPE_TOOLS.map((tool) => (
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
                      <p>{tool.label}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>

            {/* Separator */}
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
                    <p>Undo</p>
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
                    <p>Redo</p>
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
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
          style={{ backgroundColor: bgColor }}
          nodesDraggable={!readOnly}
          nodesConnectable={false}
          elementsSelectable={!readOnly}
          selectionOnDrag={!readOnly}
          selectionMode={SelectionMode.Full}
          panOnDrag={[2]}
          multiSelectionKeyCode={['Shift']}
          deleteKeyCode={['Backspace', 'Delete']}
          onNodeDragStop={saveToHistory}
        >
          {showGrid && (
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color={gridColor} />
          )}
          <Controls showInteractive={!readOnly} />
          <MiniMap
            nodeColor={(node) => {
              // Use neutral gray for most shapes, yellow for sticky notes
              if (node.type === 'stickyNote') {
                return '#FCD34D';
              }
              return isLight ? '#374151' : '#9ca3af';
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
