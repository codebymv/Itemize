import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

describe("ContextMenu", () => {
  it("places wireframes before whiteboards in every canvas creation menu", () => {
    render(
      <ContextMenu
        position={{ x: 0, y: 0 }}
        onAddList={vi.fn()}
        onAddNote={vi.fn()}
        onAddWireframe={vi.fn()}
        onAddWhiteboard={vi.fn()}
        onAddVault={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const wireframe = screen.getByRole("button", { name: "Add Wireframe" });
    const whiteboard = screen.getByRole("button", { name: "Add Whiteboard" });

    expect(
      wireframe.compareDocumentPosition(whiteboard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
