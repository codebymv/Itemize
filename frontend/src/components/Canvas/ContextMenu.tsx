import React from 'react';
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
    if (!isFromButton || !absolutePosition) {
      return {
        top: `${position.y}px`,
        left: `${position.x}px`,
        transform: 'translateX(-50%)'
      };
    }

    const menuWidth = 180; // minWidth of the menu
    const viewportWidth = window.innerWidth;
    const padding = 16; // Safe padding from screen edges
    
    let left = absolutePosition.x;
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
      top: `${absolutePosition.y}px`,
      left: `${left}px`,
      transform
    };
  };

  const positionStyle = getResponsivePosition();

  return (
    <div 
      className="context-menu min-w-[180px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{
        position: isFromButton ? 'fixed' : 'absolute',
        ...positionStyle,
        zIndex: 10000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button 
        className="group/menu relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground bg-transparent border-none text-left"
        onClick={(e) => handleClickItem(e, onAddList)}
        style={{ fontFamily: '"Raleway", sans-serif' }}
      >
        <CheckSquare className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
        <span>Add List</span>
      </button>
      {onAddNote && (
        <button 
          className="group/menu relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground bg-transparent border-none text-left"
          onClick={(e) => handleClickItem(e, onAddNote)}
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          <StickyNote className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
          <span>Add Note</span>
        </button>
      )}
      {onAddWhiteboard && (
        <button 
          className="group/menu relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground bg-transparent border-none text-left"
          onClick={(e) => handleClickItem(e, onAddWhiteboard)}
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          <Palette className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
          <span>Add Whiteboard</span>
        </button>
      )}
      {onAddWireframe && (
        <button 
          className="group/menu relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground bg-transparent border-none text-left"
          onClick={(e) => handleClickItem(e, onAddWireframe)}
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          <GitBranch className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
          <span>Add Wireframe</span>
        </button>
      )}
      {onAddVault && (
        <button 
          className="group/menu relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground bg-transparent border-none text-left"
          onClick={(e) => handleClickItem(e, onAddVault)}
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          <KeyRound className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
          <span>Add Vault</span>
        </button>
      )}
    </div>
  );
};

export default ContextMenu;
