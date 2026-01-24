/**
 * Arrow Node - Miro-style arrow with draggable endpoints
 * Supports any angle via independently draggable start/end points
 */
import React, { memo, useState, useCallback, useEffect, useRef } from 'react';
import { NodeProps, useReactFlow, Node } from '@xyflow/react';
import { useTheme } from 'next-themes';

interface ArrowNodeData {
  // End point position relative to node position (start point)
  endOffset: { x: number; y: number };
  // Internal flag to align node bounds with rendered arrow
  boundsAligned?: boolean;
  // Optional: connection info for smart snapping (future)
  startConnectedTo?: string;
  endConnectedTo?: string;
}

// Handle size and padding
const HANDLE_SIZE = 12;
const BOUNDS_PADDING = 4;
const ARROWHEAD_LENGTH = 14;
const ARROWHEAD_WIDTH = 10;
const HITBOX_STROKE_WIDTH = 14;
const HANDLE_HITBOX = 28;

const ArrowNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { setNodes, getNode, getNodes } = useReactFlow();
  
  const nodeData = data as ArrowNodeData;
  const endOffset = nodeData.endOffset || { x: 100, y: 0 };
  const boundsAligned = nodeData.boundsAligned;
  
  // Track which handle is being dragged
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    nodeX: number;
    nodeY: number;
    endOffsetX: number;
    endOffsetY: number;
    minX: number;
    minY: number;
    startWorldX: number;
    startWorldY: number;
    endWorldX: number;
    endWorldY: number;
  } | null>(null);
  const dragGroupRef = useRef<
    Array<{
      id: string;
      nodeX: number;
      nodeY: number;
      endOffsetX: number;
      endOffsetY: number;
      minX: number;
      minY: number;
      startWorldX: number;
      startWorldY: number;
      endWorldX: number;
      endWorldY: number;
    }>
  >([]);
  
  // Calculate container bounds to encompass both points
  const minX = Math.min(0, endOffset.x) - BOUNDS_PADDING;
  const minY = Math.min(0, endOffset.y) - BOUNDS_PADDING;
  const maxX = Math.max(0, endOffset.x) + BOUNDS_PADDING;
  const maxY = Math.max(0, endOffset.y) + BOUNDS_PADDING;
  
  const containerWidth = maxX - minX;
  const containerHeight = maxY - minY;
  
  // Calculate start and end positions relative to container
  const startX = -minX;
  const startY = -minY;
  const endX = endOffset.x - minX;
  const endY = endOffset.y - minY;
  
  // Calculate arrow angle for arrowhead rotation
  const angle = Math.atan2(endOffset.y, endOffset.x);
  const angleDeg = (angle * 180) / Math.PI;
  
  // Calculate arrowhead position (tip at end point)
  const arrowLength = Math.sqrt(endOffset.x * endOffset.x + endOffset.y * endOffset.y);
  
  const arrowColor = isLight ? '#374151' : '#9ca3af';
  const handleColor = '#3b82f6';
  
  // Handle pointer down on endpoint handles - PRIMARY BUTTON ONLY
  const handlePointerDown = useCallback((e: React.PointerEvent, handle: 'start' | 'end') => {
    // Only handle primary pointer (usually left click)
    if (!e.isPrimary || e.button !== 0) return;

    e.stopPropagation();
    e.preventDefault();

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors (e.g., unsupported)
    }
    
    const node = getNode(id);
    if (!node) return;

    const selectedArrows = getNodes().filter(
      (n) => n.selected && n.type === 'arrow'
    );
    const activeNodes: Node[] = selectedArrows.length > 0 && node.selected
      ? selectedArrows
      : [node];

    dragGroupRef.current = activeNodes.map((n) => {
      const nodeEndOffset = (n.data as ArrowNodeData)?.endOffset || { x: 100, y: 0 };
      const nodeMinX = Math.min(0, nodeEndOffset.x) - BOUNDS_PADDING;
      const nodeMinY = Math.min(0, nodeEndOffset.y) - BOUNDS_PADDING;
      const nodeStartWorldX = n.position.x - nodeMinX;
      const nodeStartWorldY = n.position.y - nodeMinY;
      const nodeEndWorldX = nodeStartWorldX + nodeEndOffset.x;
      const nodeEndWorldY = nodeStartWorldY + nodeEndOffset.y;
      return {
        id: n.id,
        nodeX: n.position.x,
        nodeY: n.position.y,
        endOffsetX: nodeEndOffset.x,
        endOffsetY: nodeEndOffset.y,
        minX: nodeMinX,
        minY: nodeMinY,
        startWorldX: nodeStartWorldX,
        startWorldY: nodeStartWorldY,
        endWorldX: nodeEndWorldX,
        endWorldY: nodeEndWorldY,
      };
    });

    const startWorldX = node.position.x - minX;
    const startWorldY = node.position.y - minY;
    const endWorldX = startWorldX + endOffset.x;
    const endWorldY = startWorldY + endOffset.y;

    setDraggingHandle(handle);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: node.position.x,
      nodeY: node.position.y,
      endOffsetX: endOffset.x,
      endOffsetY: endOffset.y,
      minX,
      minY,
      startWorldX,
      startWorldY,
      endWorldX,
      endWorldY,
    };
  }, [id, getNode, endOffset, minX, minY]);
  
  // Normalize node bounds on first render so lasso selection matches arrow extents
  useEffect(() => {
    if (boundsAligned) return;
    const node = getNode(id);
    if (!node) return;
    const alignMinX = Math.min(0, endOffset.x) - BOUNDS_PADDING;
    const alignMinY = Math.min(0, endOffset.y) - BOUNDS_PADDING;
    if (alignMinX === 0 && alignMinY === 0) {
      setNodes((nodes) =>
        nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, boundsAligned: true } } : n))
      );
      return;
    }
    setNodes((nodes) =>
      nodes.map((n) => {
        if (n.id !== id) return n;
        return {
          ...n,
          position: { x: n.position.x + alignMinX, y: n.position.y + alignMinY },
          data: { ...n.data, boundsAligned: true },
        };
      })
    );
  }, [boundsAligned, endOffset.x, endOffset.y, getNode, id, setNodes]);

  // Handle mouse move for dragging
  useEffect(() => {
    if (!draggingHandle) return;
    
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      
      const { mouseX, mouseY } = dragStartRef.current;
      const deltaX = e.clientX - mouseX;
      const deltaY = e.clientY - mouseY;
      
      // Get the React Flow viewport transform to account for zoom/pan
      const flowContainer = document.querySelector('.react-flow__viewport');
      let scale = 1;
      if (flowContainer) {
        const transform = window.getComputedStyle(flowContainer).transform;
        if (transform && transform !== 'none') {
          const matrix = new DOMMatrix(transform);
          scale = matrix.a; // Scale factor
        }
      }
      
      const scaledDeltaX = deltaX / scale;
      const scaledDeltaY = deltaY / scale;
      
      const updates = new Map<string, { position: { x: number; y: number }; endOffset: { x: number; y: number } }>();

      dragGroupRef.current.forEach((entry) => {
        if (draggingHandle === 'end') {
          // Move end points by delta, keep starts fixed
          const newEndOffset = {
            x: entry.endOffsetX + scaledDeltaX,
            y: entry.endOffsetY + scaledDeltaY,
          };
          const newMinX = Math.min(0, newEndOffset.x) - BOUNDS_PADDING;
          const newMinY = Math.min(0, newEndOffset.y) - BOUNDS_PADDING;
          const newNodeX = entry.nodeX + (newMinX - entry.minX);
          const newNodeY = entry.nodeY + (newMinY - entry.minY);
          updates.set(entry.id, {
            position: { x: newNodeX, y: newNodeY },
            endOffset: newEndOffset,
          });
        } else if (draggingHandle === 'start') {
          // Move starts by delta, keep ends fixed
          const newStartWorldX = entry.startWorldX + scaledDeltaX;
          const newStartWorldY = entry.startWorldY + scaledDeltaY;
          const newEndOffset = {
            x: entry.endWorldX - newStartWorldX,
            y: entry.endWorldY - newStartWorldY,
          };
          const newMinX = Math.min(0, newEndOffset.x) - BOUNDS_PADDING;
          const newMinY = Math.min(0, newEndOffset.y) - BOUNDS_PADDING;
          const newNodeX = newStartWorldX + newMinX;
          const newNodeY = newStartWorldY + newMinY;
          updates.set(entry.id, {
            position: { x: newNodeX, y: newNodeY },
            endOffset: newEndOffset,
          });
        }
      });

      setNodes((nodes) =>
        nodes.map((node) => {
          const update = updates.get(node.id);
          if (!update) return node;
          return {
            ...node,
            position: update.position,
            data: {
              ...node.data,
              endOffset: update.endOffset,
              boundsAligned: true,
            },
          };
        })
      );
    };
    
    const handlePointerUp = () => {
      setDraggingHandle(null);
      dragStartRef.current = null;
      dragGroupRef.current = [];
    };
    
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingHandle, id, setNodes]);

  // Shorten the line slightly so it doesn't poke through the arrowhead
  const lineEndX = arrowLength > ARROWHEAD_LENGTH 
    ? endX - (ARROWHEAD_LENGTH - 2) * Math.cos(angle)
    : endX;
  const lineEndY = arrowLength > ARROWHEAD_LENGTH 
    ? endY - (ARROWHEAD_LENGTH - 2) * Math.sin(angle)
    : endY;

  return (
    <div
      className="relative"
      style={{
        width: containerWidth,
        height: containerHeight,
      }}
    >
      {/* SVG Arrow */}
      <svg
        width={containerWidth}
        height={containerHeight}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
      >
        {/* Invisible hitbox line to make selection easier */}
        <line
          x1={startX}
          y1={startY}
          x2={lineEndX}
          y2={lineEndY}
          stroke="transparent"
          strokeWidth={HITBOX_STROKE_WIDTH}
          strokeLinecap="round"
          pointerEvents="stroke"
        />
        {/* Arrow line - shortened so it doesn't poke through arrowhead */}
        <line
          x1={startX}
          y1={startY}
          x2={lineEndX}
          y2={lineEndY}
          stroke={arrowColor}
          strokeWidth={3}
          strokeLinecap="round"
        />
        
        {/* Arrowhead - positioned so tip is at the end point */}
        <polygon
          points={`${-ARROWHEAD_LENGTH},${-ARROWHEAD_WIDTH/2} 0,0 ${-ARROWHEAD_LENGTH},${ARROWHEAD_WIDTH/2}`}
          fill={arrowColor}
          transform={`translate(${endX}, ${endY}) rotate(${angleDeg})`}
        />
      </svg>
      
      {/* Start handle (draggable) */}
      <div
        className={`absolute rounded-full transition-transform nodrag nopan ${
          selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        } ${draggingHandle === 'start' ? 'scale-125' : 'hover:scale-110'}`}
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          left: startX - HANDLE_SIZE / 2,
          top: startY - HANDLE_SIZE / 2,
          backgroundColor: handleColor,
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          zIndex: 1000,
          cursor: 'grab',
          pointerEvents: 'all',
        }}
        data-no-drag
        data-no-pan
        onPointerDown={(e) => handlePointerDown(e, 'start')}
        onContextMenu={(e) => e.preventDefault()}
        title="Drag to move start point"
      />
      {/* Enlarged start handle hitbox to override selection box */}
      <div
        className="absolute nodrag nopan"
        style={{
          width: HANDLE_HITBOX,
          height: HANDLE_HITBOX,
          left: startX - HANDLE_HITBOX / 2,
          top: startY - HANDLE_HITBOX / 2,
          backgroundColor: 'transparent',
          zIndex: 999,
          pointerEvents: 'all',
        }}
        data-no-drag
        data-no-pan
        onPointerDown={(e) => handlePointerDown(e, 'start')}
        onContextMenu={(e) => e.preventDefault()}
        title="Drag to move start point"
      />
      
      {/* End handle (draggable) */}
      <div
        className={`absolute rounded-full transition-transform nodrag nopan ${
          selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        } ${draggingHandle === 'end' ? 'scale-125' : 'hover:scale-110'}`}
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          left: endX - HANDLE_SIZE / 2,
          top: endY - HANDLE_SIZE / 2,
          backgroundColor: handleColor,
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          zIndex: 1000,
          cursor: 'grab',
          pointerEvents: 'all',
        }}
        data-no-drag
        data-no-pan
        onPointerDown={(e) => handlePointerDown(e, 'end')}
        onContextMenu={(e) => e.preventDefault()}
        title="Drag to move end point"
      />
      {/* Enlarged end handle hitbox to override selection box */}
      <div
        className="absolute nodrag nopan"
        style={{
          width: HANDLE_HITBOX,
          height: HANDLE_HITBOX,
          left: endX - HANDLE_HITBOX / 2,
          top: endY - HANDLE_HITBOX / 2,
          backgroundColor: 'transparent',
          zIndex: 999,
          pointerEvents: 'all',
        }}
        data-no-drag
        data-no-pan
        onPointerDown={(e) => handlePointerDown(e, 'end')}
        onContextMenu={(e) => e.preventDefault()}
        title="Drag to move end point"
      />
      
      {/* Selection indicator */}
      {selected && (
        <div 
          className="absolute pointer-events-none"
          style={{
            left: Math.min(startX, endX) - 6,
            top: Math.min(startY, endY) - 6,
            width: Math.abs(endX - startX) + 12,
            height: Math.abs(endY - startY) + 12,
            border: '2px dashed #3b82f6',
            borderRadius: 4,
          }}
        />
      )}
    </div>
  );
};

export default memo(ArrowNode);
