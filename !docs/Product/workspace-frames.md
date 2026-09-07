# Workspace frames

*Plan, 2026-09-06. Follows the inline triggers (`@`, `$`, `/`). Frames are the region primitive the canvas was missing: one level, no nesting, the same object for a Free user's project and a paid user's client engagement.*

A frame is a named rectangle on the canvas. Cards inside it belong to it; drag the frame and they come along. Bind the frame to a client and it becomes that client's engagement on the canvas — the same chip and the same organization-membership check the cards use. Free users get frames without the binding.

## Decisions

| Question | Decision | Why |
| --- | --- | --- |
| How does a card belong to a frame? | **Spatial containment**: a card is in the frame whose rectangle contains the card's centre. No `frame_id` columns. | Miro/FigJam behaviour; drag in = join, drag out = leave; nothing to migrate on five tables; `#` later just moves the card. |
| Nesting | None. Frames never contain frames. | One level keeps "which frame am I in" unambiguous. |
| Colour | A card's colour is its **accent**: the dot, progress, client chip, sparkle, and primary action inside it read from it (`lib/cardAccent.tsx`, provided at each card root); brand blue is only the default a card starts with. A frame's colour is the accent of its header and **flows down**: recolour the frame and every card inside takes the colour; a card still on the default blue takes it on entry. | One colour per project in one gesture; nothing inside a card hard-codes blue. Decided 2026-09-07. |
| Category | A frame may carry a category (`workspace_frames.category`, migration 079) that **flows down** like its client: pick one and every card inside takes it; a card on the default category takes it on entry; clearing pushes nothing. The canvas category filter still leaves frames standing. | A frame is "one project, one client, one category" in one gesture; the filter question is a frame filter, not a category. Decided 2026-09-07. |
| Moving a frame | Moves the frame and every contained card in **one** `batchCanvasPositions` call (type `frame` joins the batch). | One replay boundary, one round trip. |
| Frame binding | `contact_id` on `workspace_frames`, validated against `organization_members` inside the write, same concealment as cards (`CONTACT_NOT_FOUND`). | Same contract as slice 1. |
| Cards inherit the binding? | **Yes.** Binding a frame writes the client onto every card inside it; unlinking clears only the cards that carried that same client; a card that enters a bound frame (drop or `#`) with no client takes the frame's. Each write goes through the card's own mutation, so the membership check still runs per card. | The frame is the engagement; a card inside it is that client's work. Decided 2026-09-06 after the first hand-drag. |
| Sharing | Not in this slice. | A frame share must snapshot ZK vaults per vault (`crypto_version >= 2`) — designed separately. |
| Realtime | None. | Frames have no shared projection yet; positions hydrate on read. |
| Mobile / Contents | Canvas only. | Contents has no geometry; frames are geometry. |
| Creation | Immediate: **Add Frame** on the canvas menu creates "Untitled frame" at the click and opens its title for editing. | A frame has no category or preset; a dialog would only ask for a name. |
| Archive | Waits for the archive slice (no column yet). | |

## Data

`workspace_frames` (migration 077, marker `workspace_frames_v1`): `id`, `user_id` (cascade), `title`, `color_value`, `position_x`, `position_y`, `width`, `height` (200–10 000), `z_index`, `contact_id` (set null on delete), `created_at`, `updated_at`. `workspace_creation_receipts.entity_type` widens to admit `frame`.

## API (AccountScoped, CSRF on mutations)

- `workspaceFrames(page)` — the owner's frames, hydrated `contactName`.
- `createWorkspaceFrame(input { idempotencyKey, title?, colorValue?, positionX?, positionY?, width?, height?, contactId? })` — receipt-backed replay like every other create.
- `updateWorkspaceFrame(id, input { mutationId, expectedUpdatedAt, … })` — revision-guarded; `STALE_FRAME_REVISION` on conflict.
- `deleteWorkspaceFrame(id, mutationId)`.
- `batchCanvasPositions` accepts `type: "frame"` (position, width, height; never bumps `updated_at`, so a move does not invalidate the title editor's revision).
- `contactContent` gains `frames`; the contact page lists them under Related Content with a canvas deep link (`/canvas?focus=frame:id`).

## Canvas

- `DraggableFrame`: absolute region **behind** the cards (frame `z_index` 0; cards start at 1) with a header strip — title (click to rename), client chip, colour, menu (Rename, Colour, Archive, Delete). Drag by the header moves frame + contained cards **live** (each card root carries `data-canvas-card="type:id"`; the frame resolves the contained nodes at drag start and shifts them by its delta on every mouse move; the drop commits one position batch); resize from the corner. The body is pan-through (`data-canvas-pan`), so dragging empty frame space still pans the canvas.
- Containment is computed on the client from geometry (`lib/frameContainment.ts`), never stored.
- `#` (next slice): move the current card into a frame's first open slot.

## Verification

Unit: containment/move maths, service validation. Integration: create replay, stale revision, delete, client binding + concealment, frame in `contactContent`, batch move with `frame`. Contracts: replay (`createWorkspaceFrame` carries `idempotencyKey`), authorization (`AccountScoped` + `CsrfProtected`), consumer (frontend documents resolve), schema (new table + marker). Browser: create, rename, bind, drag with cards, focus from the contact page.
