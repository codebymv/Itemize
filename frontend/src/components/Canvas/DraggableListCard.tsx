import React, { useState, useRef, useEffect } from 'react';
import { ListCard } from '../../components/ListCard';
import { List } from '../../types';

interface DraggableListCardProps {
  list: List;
  onUpdate: (listData: any) => Promise<any>;
  onDelete: (listId: string) => Promise<boolean>;
  existingCategories: string[];
  canvasTransform: { x: number; y: number; scale: number };
  onPositionChange: (listId: string, newPosition: { x: number; y: number }) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<any>;
}

export const DraggableListCard: React.FC<DraggableListCardProps> = ({
  list,
  onUpdate,
  onDelete,
  existingCategories,
  canvasTransform,
  onPositionChange,
  isCollapsed,
  onToggleCollapsed,
  addCategory
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStartData, setResizeStartData] = useState({ 
    startX: 0, 
    startY: 0, 
    startWidth: 0, 
    startHeight: 0 
  });

  // Set up initial position and size
  useEffect(() => {
    if (listRef.current) {
      listRef.current.style.left = `${list.position_x || 0}px`;
      listRef.current.style.top = `${list.position_y || 0}px`;
    }
  }, [list.position_x, list.position_y]);

  // Drag start handler
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking on interactive elements or resize handle
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, [role="button"], [role="menuitem"], .resize-handle')) {
      return;
    }
    
    e.preventDefault();
    if (listRef.current) {
      // Calculate drag offset in canvas coordinates
      const containerRect = listRef.current.parentElement?.getBoundingClientRect();
      if (containerRect) {
        const mouseXInCanvas = (e.clientX - containerRect.left - canvasTransform.x) / canvasTransform.scale;
        const mouseYInCanvas = (e.clientY - containerRect.top - canvasTransform.y) / canvasTransform.scale;
        
        const currentLeft = parseFloat(listRef.current.style.left) || 0;
        const currentTop = parseFloat(listRef.current.style.top) || 0;
        
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
    if (isDragging && listRef.current) {
      const containerRect = listRef.current.parentElement?.getBoundingClientRect();
      if (!containerRect) return;
      
      // Calculate mouse position relative to canvas before transform
      const mouseXInCanvas = (e.clientX - containerRect.left - canvasTransform.x) / canvasTransform.scale;
      const mouseYInCanvas = (e.clientY - containerRect.top - canvasTransform.y) / canvasTransform.scale;
      
      // Calculate new position relative to canvas coordinates
      const newX = mouseXInCanvas - dragOffset.x / canvasTransform.scale;
      const newY = mouseYInCanvas - dragOffset.y / canvasTransform.scale;
      
      // Apply the new position to the element (in canvas coordinates)
      listRef.current.style.left = `${newX}px`;
      listRef.current.style.top = `${newY}px`;
    }

    if (isResizing && listRef.current) {
      const deltaX = e.clientX - resizeStartData.startX;
      const deltaY = e.clientY - resizeStartData.startY;
      
      // Account for canvas scale in the resize delta
      const scaledDeltaX = deltaX / canvasTransform.scale;
      const scaledDeltaY = deltaY / canvasTransform.scale;
      
      const newWidth = Math.max(280, resizeStartData.startWidth + scaledDeltaX); // Min width 280px
      const newHeight = Math.max(200, resizeStartData.startHeight + scaledDeltaY); // Min height 200px
      
      listRef.current.style.width = `${newWidth}px`;
      listRef.current.style.height = `${newHeight}px`;
    }
  };
  
  // Mouse up handler for both drag and resize
  const handleMouseUp = () => {
    if (isDragging && listRef.current) {
      setIsDragging(false);
      
      // Get the current position from the style (which is in canvas coordinates)
      const currentLeft = parseFloat(listRef.current.style.left) || 0;
      const currentTop = parseFloat(listRef.current.style.top) || 0;
      
      const newPosition = {
        x: Math.round(currentLeft),
        y: Math.round(currentTop)
      };
      
      // Update position in the database via callback
      onPositionChange(list.id, newPosition);
    }

    if (isResizing && listRef.current) {
      setIsResizing(false);
      
      // Get current position and size from the style (in canvas coordinates)
      const currentLeft = parseFloat(listRef.current.style.left) || 0;
      const currentTop = parseFloat(listRef.current.style.top) || 0;
      const currentWidth = parseFloat(listRef.current.style.width) || list.width || 340;
      const currentHeight = parseFloat(listRef.current.style.height) || list.height || 265;
      
      // Update both position and size in the database
      onUpdate({
        ...list,
        position_x: Math.round(currentLeft),
        position_y: Math.round(currentTop),
        width: Math.round(currentWidth),
        height: Math.round(currentHeight)
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
    
    if (listRef.current) {
      const currentWidth = parseFloat(listRef.current.style.width) || list.width || 340;
      const currentHeight = parseFloat(listRef.current.style.height) || list.height || 265;
      
      setResizeStartData({
        startX: e.clientX,
        startY: e.clientY,
        startWidth: currentWidth,
        startHeight: currentHeight
      });
      setIsResizing(true);
    }
  };

  return (
    <div 
      ref={listRef}
      onMouseDown={handleMouseDown}
      className="draggable-list-card shadow-lg rounded-lg flex flex-col overflow-hidden border relative"
      style={{
        position: 'absolute',
        width: `${list.width || 340}px`,
        height: isCollapsed ? 'auto' : `${list.height || 265}px`,
        zIndex: (isDragging || isResizing) ? 1000 : 1,
        cursor: isDragging ? 'grabbing' : (isResizing ? 'nw-resize' : 'grab'),
        transition: (isDragging || isResizing) ? 'none' : 'box-shadow 0.2s, transform 0.1s',
        boxShadow: (isDragging || isResizing) ? '0 8px 16px rgba(0,0,0,0.2)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        transform: (isDragging || isResizing) ? 'scale(1.01)' : 'scale(1)',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <ListCard
        list={list}
        onUpdate={onUpdate}
        onDelete={onDelete}
        existingCategories={existingCategories}
        isCollapsed={isCollapsed}
        onToggleCollapsed={onToggleCollapsed}
        addCategory={addCategory}
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

export default DraggableListCard;
