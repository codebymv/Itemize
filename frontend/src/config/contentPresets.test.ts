import { describe, expect, it } from "vitest";
import { getContentPresets } from "./contentPresets";

describe("content presets", () => {
  it.each(["list", "note", "wireframe"] as const)(
    "provides four versioned %s presets",
    (itemType) => {
      const presets = getContentPresets(itemType);

      expect(presets).toHaveLength(4);
      expect(new Set(presets.map((preset) => preset.id)).size).toBe(4);
      expect(
        presets.every(
          (preset) =>
            preset.itemType === itemType &&
            preset.id.endsWith(".v1") &&
            preset.defaultTitle.length > 0,
        ),
      ).toBe(true);
    },
  );

  it("generates fresh list item identifiers for every creation", () => {
    const preset = getContentPresets("list")[0];
    const first = preset.createPayload().listItems ?? [];
    const second = preset.createPayload().listItems ?? [];

    expect(first).not.toHaveLength(0);
    expect(first.map((item) => item.id)).not.toEqual(
      second.map((item) => item.id),
    );
  });

  it("generates usable rich note content and wireframe flow data", () => {
    const note = getContentPresets("note")[0].createPayload();
    const wireframe = getContentPresets("wireframe")[0].createPayload();

    expect(note.noteContent).toContain("<h2>");
    expect(wireframe.wireframeFlowData?.nodes.length).toBeGreaterThanOrEqual(6);
    expect(wireframe.wireframeFlowData?.viewport.zoom).toBeGreaterThan(0);
  });

  it("derives an initial canvas footprint from each preset's content", () => {
    const projectLaunch = getContentPresets("list")[0].createPayload();
    const projectBrief = getContentPresets("note")[1].createPayload();
    const landingPage = getContentPresets("wireframe")[0].createPayload();
    const signInFlow = getContentPresets("wireframe")[3].createPayload();

    expect(projectLaunch.initialCanvasSize).toEqual({
      width: 420,
      height: 622,
    });
    expect(projectBrief.initialCanvasSize.width).toBeGreaterThan(570);
    expect(projectBrief.initialCanvasSize.height).toBeGreaterThan(350);
    expect(landingPage.initialCanvasSize).toEqual({
      width: 720,
      height: 660,
    });
    expect(signInFlow.initialCanvasSize.width).toBeGreaterThan(
      landingPage.initialCanvasSize.width,
    );
  });
});
