import React from 'react';
import { Plus, Search, CheckSquare, StickyNote, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ListCard';
import { NoteCard } from '@/components/NoteCard';
import { WhiteboardCard } from '@/components/WhiteboardCard';
import { Category, List, Note, Whiteboard } from '@/types';
import { useResponsiveContentCollapse } from '@/hooks/useResponsiveContentCollapse';
import { EmptyState } from '@/components/EmptyState';

interface MobileListViewProps {
  filteredLists: List[];
  filteredNotes: Note[];
  filteredWhiteboards: Whiteboard[];
  allLists: List[];
  allNotes: Note[];
  allWhiteboards: Whiteboard[];
  dbCategories: Category[];
  selectedFilter: string | null;
  setSelectedFilter: (filter: string | null) => void;
  getUniqueTypes: () => string[];
  getFilterCounts: () => Record<string, number>;
  onAddList: () => void;
  onAddNote: () => void;
  onAddWhiteboard: () => void;
  onUpdateList: (list: List) => Promise<unknown>;
  onUpdateNote: (noteId: number, data: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Note | null>;
  onUpdateWhiteboard: (whiteboardId: number, data: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Whiteboard | null>;
  onDeleteList: (listId: string) => Promise<boolean>;
  onDeleteNote: (noteId: number) => Promise<boolean>;
  onDeleteWhiteboard: (whiteboardId: number) => Promise<boolean>;
  onShareList: (listId: string) => void;
  onShareNote: (noteId: number) => void;
  onShareWhiteboard: (whiteboardId: number) => void;
  addCategory: (data: { name: string; color_value: string }) => Promise<unknown>;
  updateCategory: (name: string, data: Partial<{ name: string; color_value: string }>) => Promise<void>;
  editCategory: (name: string, data: Partial<{ name: string; color_value: string }>) => Promise<void>;
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
  addCategory,
  updateCategory,
  editCategory,
}: MobileListViewProps) {
  const contentCollapse = useResponsiveContentCollapse(true);

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
                className={`capitalize font-light whitespace-nowrap flex-shrink-0 ${isActive ? 'bg-blue-600 interaction-button--primary text-white' : ''}`}
              >
                {filter} ({count})
              </Button>
            );
          })}
        </div>
      </div>

      {/* Content section */}
      {filteredLists.length === 0 && filteredNotes.length === 0 && filteredWhiteboards.length === 0 ? (
        allLists.length === 0 && allNotes.length === 0 && allWhiteboards.length === 0 ? (
          <div className="rounded-lg border bg-card shadow-sm">
            <EmptyState
              icon={Plus}
              title="No canvas content yet"
              action={(
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" onClick={onAddList} className="h-11 bg-blue-600 text-white interaction-button--primary"><Plus className="mr-2 h-4 w-4" />Add list</Button>
                  <Button type="button" variant="outline" className="h-11" onClick={onAddNote}>Add note</Button>
                  <Button type="button" variant="outline" className="h-11" onClick={onAddWhiteboard}>Add whiteboard</Button>
                </div>
              )}
            />
          </div>
        ) : (
          <EmptyState
            icon={Search}
            kind="results"
            title="No matching content"
            actionLabel="Clear filter"
            onAction={() => setSelectedFilter(null)}
          />
        )
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
                    isCollapsed={contentCollapse.isCollapsed('list', list.id)}
                    onToggleCollapsed={() => contentCollapse.toggle('list', list.id)}
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
                    isCollapsed={contentCollapse.isCollapsed('note', note.id)}
                    onToggleCollapsed={() => contentCollapse.toggle('note', note.id)}
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
                    isCollapsed={contentCollapse.isCollapsed('whiteboard', whiteboard.id)}
                    onToggleCollapsed={() => contentCollapse.toggle('whiteboard', whiteboard.id)}
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
