import React from 'react';
import { Search, Plus, Filter, CheckSquare, StickyNote, Palette, GitBranch, KeyRound, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CanvasToolbarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  typeFilter: 'all' | 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';
  setTypeFilter: (value: any) => void;
  categoryFilter: string;
  setCategoryFilter: (value: any) => void;
  getUniqueCategories: string[];
  getCategoryCounts: Record<string, number>;
  onAddClick?: (e: React.MouseEvent) => void;
  theme?: 'dark' | 'light';
}

export function CanvasToolbar({
  searchQuery,
  setSearchQuery,
  typeFilter,
  setTypeFilter,
  categoryFilter,
  setCategoryFilter,
  getUniqueCategories,
  getCategoryCounts,
  onAddClick,
  theme = 'light',
}: CanvasToolbarProps) {
  return (
    <div className="hidden md:flex items-center gap-2 md:gap-4 ml-4 flex-1 justify-end mr-4">
      {/* Type filter */}
      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="w-[130px] h-9 bg-muted/20 border-border/50">
          <Filter className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="list">
            <div className="flex items-center">
              <CheckSquare className="h-4 w-4 mr-2 transition-colors group-hover/item:text-blue-600" />
              <span>Lists</span>
            </div>
          </SelectItem>
          <SelectItem value="note">
            <div className="flex items-center">
              <StickyNote className="h-4 w-4 mr-2 transition-colors group-hover/item:text-blue-600" />
              <span>Notes</span>
            </div>
          </SelectItem>
          <SelectItem value="whiteboard">
            <div className="flex items-center">
              <Palette className="h-4 w-4 mr-2 transition-colors group-hover/item:text-blue-600" />
              <span>Whiteboards</span>
            </div>
          </SelectItem>
          <SelectItem value="wireframe">
            <div className="flex items-center">
              <GitBranch className="h-4 w-4 mr-2 transition-colors group-hover/item:text-blue-600" />
              <span>Wireframes</span>
            </div>
          </SelectItem>
          <SelectItem value="vault">
            <div className="flex items-center">
              <KeyRound className="h-4 w-4 mr-2 transition-colors group-hover/item:text-blue-600" />
              <span>Vaults</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Category filter */}
      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
        <SelectTrigger className="w-[180px] h-9 bg-muted/20 border-border/50">
          <Filter className="h-4 w-4 mr-2 flex-shrink-0" />
          <SelectValue placeholder="Category">
            {categoryFilter === 'all' ? 'All Categories' : categoryFilter}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {getUniqueCategories.map((category) => (
            <SelectItem key={category} value={category}>
              {category === 'all' ? 'All Categories' : category} ({getCategoryCounts[category] || 0})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Search */}
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search canvas..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        />
      </div>

      {/* Add Button */}
      <Button
        id="new-canvas-button"
        onClick={onAddClick}
        size="sm"
        className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Content
      </Button>
    </div>
  );
}