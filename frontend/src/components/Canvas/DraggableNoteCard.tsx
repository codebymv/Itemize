import React, { useState, useRef, useEffect } from 'react';
import { Note } from '../../types';
import NoteCard from '../NoteCard/NoteCard';

interface DraggableNoteCardProps {
  note: Note;
  onPositionUpdate: (noteId: number, newPosition: { x: number; y: number }, newSize?: { width: number; height: number }) => void;
  onUpdate: (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Note | null>;
  onDelete: (noteId: number) => Promise<boolean>;
  existingCategories: string[];
  canvasTransform: { x: number, y: number, scale: number };
}

export const DraggableNoteCard: React.FC<DraggableNoteCardProps> = ({ 
  note, 
  onPositionUpdate, 
  onUpdate, 
  onDelete,
  existingCategories,
  canvasTransform
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStartData, setResizeStartData] = useState({ 
    startX: 0, 
    startY: 0, 
    startWidth: 0, 
    startHeight: 0 
  });
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Set up initial position
  useEffect(() => {
    if (cardRef.current) {
      cardRef.current.style.left = `${note.position_x}px`;
      cardRef.current.style.top = `${note.position_y}px`;
    }
  }, [note.position_x, note.position_y]);

  // Drag start handler
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking on interactive elements or resize handle
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, [role="button"], [role="menuitem"], .resize-handle, .ProseMirror, [data-rich-text-editor], [data-rich-text-toolbar]')) {
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

    if (isResizing && cardRef.current) {
      const deltaX = e.clientX - resizeStartData.startX;
      const deltaY = e.clientY - resizeStartData.startY;
      
      // Account for canvas scale in the resize delta
      const scaledDeltaX = deltaX / canvasTransform.scale;
      const scaledDeltaY = deltaY / canvasTransform.scale;
      
      const newWidth = Math.max(480, resizeStartData.startWidth + scaledDeltaX); // Min width 480px for toolbar
      const newHeight = Math.max(200, resizeStartData.startHeight + scaledDeltaY); // Min height 200px
      
      cardRef.current.style.width = `${newWidth}px`;
      cardRef.current.style.height = `${newHeight}px`;
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
      onPositionUpdate(note.id, newPosition);
    }

    if (isResizing && cardRef.current) {
      setIsResizing(false);
      
      // Get current position and size from the style (in canvas coordinates)
      const currentLeft = parseFloat(cardRef.current.style.left) || 0;
      const currentTop = parseFloat(cardRef.current.style.top) || 0;
      const currentWidth = parseFloat(cardRef.current.style.width) || note.width || 200;
      const currentHeight = parseFloat(cardRef.current.style.height) || note.height || 200;
      
      const newPosition = {
        x: Math.round(currentLeft),
        y: Math.round(currentTop)
      };
      const newSize = {
        width: Math.round(currentWidth),
        height: Math.round(currentHeight)
      };
      
      // Update both position and size in the database
      onPositionUpdate(note.id, newPosition, newSize);
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
    
    if (cardRef.current) {
      const currentWidth = parseFloat(cardRef.current.style.width) || note.width || 200;
      const currentHeight = parseFloat(cardRef.current.style.height) || note.height || 200;
      
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
  const handleUpdate = async (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      await onUpdate(noteId, updatedData);
    } catch (error) {
      console.error('Failed to update note:', error);
    }
  };

  const handleDelete = async (noteId: number) => {
    try {
      await onDelete(noteId);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  return (
    <div 
      ref={cardRef}
      onMouseDown={handleMouseDown}
      className="draggable-note-card shadow-lg rounded-lg flex flex-col overflow-hidden border relative"
      style={{
        position: 'absolute',
                  width: `${note.width || 520}px`,
        height: isCollapsed ? 'auto' : `${note.height || 300}px`,
        zIndex: (isDragging || isResizing) ? 1000 : (note.z_index || 1),
        cursor: isDragging ? 'grabbing' : (isResizing ? 'nw-resize' : 'grab'),
        transition: (isDragging || isResizing) ? 'none' : 'box-shadow 0.2s, transform 0.1s',
        boxShadow: (isDragging || isResizing) ? '0 8px 16px rgba(0,0,0,0.2)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        transform: (isDragging || isResizing) ? 'scale(1.01)' : 'scale(1)',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <NoteCard
        note={note}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        existingCategories={existingCategories}
        onCollapsibleChange={(isOpen) => setIsCollapsed(!isOpen)}
      />
      
      {/* Resize handle - bottom right corner - only show when expanded */}
      {!isCollapsed && (
        <div
          className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-nw-resize"
          onMouseDown={handleResizeMouseDown}
          style={{
            background: 'linear-gradient(-45deg, transparent 40%, #ccc 40%, #ccc 60%, transparent 60%)',
            opacity: 0.6,
          }}
        />
      )}
    </div>
  );
};
