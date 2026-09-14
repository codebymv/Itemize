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
import { FilterSelect } from "@/components/ui/filter-select";
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

/** Builds the rule-bound Canvas slots consumed by the responsive shell lane. */
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
      <FilterSelect
        value={typeFilter}
        onValueChange={setTypeFilter}
        aria-label="Filter by content type"
        placeholder="Type"
        icon={<Filter className="mr-2 h-4 w-4" />}
        options={[
          { value: "all", label: "All Types" },
          { value: "list", label: <><CheckSquare className="mr-2 inline h-4 w-4" />Lists</>, triggerLabel: "Lists" },
          { value: "note", label: <><StickyNote className="mr-2 inline h-4 w-4" />Notes</>, triggerLabel: "Notes" },
          { value: "whiteboard", label: <><Palette className="mr-2 inline h-4 w-4" />Whiteboards</>, triggerLabel: "Whiteboards" },
          { value: "wireframe", label: <><GitBranch className="mr-2 inline h-4 w-4" />Wireframes</>, triggerLabel: "Wireframes" },
          { value: "vault", label: <><KeyRound className="mr-2 inline h-4 w-4" />Vaults</>, triggerLabel: "Vaults" },
        ]}
      />
  );
  const categoryFilterControl = (
      <FilterSelect
        value={categoryFilter}
        onValueChange={setCategoryFilter}
        aria-label="Filter by category"
        placeholder="Category"
        options={getUniqueCategories.map((category) => ({
          value: category,
          label: `${category === "all" ? "All Categories" : category} (${getCategoryCounts[category] || 0})`,
          triggerLabel: category === "all" ? "All Categories" : category,
        }))}
      />
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
            data-canvas-add-button
            onClick={onAddClick}
            className="h-11 min-w-11 gap-2 bg-primary px-3 font-light text-primary-foreground interaction-button--primary"
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
