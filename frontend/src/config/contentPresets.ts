import type { FlowData, FlowNode, ListItem } from "@/types";

export type PresetItemType = "list" | "note" | "wireframe";

export type PresetIconName =
  | "rocket"
  | "user-plus"
  | "calendar-check"
  | "send"
  | "presentation"
  | "file-text"
  | "phone-call"
  | "scale"
  | "panel-top"
  | "layout-dashboard"
  | "smartphone"
  | "log-in";

export interface CreateItemPresetPayload {
  presetId: string;
  initialCanvasSize: { width: number; height: number };
  listItems?: ListItem[];
  noteContent?: string;
  wireframeFlowData?: FlowData;
}

export interface ContentPreset {
  id: string;
  itemType: PresetItemType;
  name: string;
  description: string;
  defaultTitle: string;
  icon: PresetIconName;
  createPayload: () => CreateItemPresetPayload;
}

const instanceId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const listItems = (presetId: string, items: string[]) => {
  const instance = instanceId();
  return {
    presetId,
    initialCanvasSize: {
      width: 420,
      height: Math.max(420, 300 + items.length * 46),
    },
    listItems: items.map<ListItem>((text, index) => ({
      id: `preset-${instance}-${index + 1}`,
      text,
      completed: false,
    })),
  };
};

const noteContent = (presetId: string, sections: string[]) => {
  const content = sections.join("");
  const contentBlocks = content.match(/<(?:h2|p|li)(?:\s|>)/g)?.length ?? 0;

  return {
    presetId,
    initialCanvasSize: {
      width: 680,
      height: Math.min(900, Math.max(560, 300 + contentBlocks * 32)),
    },
    noteContent: content,
  };
};

type WireframeNodeOptions = {
  variant?: "browser" | "phone" | "button" | "input" | "navbar" | "card";
  endOffset?: { x: number; y: number };
};

const wireframeNode = (
  instance: string,
  index: number,
  type: string,
  position: { x: number; y: number },
  label: string,
  size: { width: number; height: number },
  options: WireframeNodeOptions = {},
): FlowNode => ({
  id: `preset-${instance}-${type}-${index}`,
  type,
  position,
  data: {
    label,
    ...(options.variant ? { variant: options.variant } : {}),
    ...(options.endOffset
      ? { endOffset: options.endOffset, boundsAligned: true }
      : {}),
  },
  style: size,
  width: size.width,
  height: size.height,
});

const wireframePayload = (
  presetId: string,
  buildNodes: (instance: string) => FlowNode[],
  viewport: FlowData["viewport"] = { x: 24, y: 24, zoom: 0.78 },
): CreateItemPresetPayload => {
  const instance = instanceId();
  const nodes = buildNodes(instance);
  const renderedRight = Math.max(
    ...nodes.map(
      (node) =>
        (node.position.x + (node.width ?? 0)) * viewport.zoom + viewport.x,
    ),
  );
  const renderedBottom = Math.max(
    ...nodes.map(
      (node) =>
        (node.position.y + (node.height ?? 0)) * viewport.zoom + viewport.y,
    ),
  );
  const roundToTwenty = (value: number) => Math.ceil(value / 20) * 20;

  return {
    presetId,
    initialCanvasSize: {
      width: roundToTwenty(Math.max(600, renderedRight + 72)),
      height: roundToTwenty(Math.max(600, renderedBottom + 205)),
    },
    wireframeFlowData: {
      nodes,
      edges: [],
      viewport,
    },
  };
};

