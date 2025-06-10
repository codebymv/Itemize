import React, { useState, useEffect, useRef } from 'react';
import { DraggableListCard } from './DraggableListCard';
import { ContextMenu } from './ContextMenu';
import { List, Note } from '../../types'; // Add Note type
import { fetchCanvasLists, updateListPosition, updateList, deleteList } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { NewListModal } from '../../components/NewListModal';
import Spinner from '../../components/ui/Spinner';
import { DraggableNoteCard } from './DraggableNoteCard'; // Import the new component
import { Plus, Minus, RotateCcw, Search } from 'lucide-react';

interface CanvasContainerProps {
  existingCategories: string[];
  searchQuery?: string;
  onReady?: (methods: CanvasContainerMethods) => void;
  onOpenNewNoteModal?: (position: { x: number; y: number }) => void;
  notes: Note[];
  onNoteUpdate: (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Note | null>;
  onNoteDelete: (noteId: number) => Promise<boolean>;
}

export interface CanvasContainerMethods {
  showAddListMenu: (position: { x: number, y: number }, isFromButton?: boolean, absolutePosition?: { x: number, y: number }) => void;
  showAddNoteMenu: (position: { x: number, y: number }, isFromButton?: boolean, absolutePosition?: { x: number, y: number }) => void;
  hideContextMenu: () => void;
  isMenuOpenFromButton: () => boolean;
}

export const CanvasContainer: React.FC<CanvasContainerProps> = ({
  existingCategories,
  searchQuery = '',
  onReady,
  onOpenNewNoteModal,
  notes,
  onNoteUpdate,
  onNoteDelete
}) => {
  const { token } = useAuth();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuAbsolutePosition, setMenuAbsolutePosition] = useState<{ x: number, y: number } | undefined>(undefined);
  const [menuIsFromButton, setMenuIsFromButton] = useState(false);
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [newListPosition, setNewListPosition] = useState({ x: 0, y: 0 });
  
