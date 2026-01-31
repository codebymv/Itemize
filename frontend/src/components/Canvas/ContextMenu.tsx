import React from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, StickyNote, Palette, GitBranch, KeyRound } from 'lucide-react';
import { List } from '../../types';

interface ContextMenuProps {
  position: { x: number, y: number };
  onAddList: () => void;
  onAddNote?: () => void; // Optional for now, will make required as we implement
  onAddWhiteboard?: () => void; // Add whiteboard support
  onAddWireframe?: () => void; // Add wireframe support
  onAddVault?: () => void; // Add vault support
  onClose: () => void;
  isFromButton?: boolean;
  absolutePosition?: { x: number, y: number };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ 
  position, 
  onAddList,
  onAddNote,
  onAddWhiteboard,
  onAddWireframe,
  onAddVault,
  onClose,
  isFromButton = false,
  absolutePosition
}) => {
  // Handle clicking on a menu item
  const handleClickItem = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation(); // Prevent the click from bubbling to the canvas
    action();
  };

  // Calculate responsive positioning for mobile
  const getResponsivePosition = () => {
    const menuWidth = 180; // minWidth of the menu
    const viewportWidth = window.innerWidth;
    const padding = 16; // Safe padding from screen edges
    
    // Prefer absolutePosition (screen coordinates) when available for correct zoom behavior
    let x, y;
    
    if (absolutePosition) {
      x = absolutePosition.x;
      y = absolutePosition.y;
    } else {
      x = position.x;
      y = position.y;
    }
    
    let left = x;
    let transform = 'translateX(-50%)';
    
    // Check if menu would overflow on the right
    if (left + menuWidth / 2 > viewportWidth - padding) {
      // Position menu to the left of the button
      left = viewportWidth - menuWidth - padding;
      transform = 'translateX(0)';
    }
    // Check if menu would overflow on the left
    else if (left - menuWidth / 2 < padding) {
      // Position menu to the right edge with padding
      left = padding;
      transform = 'translateX(0)';
    }
    
    return {
      top: `${y}px`,
      left: `${left}px`,
      transform
    };
  };

  const positionStyle = getResponsivePosition();

  // Use portal to render at body level so menu is not affected by parent transforms (zoom)
  const content = (
    <div 
      className="context-menu min-w-[180px] overflow-hidden rounded-md border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground shadow-md"
      style={{
        position: 'fixed',
        ...positionStyle,
        zIndex: 10000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button 
        className="group/menu relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground bg-transparent border-none text-left font-raleway"
        onClick={(e) => handleClickItem(e, onAddList)}
      >
        <CheckSquare className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
        <span>Add List</span>
      </button>
      {onAddNote && (
        <button 
          className="group/menu relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground bg-transparent border-none text-left font-raleway"
          onClick={(e) => handleClickItem(e, onAddNote)}
        >
          <StickyNote className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
          <span>Add Note</span>
        </button>
      )}
      {onAddWhiteboard && (
        <button 
          className="group/menu relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground bg-transparent border-none text-left font-raleway"
          onClick={(e) => handleClickItem(e, onAddWhiteboard)}
        >
          <Palette className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
          <span>Add Whiteboard</span>
        </button>
      )}
      {onAddWireframe && (
        <button 
          className="group/menu relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground bg-transparent border-none text-left font-raleway"
          onClick={(e) => handleClickItem(e, onAddWireframe)}
        >
          <GitBranch className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
          <span>Add Wireframe</span>
        </button>
      )}
      {onAddVault && (
        <button 
          className="group/menu relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground bg-transparent border-none text-left font-raleway"
          onClick={(e) => handleClickItem(e, onAddVault)}
        >
          <KeyRound className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
          <span>Add Vault</span>
        </button>
      )}
    </div>
  );

  return createPortal(content, document.body);
};

export default ContextMenu;