const LIST_PRESETS: ContentPreset[] = [
  {
    id: "list.project-launch.v1",
    itemType: "list",
    name: "Project launch",
    description: "Move a project from final review through launch day.",
    defaultTitle: "Project launch",
    icon: "rocket",
    createPayload: () =>
      listItems("list.project-launch.v1", [
        "Confirm scope and launch criteria",
        "Assign owners and final deadlines",
        "Approve copy, assets, and deliverables",
        "Complete quality assurance",
        "Prepare launch communications",
        "Launch and monitor initial results",
        "Schedule the post-launch review",
      ]),
  },
  {
    id: "list.client-onboarding.v1",
    itemType: "list",
    name: "Client onboarding",
    description: "Create a consistent, confident client handoff.",
    defaultTitle: "Client onboarding",
    icon: "user-plus",
    createPayload: () =>
      listItems("list.client-onboarding.v1", [
        "Confirm agreement and primary contacts",
        "Send the welcome and intake materials",
        "Collect required access and assets",
        "Schedule the kickoff meeting",
        "Confirm milestones and communication rhythm",
        "Share the first deliverable and next steps",
      ]),
  },
  {
    id: "list.weekly-priorities.v1",
    itemType: "list",
    name: "Weekly priorities",
    description: "Turn the week into a focused, realistic plan.",
    defaultTitle: "This week's priorities",
    icon: "calendar-check",
    createPayload: () =>
      listItems("list.weekly-priorities.v1", [
        "Review last week's unfinished work",
        "Choose the three highest-impact outcomes",
        "Schedule focused work blocks",
        "Resolve or escalate current blockers",
        "Plan important follow-ups",
        "Review progress at the end of the week",
      ]),
  },
  {
    id: "list.content-publishing.v1",
    itemType: "list",
    name: "Content publishing",
    description: "Take a piece of content from draft to distribution.",
    defaultTitle: "Content publishing checklist",
    icon: "send",
    createPayload: () =>
      listItems("list.content-publishing.v1", [
        "Confirm the audience and desired outcome",
        "Complete the first draft",
        "Edit for clarity and brand voice",
        "Approve visuals and supporting assets",
        "Complete final proof and link checks",
        "Schedule or publish",
        "Review distribution and performance",
      ]),
  },
];

const NOTE_PRESETS: ContentPreset[] = [
  {
    id: "note.meeting-notes.v1",
    itemType: "note",
    name: "Meeting notes",
    description: "Capture context, decisions, and accountable next steps.",
    defaultTitle: "Meeting notes",
    icon: "presentation",
    createPayload: () =>
      noteContent("note.meeting-notes.v1", [
        "<h2>Meeting details</h2>",
        "<p><strong>Date:</strong> </p>",
        "<p><strong>Attendees:</strong> </p>",
        "<h2>Objective</h2><p>What should this meeting accomplish?</p>",
        "<h2>Discussion</h2><ul><li>Main point</li><li>Open question</li></ul>",
        "<h2>Decisions</h2><ul><li>Decision and rationale</li></ul>",
        "<h2>Action items</h2><ul><li>Owner — next step — due date</li></ul>",
      ]),
  },
  {
    id: "note.project-brief.v1",
    itemType: "note",
    name: "Project brief",
    description: "Align a project around its purpose, scope, and outcomes.",
    defaultTitle: "Project brief",
    icon: "file-text",
    createPayload: () =>
      noteContent("note.project-brief.v1", [
        "<h2>Problem</h2><p>What problem are we solving?</p>",
        "<h2>Goal</h2><p>What outcome should this project create?</p>",
        "<h2>Audience</h2><p>Who is this for, and what do they need?</p>",
        "<h2>Scope</h2><ul><li>Included</li><li>Not included</li></ul>",
        "<h2>Milestones</h2><ol><li>Milestone and target date</li></ol>",
        "<h2>Risks</h2><ul><li>Risk and mitigation</li></ul>",
        "<h2>Success criteria</h2><ul><li>How success will be measured</li></ul>",
      ]),
  },
  {
    id: "note.client-call.v1",
    itemType: "note",
    name: "Client call notes",
    description: "Preserve needs, objections, commitments, and follow-up.",
    defaultTitle: "Client call notes",
    icon: "phone-call",
    createPayload: () =>
      noteContent("note.client-call.v1", [
        "<h2>Call context</h2><p>Why are we meeting now?</p>",
        "<h2>Needs and priorities</h2><ul><li>Priority or desired outcome</li></ul>",
        "<h2>Questions and objections</h2><ul><li>Question or concern</li></ul>",
        "<h2>Commitments</h2><ul><li>What we agreed to provide</li></ul>",
        "<h2>Follow-up</h2><ul><li>Owner — next step — due date</li></ul>",
      ]),
  },
  {
    id: "note.decision-record.v1",
    itemType: "note",
    name: "Decision record",
    description: "Document an important decision and why it was made.",
    defaultTitle: "Decision record",
    icon: "scale",
    createPayload: () =>
      noteContent("note.decision-record.v1", [
        "<h2>Decision</h2><p>State the decision clearly.</p>",
        "<h2>Context</h2><p>What made this decision necessary?</p>",
        "<h2>Options considered</h2><ol><li>Option and tradeoffs</li></ol>",
        "<h2>Rationale</h2><p>Why is this the best option now?</p>",
        "<h2>Consequences</h2><ul><li>Expected benefit or cost</li></ul>",
        "<h2>Review trigger</h2><p>When should this decision be revisited?</p>",
      ]),
  },
];

