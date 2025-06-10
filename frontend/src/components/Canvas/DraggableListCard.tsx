import React, { useState, useRef, useEffect } from 'react';
import { ListCard } from '../../components/ListCard';
import { List } from '../../types';

interface DraggableListCardProps {
  list: List;
  position: { x: number, y: number };
  onPositionUpdate: (listId: string, position: { x: number, y: number }) => void;
  onUpdate: (list: List) => void;
  onDelete: (listId: string) => void;
  existingCategories: string[];
  canvasTransform: { x: number, y: number, scale: number };
}

export const DraggableListCard: React.FC<DraggableListCardProps> = ({ 
  list, 
  position,
  onPositionUpdate,
  onUpdate,
  onDelete,
  existingCategories,
  canvasTransform
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Set up initial position
  useEffect(() => {
    if (cardRef.current) {
      cardRef.current.style.left = `${position.x}px`;
      cardRef.current.style.top = `${position.y}px`;
    }
  }, [position.x, position.y]);
  
  // Drag start handler
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking on interactive elements or list item drag handles
    const target = e.target as HTMLElement;
    console.log('Mouse down on:', target.className);
    
    // Prevent dragging when clicking on list item controls
    if (target.closest('input, textarea, button, [role="button"], [role="menuitem"], .resize-handle, [data-dnd-kit]')) {
      return;
    }
    
    // Prevent dragging when clicking on list item drag handles or their containers
    if (target.closest('[data-sortable-handle], [data-sortable-item]')) {
      return;
    }
    
    // Check if clicking on a GripVertical icon (our drag handle)
    if (target.closest('svg') && target.closest('svg')?.getAttribute('data-lucide') === 'grip-vertical') {
      return;
    }
    
    e.preventDefault();
    if (cardRef.current) {
      // Calculate drag offset in canvas coordinates
      const containerRect = cardRef.current.parentElement?.getBoundingClientRect();
      if (containerRect) {
        const mouseXInCanvas = (e.clientX - containerRect.left - canvasTransform.x) / canvasTransform.scale;
        const mouseYInCanvas = (e.clientY - containerRect.top - canvasTransform.y) / canvasTransform.scale;
        
        const currentLeft = parseFloat(cardRef.current.style.left) || 0;
        const currentTop = parseFloat(cardRef.current.style.top) || 0;
        
        setDragOffset({
          x: (mouseXInCanvas - currentLeft) * canvasTransform.scale,
          y: (mouseYInCanvas - currentTop) * canvasTransform.scale
        });
        setIsDragging(true);
      }
    }
  };
  
  // Drag handler
  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && cardRef.current) {
      const containerRect = cardRef.current.parentElement?.getBoundingClientRect();
      if (!containerRect) return;
      
      // Calculate mouse position relative to canvas before transform
      const mouseXInCanvas = (e.clientX - containerRect.left - canvasTransform.x) / canvasTransform.scale;
      const mouseYInCanvas = (e.clientY - containerRect.top - canvasTransform.y) / canvasTransform.scale;
      
      // Calculate new position relative to canvas coordinates
      const newX = mouseXInCanvas - dragOffset.x / canvasTransform.scale;
      const newY = mouseYInCanvas - dragOffset.y / canvasTransform.scale;
      
      // Apply the new position to the element (in canvas coordinates)
      cardRef.current.style.left = `${newX}px`;
      cardRef.current.style.top = `${newY}px`;
    }
  };
  
  // Drag end handler
  const handleMouseUp = () => {
    if (isDragging && cardRef.current) {
      setIsDragging(false);
      
      // Get the current position from the style (which is in canvas coordinates)
      const currentLeft = parseFloat(cardRef.current.style.left) || 0;
      const currentTop = parseFloat(cardRef.current.style.top) || 0;
      
      const newPosition = {
        x: Math.round(currentLeft),
        y: Math.round(currentTop)
      };
      
      // Update position in the database
      onPositionUpdate(list.id, newPosition);
    }
  };
  
  // Set up global mouse event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  return (
    <div 
      className="draggable-list-card"
      ref={cardRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        zIndex: isDragging ? 1000 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        width: '320px',
        transition: isDragging ? 'none' : 'box-shadow 0.2s, transform 0.1s',
        // Remove the extra shadow when not dragging to match the Lists page style
        boxShadow: isDragging ? '0 8px 16px rgba(0,0,0,0.2)' : 'none',
        transform: isDragging ? 'scale(1.01)' : 'scale(1)',
        userSelect: 'none',  // Prevent text selection during drag
        touchAction: 'none',  // Improve touch interactions
        // Remove extra padding that might be causing inconsistency
        padding: 0,
        margin: 0,
      }}
    >
      <ListCard 
        list={list}
        onUpdate={onUpdate}
        onDelete={onDelete}
        existingCategories={existingCategories}
      />
    </div>
  );
};

export default DraggableListCard;
