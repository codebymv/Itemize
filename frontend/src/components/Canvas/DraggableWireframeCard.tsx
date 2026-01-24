import React, { useState, useRef, useEffect } from 'react';
import { WireframeCard } from '../WireframeCard';
import { Wireframe, Category } from '../../types';

// Wireframe dimension constraints
const MIN_WIREFRAME_WIDTH = 500;
const MIN_WIREFRAME_HEIGHT = 400;
const MAX_WIREFRAME_WIDTH = 2400;
const MAX_WIREFRAME_HEIGHT = 2400;

interface DraggableWireframeCardProps {
  wireframe: Wireframe;
  onUpdate: (wireframeId: number, updatedData: Partial<Omit<Wireframe, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Wireframe | null>;
  onDelete: (wireframeId: number) => Promise<boolean>;
  onShare: (wireframeId: number) => void;
  existingCategories: Category[];
  canvasTransform: { x: number; y: number; scale: number };
  onPositionChange: (wireframeId: number, newPosition: { x: number; y: number }) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory?: (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => Promise<void>;
}

export const DraggableWireframeCard: React.FC<DraggableWireframeCardProps> = ({
  wireframe,
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
  const wireframeRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStartData, setResizeStartData] = useState({ 
    startX: 0, 
    startY: 0, 
    startWidth: 0, 
    startHeight: 0 
  });
  
  // Default dimensions for wireframes
  const defaultWidth = 600;
  const defaultHeight = 600;

  // Set up initial position and size
  useEffect(() => {
    if (wireframeRef.current) {
      wireframeRef.current.style.left = `${wireframe.position_x}px`;
      wireframeRef.current.style.top = `${wireframe.position_y}px`;
      // Set initial width/height from database or defaults
      wireframeRef.current.style.width = `${wireframe.width || defaultWidth}px`;
      wireframeRef.current.style.height = `${wireframe.height || defaultHeight}px`;
    }
  }, [wireframe.position_x, wireframe.position_y, wireframe.width, wireframe.height]);

  // Drag start handler
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking on interactive elements or resize handle
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, [role="button"], [role="menuitem"], .resize-handle, .react-flow')) {
      return;
    }

    // Don't start drag if clicking on interactive elements or flow canvas area
    const isInteractiveElement = target.closest('input, textarea, button, [role="button"], [role="menuitem"], .resize-handle');
    const isFlowCanvas = target.closest('.react-flow__viewport') || 
                         target.closest('.react-flow__node') ||
                         target.closest('.react-flow__edge');
    
    if (isInteractiveElement || isFlowCanvas) {
      return;
    }
    
    e.preventDefault();
    if (wireframeRef.current) {
      // Calculate drag offset in canvas coordinates
      const containerRect = wireframeRef.current.parentElement?.getBoundingClientRect();
      if (containerRect) {
        const mouseXInCanvas = (e.clientX - containerRect.left - canvasTransform.x) / canvasTransform.scale;
        const mouseYInCanvas = (e.clientY - containerRect.top - canvasTransform.y) / canvasTransform.scale;
        
        const currentLeft = parseFloat(wireframeRef.current.style.left) || 0;
        const currentTop = parseFloat(wireframeRef.current.style.top) || 0;
        
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
    if (isDragging && wireframeRef.current) {
      const containerRect = wireframeRef.current.parentElement?.getBoundingClientRect();
      if (!containerRect) return;
      
      // Calculate mouse position relative to canvas before transform
      const mouseXInCanvas = (e.clientX - containerRect.left - canvasTransform.x) / canvasTransform.scale;
      const mouseYInCanvas = (e.clientY - containerRect.top - canvasTransform.y) / canvasTransform.scale;
      
      // Calculate new position relative to canvas coordinates
      const newX = mouseXInCanvas - dragOffset.x / canvasTransform.scale;
      const newY = mouseYInCanvas - dragOffset.y / canvasTransform.scale;
      
      // Apply the new position to the element (in canvas coordinates)
      wireframeRef.current.style.left = `${newX}px`;
      wireframeRef.current.style.top = `${newY}px`;
    }

    if (isResizing && wireframeRef.current) {
      const deltaX = e.clientX - resizeStartData.startX;
      const deltaY = e.clientY - resizeStartData.startY;
      
      // Account for canvas scale in the resize delta
      const scaledDeltaX = deltaX / canvasTransform.scale;
      const scaledDeltaY = deltaY / canvasTransform.scale;
      
      // Enforce both minimum and maximum limits
      const newWidth = Math.min(MAX_WIREFRAME_WIDTH, Math.max(MIN_WIREFRAME_WIDTH, resizeStartData.startWidth + scaledDeltaX));
      const newHeight = Math.min(MAX_WIREFRAME_HEIGHT, Math.max(MIN_WIREFRAME_HEIGHT, resizeStartData.startHeight + scaledDeltaY));
      
      wireframeRef.current.style.width = `${newWidth}px`;
      wireframeRef.current.style.height = `${newHeight}px`;
    }
  };
  
  // Mouse up handler for both drag and resize
  const handleMouseUp = () => {
    if (isDragging && wireframeRef.current) {
      setIsDragging(false);
      
      // Get the current position from the style (which is in canvas coordinates)
      const currentLeft = parseFloat(wireframeRef.current.style.left) || 0;
      const currentTop = parseFloat(wireframeRef.current.style.top) || 0;
      
      const newPosition = {
        x: Math.round(currentLeft),
        y: Math.round(currentTop)
      };
      
      // Update position in the database via callback
      onPositionChange(wireframe.id, newPosition);
    }

    if (isResizing && wireframeRef.current) {
      setIsResizing(false);
      
      // Get current position and size from the style
      const currentLeft = parseFloat(wireframeRef.current.style.left) || 0;
      const currentTop = parseFloat(wireframeRef.current.style.top) || 0;
      const currentWidth = parseFloat(wireframeRef.current.style.width) || wireframe.width || defaultWidth;
      const currentHeight = parseFloat(wireframeRef.current.style.height) || wireframe.height || defaultHeight;
      
      const newPosition = {
        x: Math.round(currentLeft),
        y: Math.round(currentTop)
      };
      
      // Update position and size in the database
      onUpdate(wireframe.id, {
        position_x: newPosition.x,
        position_y: newPosition.y,
        width: Math.min(MAX_WIREFRAME_WIDTH, Math.max(MIN_WIREFRAME_WIDTH, Math.round(currentWidth))),
        height: Math.min(MAX_WIREFRAME_HEIGHT, Math.max(MIN_WIREFRAME_HEIGHT, Math.round(currentHeight)))
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
    e.stopPropagation();
    
    if (wireframeRef.current) {
      const currentWidth = parseFloat(wireframeRef.current.style.width) || wireframe.width || defaultWidth;
      const currentHeight = parseFloat(wireframeRef.current.style.height) || wireframe.height || defaultHeight;
      
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
  const handleUpdate = async (wireframeId: number, updatedData: Partial<Omit<Wireframe, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      return await onUpdate(wireframeId, updatedData);
    } catch (error) {
      console.error('Failed to update wireframe:', error);
      return null;
    }
  };

  const handleDelete = async (wireframeId: number) => {
    try {
      return await onDelete(wireframeId);
    } catch (error) {
      console.error('Failed to delete wireframe:', error);
      return false;
    }
  };

  return (
    <div 
      ref={wireframeRef}
      onMouseDown={handleMouseDown}
      className="draggable-wireframe-card shadow-lg rounded-lg flex flex-col overflow-hidden border relative"
      style={{
        position: 'absolute',
        width: `${wireframe.width || defaultWidth}px`,
        height: isCollapsed ? 'auto' : `${wireframe.height || defaultHeight}px`,
        zIndex: (isDragging || isResizing) ? 1000 : (wireframe.z_index || 1),
        cursor: isDragging ? 'grabbing' : (isResizing ? 'nw-resize' : 'grab'),
        transition: (isDragging || isResizing) ? 'none' : 'box-shadow 0.2s',
        boxShadow: (isDragging || isResizing) ? '0 8px 16px rgba(0,0,0,0.2)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <WireframeCard
        wireframe={wireframe}
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
