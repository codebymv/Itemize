import React from 'react';
import { CheckSquare, StickyNote, Palette } from 'lucide-react';
import { List } from '../../types';

interface ContextMenuProps {
  position: { x: number, y: number };
  onAddList: () => void;
  onAddNote?: () => void; // Optional for now, will make required as we implement
  onAddWhiteboard?: () => void; // Add whiteboard support
  onClose: () => void;
  isFromButton?: boolean;
  absolutePosition?: { x: number, y: number };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ 
  position, 
  onAddList,
  onAddNote,
  onAddWhiteboard,
  onClose,
  isFromButton = false,
  absolutePosition
}) => {
  // Handle clicking on a menu item
  const handleClickItem = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation(); // Prevent the click from bubbling to the canvas
    action();
  };

  return (
    <div 
      className={`context-menu ${isFromButton ? 'dropdown-menu' : ''} bg-background border border-border rounded-md shadow-lg`}
      style={{
        position: isFromButton ? 'fixed' : 'absolute',
        top: isFromButton && absolutePosition ? `${absolutePosition.y}px` : `${position.y}px`,
        left: isFromButton && absolutePosition ? `${absolutePosition.x}px` : `${position.x}px`,
        transform: 'translateX(-50%)',
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
        >
          <CheckSquare className="h-4 w-4 mr-3 text-muted-foreground" />
          <span>Add List</span>
        </button>
        {onAddNote && (
          <button 
            className="menu-item flex items-center px-4 py-3 cursor-pointer bg-transparent border-none w-full text-left font-light text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-foreground"
            onClick={(e) => handleClickItem(e, onAddNote)}
          >
            <StickyNote className="h-4 w-4 mr-3 text-muted-foreground" />
            <span>Add Note</span>
          </button>
        )}
        {onAddWhiteboard && (
          <button 
            className="menu-item flex items-center px-4 py-3 cursor-pointer bg-transparent border-none w-full text-left font-light text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-foreground"
            onClick={(e) => handleClickItem(e, onAddWhiteboard)}
          >
            <Palette className="h-4 w-4 mr-3 text-muted-foreground" />
            <span>Add Whiteboard</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default ContextMenu;
