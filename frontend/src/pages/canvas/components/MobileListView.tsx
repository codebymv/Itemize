import React from 'react';
import { Plus, Search, CheckSquare, StickyNote, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ListCard';
import { NoteCard } from '@/components/NoteCard';
import { WhiteboardCard } from '@/components/WhiteboardCard';
import { List, Note, Whiteboard } from '@/types';

interface MobileListViewProps {
  filteredLists: List[];
  filteredNotes: Note[];
  filteredWhiteboards: Whiteboard[];
  allLists: List[];
  allNotes: Note[];
  allWhiteboards: Whiteboard[];
  dbCategories: any[];
  selectedFilter: string | null;
  setSelectedFilter: (filter: string | null) => void;
  getUniqueTypes: () => string[];
  getFilterCounts: () => Record<string, number>;
  onAddList: () => void;
  onAddNote: () => void;
  onAddWhiteboard: () => void;
  onUpdateList: (list: List) => Promise<boolean>;
  onUpdateNote: (noteId: number, data: any) => Promise<Note | null>;
  onUpdateWhiteboard: (whiteboardId: number, data: any) => Promise<Whiteboard | null>;
  onDeleteList: (listId: string) => Promise<boolean>;
  onDeleteNote: (noteId: number) => Promise<boolean>;
  onDeleteWhiteboard: (whiteboardId: number) => Promise<boolean>;
  onShareList: (listId: string) => void;
  onShareNote: (noteId: number) => void;
  onShareWhiteboard: (whiteboardId: number) => void;
  isListCollapsed: (id: string) => boolean;
  toggleListCollapsed: (id: string) => void;
  isNoteCollapsed: (id: number) => boolean;
  toggleNoteCollapsed: (id: number) => void;
  isWhiteboardCollapsed: (id: number) => boolean;
  toggleWhiteboardCollapsed: (id: number) => void;
  listToggleCallbacks: Record<string, () => void>;
  addCategory: (data: { name: string; color_value: string }) => Promise<void>;
  updateCategory: (name: string, data: any) => Promise<void>;
  editCategory: (name: string, data: any) => Promise<void>;
}

export function MobileListView({
  filteredLists,
  filteredNotes,
  filteredWhiteboards,
  allLists,
  allNotes,
  allWhiteboards,
  dbCategories,
  selectedFilter,
  setSelectedFilter,
  getUniqueTypes,
  getFilterCounts,
  onAddList,
  onAddNote,
  onAddWhiteboard,
  onUpdateList,
  onUpdateNote,
  onUpdateWhiteboard,
  onDeleteList,
  onDeleteNote,
  onDeleteWhiteboard,
  onShareList,
  onShareNote,
  onShareWhiteboard,
  isListCollapsed,
  toggleListCollapsed,
  isNoteCollapsed,
  toggleNoteCollapsed,
  isWhiteboardCollapsed,
  toggleWhiteboardCollapsed,
  listToggleCallbacks,
  addCategory,
  updateCategory,
  editCategory,
}: MobileListViewProps) {
  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-8">
      {/* Categories Section */}
      <div className="flex items-center gap-4 mb-8">
        <h3 className="text-lg font-light text-foreground flex-shrink-0">Categories</h3>

        {/* Filter Tabs - Horizontal scrolling */}
        <div className="flex gap-2 overflow-x-auto flex-1 pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {getUniqueTypes().map((filter) => {
            const count = getFilterCounts()[filter] || 0;
            const isActive = selectedFilter === filter;
            return (
              <Button
                key={filter}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (isActive) {
                    setSelectedFilter(null);
                  } else {
                    setSelectedFilter(filter);
                  }
                }}
                className={`capitalize font-light whitespace-nowrap flex-shrink-0 ${isActive ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
              >
                {filter} ({count})
              </Button>
            );
          })}
        </div>
      </div>

      {/* Content section */}
      {filteredLists.length === 0 && filteredNotes.length === 0 && filteredWhiteboards.length === 0 ? (
        <div className="text-center py-12">
          {allLists.length === 0 && allNotes.length === 0 && allWhiteboards.length === 0 ? (
            <div className="max-w-md mx-auto">
              <div className="bg-card rounded-lg shadow-sm border border-border p-8">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-light text-foreground mb-6">
                  No content on your canvas<br />(for now!)
                </h3>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button onClick={onAddList} className="bg-blue-600 hover:bg-blue-700 text-white font-normal">
                    <Plus className="h-4 w-4 mr-2" />
                    Add List
                  </Button>
                  <Button onClick={onAddNote} className="bg-blue-600 hover:bg-blue-700 text-white font-normal">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Note
                  </Button>
                  <Button onClick={onAddWhiteboard} className="bg-blue-600 hover:bg-blue-700 text-white font-normal">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Whiteboard
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No content matches your search criteria.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* My Lists section */}
          {filteredLists.length > 0 && (
            <>
              <h2 className="text-xl font-light text-foreground mb-6 flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-muted-foreground" />
                My Lists
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredLists.map((list) => (
                  <ListCard
                    key={list.id}
                    list={list}
                    onUpdate={onUpdateList}
                    onDelete={onDeleteList}
                    onShare={onShareList}
                    existingCategories={dbCategories}
                    isCollapsed={isListCollapsed(list.id)}
                    onToggleCollapsed={listToggleCallbacks[list.id]}
                    addCategory={addCategory}
                    updateCategory={editCategory}
                  />
                ))}
              </div>
            </>
          )}

          {/* My Notes section */}
          {filteredNotes.length > 0 && (
            <div className={filteredLists.length > 0 ? "mt-12" : ""}>
              <h2 className="text-xl font-light text-foreground mb-6 flex items-center gap-2">
                <StickyNote className="h-5 w-5 text-muted-foreground" />
                My Notes
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onUpdate={async (noteId, updatedData) => {
                      await onUpdateNote(noteId, updatedData);
                    }}
                    onDelete={async (noteId) => {
                      await onDeleteNote(noteId);
                    }}
                    onShare={onShareNote}
                    existingCategories={dbCategories}
                    isCollapsed={isNoteCollapsed(note.id)}
                    onToggleCollapsed={() => toggleNoteCollapsed(note.id)}
                    updateCategory={editCategory}
                  />
                ))}
              </div>
            </div>
          )}

          {/* My Whiteboards section */}
          {filteredWhiteboards.length > 0 && (
            <div className={(filteredLists.length > 0 || filteredNotes.length > 0) ? "mt-12" : ""}>
              <h2 className="text-xl font-light text-foreground mb-6 flex items-center gap-2">
                <Palette className="h-5 w-5 text-muted-foreground" />
                My Whiteboards
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredWhiteboards.map((whiteboard) => (
                  <WhiteboardCard
                    key={whiteboard.id}
                    whiteboard={whiteboard}
                    onUpdate={async (whiteboardId, updatedData) => {
                      return await onUpdateWhiteboard(whiteboardId, updatedData);
                    }}
                    onDelete={async (whiteboardId) => {
                      return await onDeleteWhiteboard(whiteboardId);
                    }}
                    onShare={onShareWhiteboard}
                    existingCategories={dbCategories}
                    isCollapsed={isWhiteboardCollapsed(whiteboard.id)}
                    onToggleCollapsed={() => toggleWhiteboardCollapsed(whiteboard.id)}
                    updateCategory={editCategory}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}