import React, { useState, useEffect, useRef } from 'react';
import { DraggableListCard } from './DraggableListCard';
import { ContextMenu } from './ContextMenu';
import { List } from '@/types';
import { fetchCanvasLists, updateListPosition } from '../../services/api';
import { NewListModal } from '../../components/NewListModal';
import Spinner from '../../components/ui/Spinner';

interface CanvasContainerProps {
  existingCategories: string[];
  searchQuery?: string;
  onReady?: (methods: CanvasContainerMethods) => void;
}

export interface CanvasContainerMethods {
  showAddListMenu: (position: { x: number, y: number }, isFromButton?: boolean, absolutePosition?: { x: number, y: number }) => void;
  hideContextMenu: () => void;
  isMenuOpenFromButton: () => boolean;
}

export const CanvasContainer: React.FC<CanvasContainerProps> = ({
  existingCategories,
  searchQuery = '',
  onReady
}) => {
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuAbsolutePosition, setMenuAbsolutePosition] = useState({ x: 0, y: 0 });
  const [menuIsFromButton, setMenuIsFromButton] = useState(false);
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [newListPosition, setNewListPosition] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLDivElement>(null);

  // Expose methods to parent component
  useEffect(() => {
    if (onReady) {
      onReady({
        showAddListMenu: (position, isFromButton = false, absolutePosition) => {
          // If menu is already open from button, toggle it off
          if (showContextMenu && menuIsFromButton && isFromButton) {
            setShowContextMenu(false);
            return;
          }
          
          setMenuPosition(position);
          setMenuIsFromButton(isFromButton);
          if (absolutePosition) {
            setMenuAbsolutePosition(absolutePosition);
          }
          setShowContextMenu(true);
        },
        hideContextMenu: () => {
          setShowContextMenu(false);
        },
        isMenuOpenFromButton: () => {
          return showContextMenu && menuIsFromButton;
        }
      });
    }
  }, [onReady, showContextMenu, menuIsFromButton]);

  // Load lists on initial render
  useEffect(() => {
    const loadLists = async () => {
      try {
        setLoading(true);
        const loadedLists = await fetchCanvasLists();
        setLists(loadedLists);
      } catch (err) {
        console.error('Failed to load lists:', err);
        setError('Failed to load lists. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    // Add event listener for custom showCanvasContextMenu event
    const handleShowContextMenu = (event: CustomEvent) => {
      const { position, isFromButton = false, absolutePosition } = event.detail;
      setMenuPosition(position);
      setMenuIsFromButton(isFromButton);
      if (absolutePosition) {
        setMenuAbsolutePosition(absolutePosition);
      }
      setShowContextMenu(true);
    };

    // Type assertion to make TypeScript happy with CustomEvent
    document.addEventListener('showCanvasContextMenu', handleShowContextMenu as EventListener);

    loadLists();
    
    // Clean up event listener on component unmount
    return () => {
      document.removeEventListener('showCanvasContextMenu', handleShowContextMenu as EventListener);
    };
  }, []);

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Get position relative to canvas container
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      setMenuPosition({ x, y });
      setNewListPosition({ x, y });
      setShowContextMenu(true);
    }
  };

  // Setup document-wide click listener to handle outside clicks
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Skip if menu is not shown or if clicked on menu itself
      if (!showContextMenu) return;
      
      const menuElement = document.querySelector('.context-menu');
      const buttonElement = document.getElementById('new-canvas-button');
      
      // If clicked on the menu, do nothing
      if (menuElement && menuElement.contains(e.target as Node)) {
        return;
      }
      
      // If it's a dropdown menu from button, and button was clicked, don't close
      // (this is handled in showAddListMenu method toggle)
      if (menuIsFromButton && buttonElement && buttonElement.contains(e.target as Node)) {
        return;
      }
      
      // Otherwise close the menu
      setShowContextMenu(false);
    };
    
    // Add event listener
    document.addEventListener('mousedown', handleDocumentClick);
    
    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [showContextMenu, menuIsFromButton]);
  
  // Handle clicks on the canvas (close context menu)
  const handleCanvasClick = () => {
    // Context menu is now closed by the document click handler
  };

  // Handle adding a new list
  const handleAddList = () => {
    setShowContextMenu(false);
    setShowNewListModal(true);
  };

  // Handle list updates
  const handleListUpdate = (updatedList: List) => {
    setLists(prevLists => 
      prevLists.map(list => list.id === updatedList.id ? updatedList : list)
    );
  };

  // Handle list deletion
  const handleListDelete = (listId: string) => {
    setLists(prevLists => 
      prevLists.filter(list => list.id !== listId)
    );
  };

  // Handle position updates (with debounce for API calls)
  const handlePositionUpdate = async (listId: string, position: { x: number, y: number }) => {
    try {
      // Update local state immediately for smooth UX
      setLists(prevLists => 
        prevLists.map(list => 
          list.id === listId 
            ? { ...list, position_x: position.x, position_y: position.y } 
            : list
        )
      );
      
      // Send position update to server
      await updateListPosition(listId, position.x, position.y);
    } catch (err) {
      console.error('Failed to update list position:', err);
      // Optionally revert the change or show an error message
    }
  };

  // Handle new list creation
  const handleNewListCreated = (newList: List) => {
    // Add position to the new list
    const listWithPosition = {
      ...newList,
      position_x: newListPosition.x,
      position_y: newListPosition.y
    };
    
    setLists(prevLists => [...prevLists, listWithPosition]);
    setShowNewListModal(false);
  };

  return (
    <div className="canvas-container-wrapper">
      
      {/* Canvas area */}
      <div 
        ref={canvasRef}
        className="canvas-area"
        onContextMenu={handleContextMenu}
        onClick={handleCanvasClick}
        style={{
          position: 'relative',
          width: '100%',
          height: 'calc(100vh - 150px)',
          minHeight: '500px',
          backgroundColor: 'var(--background-alt)',
          borderRadius: '0.5rem',
          overflow: 'auto',
          padding: '1rem',
          boxSizing: 'border-box',
          border: '1px solid var(--border)'
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            {error}
          </div>
        ) : (
          <>
            {/* Draggable list cards */}
            {lists
              .filter(list => {
                if (!searchQuery) return true;
                return (
                  list.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (list.items && list.items.some(item => 
                    item.text && item.text.toLowerCase().includes(searchQuery.toLowerCase())
                  ))
                );
              })
              .map(list => (
                <DraggableListCard
                  key={list.id}
                  list={list}
                  position={{ 
                    x: list.position_x ?? 0,
                    y: list.position_y ?? 0
                  }}
                  onPositionUpdate={handlePositionUpdate}
                  onUpdate={handleListUpdate}
                  onDelete={handleListDelete}
                  existingCategories={existingCategories}
                />
              ))}
            
            {/* Context menu */}
            {showContextMenu && (
              <ContextMenu
                position={menuPosition}
                absolutePosition={menuAbsolutePosition}
                onAddList={handleAddList}
                onClose={() => setShowContextMenu(false)}
                isFromButton={menuIsFromButton}
              />
            )}
          </>
        )}
      </div>
      
      {/* New list modal */}
      {showNewListModal && (
        <NewListModal
          isOpen={showNewListModal}
          onClose={() => setShowNewListModal(false)}
          onListCreated={handleNewListCreated}
          existingCategories={existingCategories}
        />
      )}
    </div>
  );
};

export default CanvasContainer;
