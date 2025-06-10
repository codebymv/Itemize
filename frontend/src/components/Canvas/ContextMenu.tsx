import React from 'react';
import { List } from '../../types';

interface ContextMenuProps {
  position: { x: number, y: number };
  onAddList: () => void;
  onClose: () => void;
  isFromButton?: boolean;
  absolutePosition?: { x: number, y: number };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ 
  position, 
  onAddList,
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
        zIndex: 1000,
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '0.375rem',
        boxShadow: isFromButton 
          ? '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)' 
          : '0 2px 10px rgba(0,0,0,0.1)',
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
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            border: 'none',
            width: '100%',
            textAlign: 'left',
            fontWeight: '500',
            fontSize: '0.875rem'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-1)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span className="icon" style={{ marginRight: '0.5rem' }}>+</span>
          <span>Add List</span>
        </button>
      </div>
    </div>
  );
};

export default ContextMenu;