const WIREFRAME_PRESETS: ContentPreset[] = [
  {
    id: "wireframe.landing-page.v1",
    itemType: "wireframe",
    name: "Landing page",
    description: "A conversion-focused page with hero, proof, and CTA.",
    defaultTitle: "Landing page",
    icon: "panel-top",
    createPayload: () =>
      wireframePayload("wireframe.landing-page.v1", (instance) => [
        wireframeNode(instance, 1, "frame", { x: 20, y: 20 }, "Landing page", { width: 760, height: 520 }, { variant: "browser" }),
        wireframeNode(instance, 2, "uiNavbar", { x: 50, y: 72 }, "Brand", { width: 700, height: 40 }, { variant: "navbar" }),
        wireframeNode(instance, 3, "textBox", { x: 110, y: 155 }, "A clear, compelling headline", { width: 360, height: 48 }),
        wireframeNode(instance, 4, "textBox", { x: 110, y: 215 }, "Explain the value in one concise supporting statement.", { width: 420, height: 46 }),
        wireframeNode(instance, 5, "uiButton", { x: 110, y: 280 }, "Get started", { width: 120, height: 36 }, { variant: "button" }),
        wireframeNode(instance, 6, "uiCard", { x: 80, y: 360 }, "Primary benefit", { width: 190, height: 110 }, { variant: "card" }),
        wireframeNode(instance, 7, "uiCard", { x: 295, y: 360 }, "Customer proof", { width: 190, height: 110 }, { variant: "card" }),
        wireframeNode(instance, 8, "uiCard", { x: 510, y: 360 }, "Final CTA", { width: 190, height: 110 }, { variant: "card" }),
      ]),
  },
  {
    id: "wireframe.dashboard.v1",
    itemType: "wireframe",
    name: "Dashboard",
    description: "Navigation, search, metrics, and primary work areas.",
    defaultTitle: "Dashboard",
    icon: "layout-dashboard",
    createPayload: () =>
      wireframePayload("wireframe.dashboard.v1", (instance) => [
        wireframeNode(instance, 1, "frame", { x: 20, y: 20 }, "Dashboard", { width: 760, height: 520 }, { variant: "browser" }),
        wireframeNode(instance, 2, "uiNavbar", { x: 50, y: 72 }, "Workspace", { width: 700, height: 40 }, { variant: "navbar" }),
        wireframeNode(instance, 3, "uiInput", { x: 510, y: 132 }, "Search dashboard", { width: 240, height: 36 }, { variant: "input" }),
        wireframeNode(instance, 4, "uiCard", { x: 70, y: 200 }, "Primary metric", { width: 190, height: 110 }, { variant: "card" }),
        wireframeNode(instance, 5, "uiCard", { x: 285, y: 200 }, "Secondary metric", { width: 190, height: 110 }, { variant: "card" }),
        wireframeNode(instance, 6, "uiCard", { x: 500, y: 200 }, "Current status", { width: 190, height: 110 }, { variant: "card" }),
        wireframeNode(instance, 7, "uiCard", { x: 70, y: 340 }, "Recent activity", { width: 405, height: 145 }, { variant: "card" }),
        wireframeNode(instance, 8, "uiCard", { x: 500, y: 340 }, "Next actions", { width: 190, height: 145 }, { variant: "card" }),
      ]),
  },
  {
    id: "wireframe.mobile-onboarding.v1",
    itemType: "wireframe",
    name: "Mobile onboarding",
    description: "A three-screen welcome, setup, and completion flow.",
    defaultTitle: "Mobile onboarding flow",
    icon: "smartphone",
    createPayload: () =>
      wireframePayload("wireframe.mobile-onboarding.v1", (instance) => [
        wireframeNode(instance, 1, "frame", { x: 20, y: 30 }, "Welcome", { width: 180, height: 320 }, { variant: "phone" }),
        wireframeNode(instance, 2, "textBox", { x: 45, y: 125 }, "Welcome to the product", { width: 130, height: 44 }),
        wireframeNode(instance, 3, "uiButton", { x: 60, y: 275 }, "Continue", { width: 100, height: 36 }, { variant: "button" }),
        wireframeNode(instance, 4, "arrow", { x: 215, y: 175 }, "", { width: 70, height: 20 }, { endOffset: { x: 62, y: 0 } }),
        wireframeNode(instance, 5, "frame", { x: 300, y: 30 }, "Set up", { width: 180, height: 320 }, { variant: "phone" }),
        wireframeNode(instance, 6, "uiInput", { x: 320, y: 140 }, "Your name", { width: 140, height: 36 }, { variant: "input" }),
        wireframeNode(instance, 7, "uiButton", { x: 340, y: 275 }, "Save", { width: 100, height: 36 }, { variant: "button" }),
        wireframeNode(instance, 8, "arrow", { x: 495, y: 175 }, "", { width: 70, height: 20 }, { endOffset: { x: 62, y: 0 } }),
        wireframeNode(instance, 9, "frame", { x: 580, y: 30 }, "Complete", { width: 180, height: 320 }, { variant: "phone" }),
        wireframeNode(instance, 10, "textBox", { x: 605, y: 140 }, "You're ready to go", { width: 130, height: 44 }),
        wireframeNode(instance, 11, "uiButton", { x: 620, y: 275 }, "Open app", { width: 100, height: 36 }, { variant: "button" }),
      ], { x: 20, y: 120, zoom: 0.78 }),
  },
  {
    id: "wireframe.sign-in-flow.v1",
    itemType: "wireframe",
    name: "Sign-in flow",
    description: "Sign-in, recovery, validation, and success states.",
    defaultTitle: "Sign-in flow",
    icon: "log-in",
    createPayload: () =>
      wireframePayload("wireframe.sign-in-flow.v1", (instance) => [
        wireframeNode(instance, 1, "frame", { x: 20, y: 30 }, "Sign in", { width: 260, height: 360 }, { variant: "browser" }),
        wireframeNode(instance, 2, "uiInput", { x: 60, y: 135 }, "Email", { width: 180, height: 36 }, { variant: "input" }),
        wireframeNode(instance, 3, "uiInput", { x: 60, y: 185 }, "Password", { width: 180, height: 36 }, { variant: "input" }),
        wireframeNode(instance, 4, "uiButton", { x: 102, y: 245 }, "Sign in", { width: 96, height: 36 }, { variant: "button" }),
        wireframeNode(instance, 5, "arrow", { x: 295, y: 200 }, "", { width: 70, height: 20 }, { endOffset: { x: 62, y: 0 } }),
        wireframeNode(instance, 6, "frame", { x: 380, y: 30 }, "Recover password", { width: 260, height: 360 }, { variant: "browser" }),
        wireframeNode(instance, 7, "textBox", { x: 420, y: 120 }, "Reset your password", { width: 180, height: 40 }),
        wireframeNode(instance, 8, "uiInput", { x: 420, y: 185 }, "Email", { width: 180, height: 36 }, { variant: "input" }),
        wireframeNode(instance, 9, "uiButton", { x: 450, y: 245 }, "Send link", { width: 120, height: 36 }, { variant: "button" }),
        wireframeNode(instance, 10, "callout", { x: 675, y: 150 }, "Show errors inline and preserve user input", { width: 190, height: 88 }),
      ], { x: 30, y: 100, zoom: 0.82 }),
  },
];

export const isPresetItemType = (
  itemType: string,
): itemType is PresetItemType =>
  itemType === "list" || itemType === "note" || itemType === "wireframe";

export const getContentPresets = (itemType: PresetItemType) => {
  switch (itemType) {
    case "list":
      return LIST_PRESETS;
    case "note":
      return NOTE_PRESETS;
    case "wireframe":
      return WIREFRAME_PRESETS;
  }
};
