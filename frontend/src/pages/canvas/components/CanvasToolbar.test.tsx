import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DesktopHeaderTools } from "@/components/layout/DesktopHeaderTools";
import { createCanvasHeaderTools } from "./CanvasToolbar";

describe("createCanvasHeaderTools", () => {
  it("reserves enough width for the complete default filter labels", () => {
    const tools = createCanvasHeaderTools({
      searchQuery: "",
      setSearchQuery: vi.fn(),
      typeFilter: "all",
      setTypeFilter: vi.fn(),
      categoryFilter: "all",
      setCategoryFilter: vi.fn(),
      getUniqueCategories: ["all"],
      getCategoryCounts: { all: 0 },
      onAddClick: vi.fn(),
    });

    render(
      <TooltipProvider>
        <DesktopHeaderTools {...tools} />
      </TooltipProvider>,
    );

    // The trigger sizes itself to its widest option, so no authored label can clip.
    const typeFilter = screen.getByRole("combobox", { name: "Filter by content type" });
    expect(typeFilter).toHaveAttribute("data-filter-select");
    expect(typeFilter).not.toHaveClass("w-[8rem]");
    expect(
      Array.from(typeFilter.querySelectorAll("[data-filter-select-sizer]")).map((node) => node.textContent),
    ).toEqual(["All Types", "Lists", "Notes", "Whiteboards", "Wireframes", "Vaults"]);
    const categoryFilter = screen.getByRole("combobox", { name: "Filter by category" });
    expect(categoryFilter).toHaveAttribute("data-filter-select");
    expect(categoryFilter.querySelector("[data-filter-select-sizer]")).toHaveTextContent("All Categories");
  });
});
