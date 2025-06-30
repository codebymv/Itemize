import React, { useState, useRef, useEffect } from 'react';
import { WhiteboardCard } from '../WhiteboardCard';
import { Whiteboard, Category } from '../../types';

// Whiteboard dimension constraints to match database limits
const MIN_WHITEBOARD_WIDTH = 750;
const MIN_WHITEBOARD_HEIGHT = 650; // Absolutely ensures header + toolbar + canvas + footer always visible with buffer
const MAX_WHITEBOARD_WIDTH = 2400;
const MAX_WHITEBOARD_HEIGHT = 2400;

interface DraggableWhiteboardCardProps {
  whiteboard: Whiteboard;
  onUpdate: (whiteboardId: number, updatedData: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Whiteboard | null>;
  onDelete: (whiteboardId: number) => Promise<boolean>;
  onShare: (whiteboardId: number) => void;
  existingCategories: Category[];
  canvasTransform: { x: number; y: number; scale: number };
  onPositionChange: (whiteboardId: number, newPosition: { x: number; y: number }) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory?: (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => Promise<void>;
}

export const DraggableWhiteboardCard: React.FC<DraggableWhiteboardCardProps> = ({
  whiteboard,
  onUpdate,
  onDelete,
  onShare,
  existingCategories,
  canvasTransform,
  onPositionChange,
  isCollapsed,
  onToggleCollapsed,
  updateCategory
}) => {
  const whiteboardRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStartData, setResizeStartData] = useState({ 
    startX: 0, 
    startY: 0, 
    startWidth: 0, 
    startHeight: 0 
  });
  
  // Track if we're at maximum dimensions for visual feedback
  const currentWidth = parseFloat(whiteboardRef.current?.style.width || '') || whiteboard.canvas_width || 700;
  const currentHeight = parseFloat(whiteboardRef.current?.style.height || '') || whiteboard.canvas_height || 400;
  const isAtMaxSize = currentWidth >= MAX_WHITEBOARD_WIDTH || currentHeight >= MAX_WHITEBOARD_HEIGHT;

  // Set up initial position and size
  useEffect(() => {
    if (whiteboardRef.current) {
      whiteboardRef.current.style.left = `${whiteboard.position_x}px`;
      whiteboardRef.current.style.top = `${whiteboard.position_y}px`;
      console.log(`DraggableWhiteboardCard: Initial position for whiteboard ${whiteboard.id}: x=${whiteboard.position_x}, y=${whiteboard.position_y}`);
      console.log(`DraggableWhiteboardCard: Initial dimensions for whiteboard ${whiteboard.id}: width=${whiteboard.canvas_width}, height=${whiteboard.canvas_height}`);
    }
  }, [whiteboard.position_x, whiteboard.position_y, whiteboard.canvas_width, whiteboard.canvas_height]);

  // Drag start handler
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking on interactive elements or resize handle
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, [role="button"], [role="menuitem"], .resize-handle, .whiteboard-canvas, canvas')) {
      return;
    }

    // Don't start drag if clicking on interactive elements or canvas area
    const isInteractiveElement = target.closest('input, textarea, button, [role="button"], [role="menuitem"], .resize-handle');
    const isCanvasArea = target.closest('canvas') || target.tagName === 'CANVAS' || 
                         target.closest('.whiteboard-drawing-area') ||
                         target.closest('.react-sketch-canvas') || 
                         target.closest('[data-testid="react-sketch-canvas"]');
    
    if (isInteractiveElement || isCanvasArea) {
      return;
    }
    
