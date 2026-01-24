import React, { useState, useRef, useEffect } from 'react';
import { Vault, VaultItem, Category } from '../../types';
import { VaultCard } from '../VaultCard';

interface DraggableVaultCardProps {
  vault: Vault;
  onPositionUpdate: (vaultId: number, newPosition: { x: number; y: number }, newSize?: { width: number; height: number }) => void;
  onUpdate: (vaultId: number, updatedData: Partial<Omit<Vault, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Vault | null>;
  onDelete: (vaultId: number) => Promise<boolean>;
  onShare: (vaultId: number) => void;
  existingCategories: Category[];
  canvasTransform: { x: number, y: number, scale: number };
  updateCategory?: (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => Promise<void>;
}

export const DraggableVaultCard: React.FC<DraggableVaultCardProps> = ({
  vault,
  onPositionUpdate,
  onUpdate,
  onDelete,
  onShare,
  existingCategories,
  canvasTransform,
  updateCategory
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
      cardRef.current.style.left = `${vault.position_x}px`;
      cardRef.current.style.top = `${vault.position_y}px`;
    }
  }, [vault.position_x, vault.position_y]);

  // Drag start handler
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking on interactive elements or resize handle
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, [role="button"], [role="menuitem"], .resize-handle, select, [data-radix-collection-item]')) {
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
      
      const newWidth = Math.max(350, resizeStartData.startWidth + scaledDeltaX); // Min width 350px for vault
      const newHeight = Math.max(250, resizeStartData.startHeight + scaledDeltaY); // Min height 250px for vault
      
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
      onPositionUpdate(vault.id, newPosition);
    }

    if (isResizing && cardRef.current) {
      setIsResizing(false);
      
      // Get current position and size from the style (in canvas coordinates)
      const currentLeft = parseFloat(cardRef.current.style.left) || 0;
      const currentTop = parseFloat(cardRef.current.style.top) || 0;
      const currentWidth = parseFloat(cardRef.current.style.width) || vault.width || 400;
      const currentHeight = parseFloat(cardRef.current.style.height) || vault.height || 300;
      
      const newPosition = {
        x: Math.round(currentLeft),
        y: Math.round(currentTop)
      };
      const newSize = {
        width: Math.round(currentWidth),
        height: Math.round(currentHeight)
      };
      
      // Update both position and size in the database
      onPositionUpdate(vault.id, newPosition, newSize);
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
      const currentWidth = parseFloat(cardRef.current.style.width) || vault.width || 400;
      const currentHeight = parseFloat(cardRef.current.style.height) || vault.height || 300;
      
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
  const handleUpdate = async (vaultId: number, updatedData: Partial<Omit<Vault, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      return await onUpdate(vaultId, updatedData);
    } catch (error) {
      console.error('Failed to update vault:', error);
      return null;
    }
  };

  const handleDelete = async (vaultId: number) => {
    try {
      return await onDelete(vaultId);
    } catch (error) {
      console.error('Failed to delete vault:', error);
      return false;
    }
  };

  return (
    <div 
      ref={cardRef}
      onMouseDown={handleMouseDown}
      className="draggable-vault-card shadow-lg rounded-lg flex flex-col overflow-hidden border relative"
      style={{
        position: 'absolute',
        width: `${vault.width || 400}px`,
        height: isCollapsed ? 'auto' : `${vault.height || 300}px`,
        zIndex: (isDragging || isResizing) ? 1000 : (vault.z_index || 1),
        cursor: isDragging ? 'grabbing' : (isResizing ? 'nw-resize' : 'grab'),
        transition: (isDragging || isResizing) ? 'none' : 'box-shadow 0.2s',
        boxShadow: (isDragging || isResizing) ? '0 8px 16px rgba(0,0,0,0.2)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <VaultCard
        vault={vault}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onShare={onShare}
        existingCategories={existingCategories}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => setIsCollapsed(!isCollapsed)}
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
          }}
        />
      )}
    </div>
  );
};
