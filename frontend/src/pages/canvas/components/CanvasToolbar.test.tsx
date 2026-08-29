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

    expect(
      screen.getByRole("combobox", { name: "Filter by content type" }),
    ).toHaveClass("w-[8rem]");
    expect(
      screen.getByRole("combobox", { name: "Filter by category" }),
    ).toHaveClass("w-[9.5rem]");
  });
});