  // Canvas transform state - start centered for optimal panning
  const [canvasTransform, setCanvasTransform] = useState({
    x: window.innerWidth / 2 - 2000, // Center the 4000px canvas width
    y: window.innerHeight / 2 - 2000, // Center the 4000px canvas height
    scale: 1
  });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Filter state for canvas
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);

  // Handler for when 'Add Note' is clicked in the context menu
  const handleRequestAddNote = () => {
    setShowContextMenu(false); 
    onOpenNewNoteModal && onOpenNewNoteModal(menuPosition); 
  };

  // Expose methods to parent component
  useEffect(() => {
    if (onReady) {
      onReady({
        showAddListMenu: (position, isFromButton = false, absolutePosition) => {
          console.log('showAddListMenu called:', { position, isFromButton, absolutePosition, currentMenuState: showContextMenu, currentMenuIsFromButton: menuIsFromButton });
          
          if (showContextMenu && menuIsFromButton && isFromButton) {
            console.log('Closing existing button menu');
            setShowContextMenu(false);
            return;
          }
          
          console.log('Setting menu state:', { position, isFromButton, absolutePosition });
          setMenuPosition(position);
          setMenuIsFromButton(isFromButton);
          if (absolutePosition) {
            setMenuAbsolutePosition(absolutePosition);
          } else {
            setMenuAbsolutePosition(undefined);
          }
          setShowContextMenu(true);
          console.log('Context menu should now be visible');
        },
        showAddNoteMenu: (position, isFromButton = false, absolutePosition) => {
          // Directly open note modal instead of context menu for notes
          if (onOpenNewNoteModal) {
            onOpenNewNoteModal(position);
          }
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
        fetchCanvasLists(token)
        .then(data => {
          setLists(data);
          setLoading(false);
        })
        .catch(err => {
          console.error("Failed to fetch lists:", err);
          setError("Could not load lists.");
          setLoading(false);
        }); 
      } finally {
        setLoading(false);
      }
    };

    const handleShowContextMenu = (event: CustomEvent) => {
      const { position, isFromButton = false, absolutePosition } = event.detail;
      setMenuPosition(position);
      setMenuIsFromButton(isFromButton);
      if (absolutePosition) {
        setMenuAbsolutePosition(absolutePosition);
      }
      setShowContextMenu(true);
    };

    document.addEventListener('showCanvasContextMenu', handleShowContextMenu as EventListener);

    loadLists();
    
    return () => {
      document.removeEventListener('showCanvasContextMenu', handleShowContextMenu as EventListener);
    };
  }, []);

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Right-click context menu triggered');
    
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Convert screen coordinates to canvas coordinates
      const canvasX = (x - canvasTransform.x) / canvasTransform.scale;
      const canvasY = (y - canvasTransform.y) / canvasTransform.scale;
      
      console.log('Context menu position:', { canvasX, canvasY, screenX: x, screenY: y });
      
      setMenuPosition({ x: canvasX, y: canvasY });
      setNewListPosition({ x: canvasX, y: canvasY });
      setMenuIsFromButton(false); // Right-click is not from button
      setMenuAbsolutePosition(undefined); // Clear absolute position for right-click
      setShowContextMenu(true);
    }
  };

  // Canvas panning handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Close context menu on any mouse down except on the menu itself
    const target = e.target as HTMLElement;
    if (showContextMenu && !target.closest('.context-menu')) {
      setShowContextMenu(false);
    }
    
    // Only start panning on left click and if not clicking on a draggable item or interactive element
    const isInteractiveElement = target.closest('.draggable-list-card, .draggable-note-card, .context-menu, button, input, textarea, select');
    
    if (e.button === 0 && !isInteractiveElement && (e.target === canvasRef.current || e.target === canvasContentRef.current)) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX - canvasTransform.x,
        y: e.clientY - canvasTransform.y
      });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setCanvasTransform(prev => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      }));
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }
  };

  // Canvas zooming handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.1, Math.min(3, canvasTransform.scale * scaleFactor));
      
      // Calculate the new pan position to zoom towards mouse position
      const newX = mouseX - (mouseX - canvasTransform.x) * (newScale / canvasTransform.scale);
      const newY = mouseY - (mouseY - canvasTransform.y) * (newScale / canvasTransform.scale);
      
      setCanvasTransform({
        x: newX,
        y: newY,
        scale: newScale
      });
    }
  };

  // Setup global mouse event listeners for panning
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        setCanvasTransform(prev => ({
          ...prev,
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y
        }));
      }
    };

    const handleGlobalMouseUp = () => {
      if (isPanning) {
        setIsPanning(false);
      }
    };

    if (isPanning) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isPanning, panStart]);
  
  const handleCanvasClick = () => {
  };

  const handleAddList = () => {
    setShowContextMenu(false);
    setShowNewListModal(true);
  };

  const handleListUpdate = async (updatedList: List) => {
    // Optimistically update the UI
    const originalLists = [...lists];
    setLists(prevLists => 
      prevLists.map(list => list.id === updatedList.id ? updatedList : list)
    );

    try {
      // Save to database
      await updateList(updatedList, token);
    } catch (error) {
      console.error('Failed to update list:', error);
      // Revert to original state on error
      setLists(originalLists);
    }
  };

  const handleListDelete = async (listId: string) => {
    // Optimistically update UI first
    const originalLists = [...lists];
    setLists(prevLists => 
      prevLists.filter(list => list.id !== listId)
    );

    try {
      // Call API to delete from database
      await deleteList(listId, token);
    } catch (error) {
      console.error('Failed to delete list:', error);
      // Revert to original state on error
      setLists(originalLists);
    }
  };

  const handleListPositionChange = (listId: string, newPosition: { x: number, y: number }) => {
    const originalLists = [...lists];
    setLists(prevLists => 
      prevLists.map(list => list.id === listId ? { ...list, position_x: newPosition.x, position_y: newPosition.y } : list)
    );

    updateListPosition(listId, newPosition.x, newPosition.y, token)
      .catch(error => {
        console.error('Failed to update list position:', error);
        setLists(originalLists); 
      });
  };

  const handleNewListCreated = (newList: List) => {
    const listWithPosition = {
      ...newList,
      position_x: newListPosition.x,
      position_y: newListPosition.y
    };
    
    setLists(prevLists => [...prevLists, listWithPosition]);
    setShowNewListModal(false);
  };

  // Canvas control functions
  const handleZoomIn = () => {
    setCanvasTransform(prev => ({
      ...prev,
      scale: Math.min(3, prev.scale * 1.2)
    }));
  };

  const handleZoomOut = () => {
    setCanvasTransform(prev => ({
      ...prev,
      scale: Math.max(0.1, prev.scale / 1.2)
    }));
  };

  const handleResetView = () => {
    setCanvasTransform({ 
      x: window.innerWidth / 2 - 2000, // Center the 4000px canvas width
      y: window.innerHeight / 2 - 2000, // Center the 4000px canvas height
      scale: 1 
    });
  };

  // Filter logic
  const getUniqueCategories = () => {
    const listCategories = lists.map(list => list.type || 'General').filter(Boolean);
    const noteCategories = notes.map(note => note.category || 'General').filter(Boolean);
    const allCategories = Array.from(new Set([...listCategories, ...noteCategories]));
    return ['all', ...allCategories];
  };

  const getFilterCounts = () => {
    const counts: Record<string, number> = { 
      all: lists.length + notes.length 
    };
    
    lists.forEach(list => {
      const category = list.type || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    notes.forEach(note => {
      const category = note.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    return counts;
  };

  const getFilteredContent = () => {
    let filteredLists = lists;
    let filteredNotes = notes;

    // Apply search filter
    if (searchQuery) {
      filteredLists = lists.filter(list => {
        return (
          list.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (list.items && list.items.some(item => 
            item.text && item.text.toLowerCase().includes(searchQuery.toLowerCase())
          ))
        );
      });

      filteredNotes = notes.filter(note => {
        return note.content && note.content.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    // Apply category filter
    if (selectedFilter !== 'all') {
      filteredLists = filteredLists.filter(list => (list.type || 'General') === selectedFilter);
      filteredNotes = filteredNotes.filter(note => (note.category || 'General') === selectedFilter);
    }

    return { filteredLists, filteredNotes };
  };

  const { filteredLists, filteredNotes } = getFilteredContent();

  // Global event listeners for mouse interaction outside canvas
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Close context menu if clicking outside
      if (showContextMenu) {
        const target = e.target as HTMLElement;
        const menuElement = document.querySelector('.context-menu');
        const buttonElement = document.getElementById('new-canvas-button');
        
        if (menuElement && menuElement.contains(e.target as Node)) {
          return;
        }
        
        if (menuIsFromButton && buttonElement && buttonElement.contains(e.target as Node)) {
          return;
        }
        
        if (!target.closest('.context-menu')) {
          setShowContextMenu(false);
        }
      }
      
      // Close filter panel if clicking outside
      if (showFilterPanel) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-filter-panel]') && !target.closest('[data-filter-button]')) {
          setShowFilterPanel(false);
        }
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [showContextMenu, showFilterPanel, menuIsFromButton]);

  return (
    <div className="canvas-container-wrapper">
      
      {/* Canvas area */}
      <div 
        ref={canvasRef}
        className="canvas-area"
        onContextMenu={handleContextMenu}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{
          position: 'relative',
          width: '100%',
          height: '100vh',
          backgroundColor: 'var(--background-alt)',
          borderRadius: '0',
          overflow: 'hidden',
          padding: '0',
          boxSizing: 'border-box',
          border: 'none',
          cursor: isPanning ? 'grabbing' : 'grab'
        }}
      >
        {/* Canvas content with transform applied */}
        <div
          ref={canvasContentRef}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            minWidth: '4000px', // Large canvas area
            minHeight: '4000px',
            transform: `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasTransform.scale})`,
            transformOrigin: '0 0',
            padding: '1rem',
            backgroundImage: `
              radial-gradient(circle, rgba(0, 0, 0, 0.08) 1px, transparent 1px),
              radial-gradient(circle, rgba(0, 0, 0, 0.04) 1px, transparent 1px),
              linear-gradient(135deg, rgba(0, 0, 0, 0.01) 0%, rgba(0, 0, 0, 0.04) 50%, rgba(0, 0, 0, 0.01) 100%)
            `,
            backgroundSize: '32px 32px, 8px 8px, 100% 100%',
            backgroundPosition: '0 0, 0 0, 0 0'
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
            {filteredLists.map(list => (
              <DraggableListCard
                key={list.id}
                list={list}
                position={{ x: list.position_x ?? 0, y: list.position_y ?? 0 }}
                onPositionUpdate={handleListPositionChange}
                onUpdate={handleListUpdate}
                onDelete={handleListDelete}
                existingCategories={existingCategories}
                canvasTransform={canvasTransform}
              />
            ))}

            {/* Render notes */}
            {filteredNotes.map(note => (
              <DraggableNoteCard 
                key={note.id} 
                note={note} 
                onPositionUpdate={(noteId, newPosition, newSize) => {
                  const updatePayload: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>> = { position_x: newPosition.x, position_y: newPosition.y };
                  if (newSize) {
                    updatePayload.width = newSize.width;
                    updatePayload.height = newSize.height;
                  }
                  onNoteUpdate(noteId, updatePayload);
                }}
                onUpdate={onNoteUpdate} 
                onDelete={onNoteDelete} 
                existingCategories={existingCategories}
                canvasTransform={canvasTransform}
              />
            ))}
            
            {/* Context menu */}
            {showContextMenu && (() => {
              console.log('Rendering context menu with:', { menuPosition, menuAbsolutePosition, menuIsFromButton, showContextMenu });
              return (
                <ContextMenu
                  position={menuPosition}
                  absolutePosition={menuAbsolutePosition}
                  onAddList={handleAddList}
                  onAddNote={handleRequestAddNote} // Pass the new handler
                  onClose={() => setShowContextMenu(false)}
                  isFromButton={menuIsFromButton}
                />
              );
            })()}
          </>
        )}
        </div>
      </div>

      {/* Canvas Control Panel */}
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1002,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px',
          backgroundColor: 'var(--background)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          userSelect: 'none'
        }}
      >
        {/* Zoom Out */}
        <button
          onClick={handleZoomOut}
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--text)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--background)';
          }}
          title="Zoom Out"
        >
          <Minus size={18} />
        </button>

        {/* Reset/Center */}
        <button
          onClick={handleResetView}
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--text)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--background)';
          }}
          title="Reset View"
        >
          <RotateCcw size={18} />
        </button>

        {/* Zoom Level Display */}
        <div
          style={{
            padding: '0 12px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-muted)',
            fontFamily: 'monospace',
            minWidth: '60px',
            textAlign: 'center'
          }}
        >
          {Math.round(canvasTransform.scale * 100)}%
        </div>

        {/* Zoom In */}
        <button
          onClick={handleZoomIn}
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--text)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--background)';
          }}
          title="Zoom In"
        >
          <Plus size={18} />
        </button>

        {/* Separator */}
        <div style={{
          width: '1px',
          height: '24px',
          backgroundColor: 'var(--border)',
          margin: '0 4px'
        }} />

        {/* Filter Controls */}
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          data-filter-button
          style={{
            minWidth: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 12px',
            backgroundColor: showFilterPanel ? 'var(--accent)' : 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--text)',
            fontSize: '12px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => {
            if (!showFilterPanel) {
              e.currentTarget.style.backgroundColor = 'var(--accent)';
            }
          }}
          onMouseLeave={(e) => {
            if (!showFilterPanel) {
              e.currentTarget.style.backgroundColor = 'var(--background)';
            }
          }}
          title="Filter Content"
        >
          <span>Category:</span>
          <span>{selectedFilter === 'all' ? 'All' : selectedFilter}</span>
          <span style={{ opacity: 0.7 }}>({getFilterCounts()[selectedFilter] || 0})</span>
        </button>
      </div>
      
      {/* Filter Panel */}
      {showFilterPanel && (
        <div
          data-filter-panel
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1003,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            userSelect: 'none',
            maxWidth: '600px',
            flexWrap: 'wrap'
          }}
        >
          {getUniqueCategories().map((category) => {
            const count = getFilterCounts()[category] || 0;
            const isActive = selectedFilter === category;
            
            return (
              <button
                key={category}
                onClick={() => {
                  setSelectedFilter(category);
                  setShowFilterPanel(false);
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: isActive ? '#3b82f6' : 'var(--background)',
                  color: isActive ? 'white' : 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  textTransform: 'capitalize',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--accent)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--background)';
                  }
                }}
              >
                {category} ({count})
              </button>
            );
          })}
        </div>
      )}

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
