import React from 'react';
import { CheckSquare, StickyNote, Palette, GitBranch } from 'lucide-react';
import { List } from '../../types';

interface ContextMenuProps {
  position: { x: number, y: number };
  onAddList: () => void;
  onAddNote?: () => void; // Optional for now, will make required as we implement
  onAddWhiteboard?: () => void; // Add whiteboard support
  onAddWireframe?: () => void; // Add wireframe support
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
      className={`context-menu ${isFromButton ? 'dropdown-menu' : ''} bg-background border border-border rounded-md shadow-lg`}
      style={{
        position: isFromButton ? 'fixed' : 'absolute',
        ...positionStyle,
        zIndex: 2000, // Higher z-index to ensure it's above everything
        padding: '0.5rem 0',
        minWidth: '180px',
        marginTop: isFromButton ? '0' : '10px'
      }}
      onClick={(e) => e.stopPropagation()} // Prevent clicks from closing the menu
    >
      <div className="menu-items">
        <button 
          className="menu-item flex items-center px-4 py-3 cursor-pointer bg-transparent border-none w-full text-left font-light text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-foreground"
          onClick={(e) => handleClickItem(e, onAddList)}
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          <CheckSquare className="h-4 w-4 mr-3 text-blue-600" />
          <span>Add List</span>
        </button>
        {onAddNote && (
          <button 
            className="menu-item flex items-center px-4 py-3 cursor-pointer bg-transparent border-none w-full text-left font-light text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-foreground"
            onClick={(e) => handleClickItem(e, onAddNote)}
            style={{ fontFamily: '"Raleway", sans-serif' }}
          >
            <StickyNote className="h-4 w-4 mr-3 text-blue-600" />
            <span>Add Note</span>
          </button>
        )}
        {onAddWhiteboard && (
          <button 
            className="menu-item flex items-center px-4 py-3 cursor-pointer bg-transparent border-none w-full text-left font-light text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-foreground"
            onClick={(e) => handleClickItem(e, onAddWhiteboard)}
            style={{ fontFamily: '"Raleway", sans-serif' }}
          >
            <Palette className="h-4 w-4 mr-3 text-blue-600" />
            <span>Add Whiteboard</span>
          </button>
        )}
        {onAddWireframe && (
          <button 
            className="menu-item flex items-center px-4 py-3 cursor-pointer bg-transparent border-none w-full text-left font-light text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-foreground"
            onClick={(e) => handleClickItem(e, onAddWireframe)}
            style={{ fontFamily: '"Raleway", sans-serif' }}
          >
            <GitBranch className="h-4 w-4 mr-3 text-blue-600" />
            <span>Add Wireframe</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default ContextMenu;