    e.preventDefault();
    if (whiteboardRef.current) {
      // Calculate drag offset in canvas coordinates
      const containerRect = whiteboardRef.current.parentElement?.getBoundingClientRect();
      if (containerRect) {
        const mouseXInCanvas = (e.clientX - containerRect.left - canvasTransform.x) / canvasTransform.scale;
        const mouseYInCanvas = (e.clientY - containerRect.top - canvasTransform.y) / canvasTransform.scale;
        
        const currentLeft = parseFloat(whiteboardRef.current.style.left) || 0;
        const currentTop = parseFloat(whiteboardRef.current.style.top) || 0;
        
        setDragOffset({
          x: (mouseXInCanvas - currentLeft) * canvasTransform.scale,
          y: (mouseYInCanvas - currentTop) * canvasTransform.scale
        });
        setIsDragging(true);
      }
    }
  };
  
  // Mouse move handler for both drag and resize
  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && whiteboardRef.current) {
      const containerRect = whiteboardRef.current.parentElement?.getBoundingClientRect();
      if (!containerRect) return;
      
      // Calculate mouse position relative to canvas before transform
      const mouseXInCanvas = (e.clientX - containerRect.left - canvasTransform.x) / canvasTransform.scale;
      const mouseYInCanvas = (e.clientY - containerRect.top - canvasTransform.y) / canvasTransform.scale;
      
      // Calculate new position relative to canvas coordinates
      const newX = mouseXInCanvas - dragOffset.x / canvasTransform.scale;
      const newY = mouseYInCanvas - dragOffset.y / canvasTransform.scale;
      
      // Apply the new position to the element (in canvas coordinates)
      whiteboardRef.current.style.left = `${newX}px`;
      whiteboardRef.current.style.top = `${newY}px`;
    }

    if (isResizing && whiteboardRef.current) {
      const deltaX = e.clientX - resizeStartData.startX;
      const deltaY = e.clientY - resizeStartData.startY;
      
      // Account for canvas scale in the resize delta
      const scaledDeltaX = deltaX / canvasTransform.scale;
      const scaledDeltaY = deltaY / canvasTransform.scale;
      
      // Enforce both minimum and maximum limits to prevent database constraint errors
      const newWidth = Math.min(MAX_WHITEBOARD_WIDTH, Math.max(MIN_WHITEBOARD_WIDTH, resizeStartData.startWidth + scaledDeltaX));
      const newHeight = Math.min(MAX_WHITEBOARD_HEIGHT, Math.max(MIN_WHITEBOARD_HEIGHT, resizeStartData.startHeight + scaledDeltaY));
      
      whiteboardRef.current.style.width = `${newWidth}px`;
      whiteboardRef.current.style.height = `${newHeight}px`;
    }
  };
  
  // Mouse up handler for both drag and resize
  const handleMouseUp = () => {
    if (isDragging && whiteboardRef.current) {
      setIsDragging(false);
      
      // Get the current position from the style (which is in canvas coordinates)
      const currentLeft = parseFloat(whiteboardRef.current.style.left) || 0;
      const currentTop = parseFloat(whiteboardRef.current.style.top) || 0;
      
      const newPosition = {
        x: Math.round(currentLeft),
        y: Math.round(currentTop)
      };
      
      // Update position in the database via callback
      onPositionChange(whiteboard.id, newPosition);
    }

    if (isResizing && whiteboardRef.current) {
      setIsResizing(false);
      
      // Get current position and size from the style (in canvas coordinates)
      const currentLeft = parseFloat(whiteboardRef.current.style.left) || 0;
      const currentTop = parseFloat(whiteboardRef.current.style.top) || 0;
      const currentWidth = parseFloat(whiteboardRef.current.style.width) || whiteboard.canvas_width || 400;
      const currentHeight = parseFloat(whiteboardRef.current.style.height) || whiteboard.canvas_height || 400;
      
      const newPosition = {
        x: Math.round(currentLeft),
        y: Math.round(currentTop)
      };
      
      // Update both position and size in the database with enforced limits
      onUpdate(whiteboard.id, {
        position_x: newPosition.x,
        position_y: newPosition.y,
        canvas_width: Math.min(MAX_WHITEBOARD_WIDTH, Math.max(MIN_WHITEBOARD_WIDTH, Math.round(currentWidth))),
        canvas_height: Math.min(MAX_WHITEBOARD_HEIGHT, Math.max(MIN_WHITEBOARD_HEIGHT, Math.round(currentHeight)))
      });
    }
  };
  
  // Set up global mouse event listeners when dragging or resizing
  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStartData]);

  // Resize start handler
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent triggering drag
    
    if (whiteboardRef.current) {
      const currentWidth = parseFloat(whiteboardRef.current.style.width) || whiteboard.canvas_width || 400;
      const currentHeight = parseFloat(whiteboardRef.current.style.height) || whiteboard.canvas_height || 400;
      
      setResizeStartData({
        startX: e.clientX,
        startY: e.clientY,
        startWidth: currentWidth,
        startHeight: currentHeight
      });
      setIsResizing(true);
    }
  };

  // Wrapper functions to handle the async nature
  const handleUpdate = async (whiteboardId: number, updatedData: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      return await onUpdate(whiteboardId, updatedData);
    } catch (error) {
      console.error('Failed to update whiteboard:', error);
      return null;
    }
  };

  const handleDelete = async (whiteboardId: number) => {
    try {
      return await onDelete(whiteboardId);
    } catch (error) {
      console.error('Failed to delete whiteboard:', error);
      return false;
    }
  };

  return (
    <div 
      ref={whiteboardRef}
      onMouseDown={handleMouseDown}
      className="draggable-whiteboard-card shadow-lg rounded-lg flex flex-col overflow-hidden border relative"
      style={{
        position: 'absolute',
        width: `${whiteboard.canvas_width || 400}px`,
        height: isCollapsed ? 'auto' : `${whiteboard.canvas_height || 400}px`,
        zIndex: (isDragging || isResizing) ? 1000 : (whiteboard.z_index || 1),
        cursor: isDragging ? 'grabbing' : (isResizing ? 'nw-resize' : 'grab'),
        transition: (isDragging || isResizing) ? 'none' : 'box-shadow 0.2s, transform 0.1s',
        boxShadow: (isDragging || isResizing) ? '0 8px 16px rgba(0,0,0,0.2)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        transform: (isDragging || isResizing) ? 'scale(1.01)' : 'scale(1)',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <WhiteboardCard
        whiteboard={whiteboard}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onShare={onShare}
        existingCategories={existingCategories}
        isCollapsed={isCollapsed}
        onToggleCollapsed={onToggleCollapsed}
        updateCategory={updateCategory}
      />
      
      {/* Resize handle - bottom right corner - only show when expanded */}
      {!isCollapsed && (
        <div
          className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-nw-resize"
          onMouseDown={handleResizeMouseDown}
          style={{
            background: 'linear-gradient(-45deg, transparent 40%, #ccc 40%, #ccc 60%, transparent 60%)',
            opacity: 0.6,
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
}; 