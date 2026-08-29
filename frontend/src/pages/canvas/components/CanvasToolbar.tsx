import type { MouseEvent } from "react";
import {
  CheckSquare,
  Filter,
  GitBranch,
  KeyRound,
  Palette,
  Plus,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HeaderActionLabel,
  HeaderCombinedQuery,
  HeaderFilters,
  HeaderSearch,
  type DesktopHeaderToolsProps,
} from "@/components/layout/DesktopHeaderTools";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CanvasToolbarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  typeFilter: "all" | "list" | "note" | "whiteboard" | "wireframe" | "vault";
  setTypeFilter: (value: CanvasToolbarProps["typeFilter"]) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  getUniqueCategories: string[];
  getCategoryCounts: Record<string, number>;
  onAddClick?: (event: MouseEvent) => void;
}

/** Builds the rule-bound Canvas slots consumed by the desktop shell lane. */
export function createCanvasHeaderTools({
  searchQuery,
  setSearchQuery,
  typeFilter,
  setTypeFilter,
  categoryFilter,
  setCategoryFilter,
  getUniqueCategories,
  getCategoryCounts,
  onAddClick,
}: CanvasToolbarProps): DesktopHeaderToolsProps {
  const activeFilterCount =
    Number(typeFilter !== "all") + Number(categoryFilter !== "all");
  const activeQueryCount =
    activeFilterCount + Number(searchQuery.trim().length > 0);
  const typeFilterControl = (
      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger
          aria-label="Filter by content type"
          className="h-11 w-[8rem] bg-muted/20"
        >
          <Filter className="mr-2 h-4 w-4" />
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="list">
            <CheckSquare className="mr-2 inline h-4 w-4" />
            Lists
          </SelectItem>
          <SelectItem value="note">
            <StickyNote className="mr-2 inline h-4 w-4" />
            Notes
          </SelectItem>
          <SelectItem value="whiteboard">
            <Palette className="mr-2 inline h-4 w-4" />
            Whiteboards
          </SelectItem>
          <SelectItem value="wireframe">
            <GitBranch className="mr-2 inline h-4 w-4" />
            Wireframes
          </SelectItem>
          <SelectItem value="vault">
            <KeyRound className="mr-2 inline h-4 w-4" />
            Vaults
          </SelectItem>
        </SelectContent>
      </Select>
  );
  const categoryFilterControl = (
      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
        <SelectTrigger
          aria-label="Filter by category"
          className="h-11 w-[9.5rem] bg-muted/20"
        >
          <SelectValue placeholder="Category">
            {categoryFilter === "all" ? "All Categories" : categoryFilter}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {getUniqueCategories.map((category) => (
            <SelectItem key={category} value={category}>
              {category === "all" ? "All Categories" : category} (
              {getCategoryCounts[category] || 0})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
  );
  const filters = (
    <>
      {typeFilterControl}
      {categoryFilterControl}
    </>
  );

  return {
    search: (
      <HeaderSearch
        label="Search canvas"
        placeholder="Search canvas..."
        value={searchQuery}
        onChange={setSearchQuery}
      />
    ),
    filters: (
      <div className="flex items-center gap-2">
        <HeaderFilters
          label="Filter canvas by type"
          activeCount={Number(typeFilter !== "all")}
          preferExpanded
        >
          {typeFilterControl}
        </HeaderFilters>
        <HeaderFilters
          label="Filter canvas by category"
          activeCount={Number(categoryFilter !== "all")}
          preferExpanded="when-roomy"
        >
          {categoryFilterControl}
        </HeaderFilters>
      </div>
    ),
    combinedQuery: (
      <HeaderCombinedQuery
        label="Search and filter canvas"
        placeholder="Search canvas..."
        value={searchQuery}
        onChange={setSearchQuery}
        activeCount={activeQueryCount}
      >
        {filters}
      </HeaderCombinedQuery>
    ),
    primaryAction: (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            id="new-canvas-button"
            onClick={onAddClick}
            className="h-11 min-w-11 gap-2 bg-blue-600 px-3 font-light text-white hover:bg-blue-700"
            aria-label="Add content"
          >
            <Plus className="h-4 w-4" />
            <HeaderActionLabel>Add</HeaderActionLabel>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Add content</TooltipContent>
      </Tooltip>
    ),
  };
}
