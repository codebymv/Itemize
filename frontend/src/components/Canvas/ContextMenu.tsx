import React from 'react';
import { CheckSquare, StickyNote } from 'lucide-react';
import { List } from '../../types';

interface ContextMenuProps {
  position: { x: number, y: number };
  onAddList: () => void;
  onAddNote?: () => void; // Optional for now, will make required as we implement
  onClose: () => void;
  isFromButton?: boolean;
  absolutePosition?: { x: number, y: number };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ 
  position, 
  onAddList,
  onAddNote,
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
      className={`context-menu ${isFromButton ? 'dropdown-menu' : ''}`}
      style={{
        position: isFromButton ? 'fixed' : 'absolute',
        top: isFromButton && absolutePosition ? `${absolutePosition.y}px` : `${position.y}px`,
        left: isFromButton && absolutePosition ? `${absolutePosition.x}px` : `${position.x}px`,
        transform: 'translateX(-50%)',
        zIndex: 2000, // Higher z-index to ensure it's above everything
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '0.375rem',
        boxShadow: isFromButton 
          ? '0 4px 12px rgba(0,0,0,0.15)'
          : '0 4px 15px rgba(0,0,0,0.3)',
        padding: '0.5rem 0',
        minWidth: '180px',
        marginTop: isFromButton ? '0' : '10px'
      }}
      onClick={(e) => e.stopPropagation()} // Prevent clicks from closing the menu
    >
      <div className="menu-items">
        <button 
          className="menu-item"
          onClick={(e) => handleClickItem(e, onAddList)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            border: 'none',
            width: '100%',
            textAlign: 'left',
            fontWeight: '300',
            fontSize: '0.875rem',
            transition: 'background-color 0.15s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <CheckSquare className="h-4 w-4 mr-3 text-slate-500" />
          <span>Add List</span>
        </button>
        {onAddNote && (
          <button 
            className="menu-item"
            onClick={(e) => handleClickItem(e, onAddNote)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              border: 'none',
              width: '100%',
              textAlign: 'left',
              fontWeight: '300',
              fontSize: '0.875rem',
              transition: 'background-color 0.15s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <StickyNote className="h-4 w-4 mr-3 text-slate-500" />
            <span>Add Note</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default ContextMenu;
