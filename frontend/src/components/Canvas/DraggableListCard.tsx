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
}

export const DraggableListCard: React.FC<DraggableListCardProps> = ({ 
  list, 
  position,
  onPositionUpdate,
  onUpdate,
  onDelete,
  existingCategories
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
    // Only start dragging if we're clicking on the card header (not the content)
    const target = e.target as HTMLElement;
    console.log('Mouse down on:', target.className);
    
    // Allow dragging from the entire list card for better UX
    // We can uncomment the header-only restriction if needed
    // if (!target.closest('.list-card-header')) {
    //   return;
    // }
    
    e.preventDefault();
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      console.log('Starting drag at:', { x: e.clientX, y: e.clientY });
      console.log('Drag offset:', { x: e.clientX - rect.left, y: e.clientY - rect.top });
      setIsDragging(true);
    }
  };
  
  // Drag handler
  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && cardRef.current) {
      const containerRect = cardRef.current.parentElement?.getBoundingClientRect();
      if (!containerRect) return;
      
      // Calculate new position relative to container
      const newX = e.clientX - containerRect.left - dragOffset.x;
      const newY = e.clientY - containerRect.top - dragOffset.y;
      
      // Apply constraints to keep the card within the container
      const maxX = containerRect.width - cardRef.current.offsetWidth;
      const maxY = containerRect.height - cardRef.current.offsetHeight;
      
      const constrainedX = Math.max(0, Math.min(newX, maxX));
      const constrainedY = Math.max(0, Math.min(newY, maxY));
      
      // Log coordinates for debugging (only occasionally to avoid flooding console)
      if (Math.random() < 0.05) {
        console.log('Dragging to:', { constrainedX, constrainedY });
      }
      
      // Apply the new position to the element
      cardRef.current.style.left = `${constrainedX}px`;
      cardRef.current.style.top = `${constrainedY}px`;
    }
  };
  
  // Drag end handler with debounce to prevent too many API calls
  const handleMouseUp = () => {
    if (isDragging && cardRef.current) {
      console.log('Ending drag');
      setIsDragging(false);
      
      const rect = cardRef.current.getBoundingClientRect();
      const containerRect = cardRef.current.parentElement?.getBoundingClientRect();
      
      if (containerRect) {
        // Calculate position relative to the container
        const newPosition = {
          x: rect.left - containerRect.left,
          y: rect.top - containerRect.top
        };
        
        console.log('New position:', newPosition);
        
        // Update position in the database
        onPositionUpdate(list.id, newPosition);
      }
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
