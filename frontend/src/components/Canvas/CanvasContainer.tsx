import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { DraggableListCard } from './DraggableListCard';
import { ContextMenu } from './ContextMenu';
import { List, Note, Whiteboard, Category } from '../../types'; // Add Note and Whiteboard types
import { updateListPosition, updateList, deleteList } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

import Spinner from '../../components/ui/Spinner';
import { DraggableNoteCard } from './DraggableNoteCard'; // Import the new component
import { DraggableWhiteboardCard } from './DraggableWhiteboardCard'; // Import the whiteboard component
import { Plus, Minus, RotateCcw, Search } from 'lucide-react';

interface CanvasContainerProps {
  existingCategories: Category[];
  searchQuery?: string;
  onReady?: (methods: CanvasContainerMethods) => void;
  onOpenNewNoteModal?: (position: { x: number; y: number }) => void;
  onOpenNewListModal?: (position: { x: number; y: number }) => void;
  onListShare?: (listId: string) => void;
  lists: List[];
  onListUpdate: (updatedList: List) => Promise<void>;
  onListPositionUpdate: (listId: string, newPosition: { x: number; y: number }, newSize?: { width: number }) => void;
  onListDelete: (listId: string) => Promise<boolean>;
  notes: Note[];
  onNoteUpdate: (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Note | null>;
  onNoteDelete: (noteId: number) => Promise<boolean>;
  onNoteShare: (noteId: number) => void;
  whiteboards: Whiteboard[];
  onWhiteboardUpdate: (whiteboardId: number, updatedData: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Whiteboard | null>;
  onWhiteboardDelete: (whiteboardId: number) => Promise<boolean>;
  onWhiteboardShare: (whiteboardId: number) => void;
  onOpenNewWhiteboardModal?: (position: { x: number; y: number }) => void;
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<any>;
  updateCategory?: (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => Promise<void>;
}

export interface CanvasContainerMethods {
  showAddListMenu: (position: { x: number, y: number }, isFromButton?: boolean, absolutePosition?: { x: number, y: number }) => void;
  showAddNoteMenu: (position: { x: number, y: number }, isFromButton?: boolean, absolutePosition?: { x: number, y: number }) => void;
  showAddWhiteboardMenu: (position: { x: number, y: number }, isFromButton?: boolean, absolutePosition?: { x: number, y: number }) => void;
  hideContextMenu: () => void;
  isMenuOpenFromButton: () => boolean;
}

export const CanvasContainer: React.FC<CanvasContainerProps> = ({
  existingCategories,
  searchQuery = '',
  onReady,
  onOpenNewNoteModal,
  onOpenNewListModal,
  onListShare,
  lists,
  onListUpdate,
  onListPositionUpdate,
  onListDelete,
  notes,
  onNoteUpdate,
  onNoteDelete,
  onNoteShare,
  whiteboards,
  onWhiteboardUpdate,
  onWhiteboardDelete,
  onWhiteboardShare,
  onOpenNewWhiteboardModal,
  addCategory,
  updateCategory
}) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const [loading, setLoading] = useState(false); // No longer need to load lists
  const [error, setError] = useState('');
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuAbsolutePosition, setMenuAbsolutePosition] = useState<{ x: number, y: number } | undefined>(undefined);
  const [menuIsFromButton, setMenuIsFromButton] = useState(false);

  
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

  // Handler for when 'Add Whiteboard' is clicked in the context menu
  const handleRequestAddWhiteboard = () => {
    setShowContextMenu(false); 
    // Use the stored menuPosition which is already in canvas coordinates
    if (onOpenNewWhiteboardModal) {
      console.log('Opening whiteboard modal at position:', menuPosition);
      onOpenNewWhiteboardModal(menuPosition);
    }
  };

  // Expose methods to parent component
  useEffect(() => {
    if (onReady) {
      onReady({
        showAddListMenu: (position, isFromButton = false, absolutePosition) => {
          // Directly open list modal instead of context menu for lists
          if (onOpenNewListModal) {
            onOpenNewListModal(position);
          }
        },
        showAddNoteMenu: (position, isFromButton = false, absolutePosition) => {
          // Directly open note modal instead of context menu for notes
          if (onOpenNewNoteModal) {
            onOpenNewNoteModal(position);
          }
        },
        showAddWhiteboardMenu: (position, isFromButton = false, absolutePosition) => {
          // Directly open whiteboard modal instead of context menu for whiteboards
          if (onOpenNewWhiteboardModal) {
            onOpenNewWhiteboardModal(position);
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

  // Set up event listeners
  useEffect(() => {
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
    if (onOpenNewListModal) {
      onOpenNewListModal(menuPosition);
    }
  };

  const handleListUpdate = async (updatedList: List) => {
    try {
      // Use the passed handler from parent
      await onListUpdate(updatedList);
    } catch (error) {
      console.error('Failed to update list:', error);
    }
  };

  const handleListDelete = async (listId: string): Promise<boolean> => {
    try {
      // Use the passed handler from parent
      return await onListDelete(listId);
    } catch (error) {
      console.error('Failed to delete list:', error);
      return false;
    }
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
      all: lists.length + notes.length + whiteboards.length 
    };
    
    lists.forEach(list => {
      const category = list.type || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    notes.forEach(note => {
      const category = note.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    whiteboards.forEach(whiteboard => {
      const category = whiteboard.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    return counts;
  };

  const getFilteredContent = () => {
    let filteredLists = lists;
    let filteredNotes = notes;
    let filteredWhiteboards = whiteboards;

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
        return (note.title && note.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
               (note.content && note.content.toLowerCase().includes(searchQuery.toLowerCase()));
      });

      filteredWhiteboards = whiteboards.filter(whiteboard => {
        return whiteboard.title && whiteboard.title.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    // Apply category filter
    if (selectedFilter !== 'all') {
      filteredLists = filteredLists.filter(list => (list.type || 'General') === selectedFilter);
      filteredNotes = filteredNotes.filter(note => (note.category || 'General') === selectedFilter);
      filteredWhiteboards = filteredWhiteboards.filter(whiteboard => (whiteboard.category || 'General') === selectedFilter);
    }

    return { filteredLists, filteredNotes, filteredWhiteboards };
  };

  const { filteredLists, filteredNotes, filteredWhiteboards } = getFilteredContent();

  // Memoize the canvas transform string to prevent unnecessary recalculations
  const canvasTransformStyle = useMemo(() => {
    return `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasTransform.scale})`;
  }, [canvasTransform.x, canvasTransform.y, canvasTransform.scale]);

  // Memoize the background image to prevent recalculation on every render
  const backgroundImageStyle = useMemo(() => {
    return theme === 'dark' ? `
      radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
      radial-gradient(circle, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
      linear-gradient(135deg, rgba(255, 255, 255, 0.01) 0%, rgba(255, 255, 255, 0.04) 50%, rgba(255, 255, 255, 0.01) 100%)
    ` : `
      radial-gradient(circle, rgba(0, 0, 0, 0.08) 1px, transparent 1px),
      radial-gradient(circle, rgba(0, 0, 0, 0.04) 1px, transparent 1px),
      linear-gradient(135deg, rgba(0, 0, 0, 0.01) 0%, rgba(0, 0, 0, 0.04) 50%, rgba(0, 0, 0, 0.01) 100%)
    `;
  }, [theme]);

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
          style={useMemo(() => ({
            position: 'absolute',
            width: '100%',
            height: '100%',
            minWidth: '4000px', // Large canvas area
            minHeight: '4000px',
            transform: canvasTransformStyle,
            transformOrigin: '0 0',
            padding: '1rem',
            backgroundImage: backgroundImageStyle,
            backgroundSize: '32px 32px, 8px 8px, 100% 100%',
            backgroundPosition: '0 0, 0 0, 0 0'
          }), [canvasTransformStyle, backgroundImageStyle])}
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
            {/* Empty state when no content exists */}
            {lists.length === 0 && notes.length === 0 && whiteboards.length === 0 && (
              <div 
                className="flex items-center justify-center h-full"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  color: '#64748b',
                  fontFamily: '"Raleway", sans-serif',
                  fontSize: '18px',
                  fontWeight: '300',
                  zIndex: 10
                }}
              >
                No content on your canvas (for now!)
              </div>
            )}

            {/* Draggable list cards */}
            {filteredLists.map(list => (
              <DraggableListCard
                key={list.id}
                list={list}
                onPositionChange={(listId, newPosition, newSize) => {
                  onListPositionUpdate(listId, newPosition, newSize);
                }}
                onUpdate={handleListUpdate}
                onDelete={handleListDelete}
                onShare={onListShare || (() => {})}
                existingCategories={existingCategories}
                canvasTransform={canvasTransform}
                addCategory={addCategory}
                updateCategory={updateCategory}
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
                onShare={onNoteShare}
                existingCategories={existingCategories}
                canvasTransform={canvasTransform}
                updateCategory={updateCategory}
              />
            ))}

            {/* Render whiteboards */}
            {filteredWhiteboards.map(whiteboard => (
              <DraggableWhiteboardCard
                key={whiteboard.id}
                whiteboard={whiteboard}
                onUpdate={onWhiteboardUpdate}
                onDelete={onWhiteboardDelete}
                onShare={onWhiteboardShare}
                existingCategories={existingCategories}
                canvasTransform={canvasTransform}
                onPositionChange={(whiteboardId, newPosition) => {
                  onWhiteboardUpdate(whiteboardId, { position_x: newPosition.x, position_y: newPosition.y });
                }}
                updateCategory={updateCategory}
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
                  onAddWhiteboard={handleRequestAddWhiteboard} // Pass the whiteboard handler
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


    </div>
  );
};

export default CanvasContainer;
