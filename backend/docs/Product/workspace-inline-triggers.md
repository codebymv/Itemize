# Workspace inline triggers

*Plan, 2026-09-06. Builds on the contact seam (`contactId` on workspace content). Nothing built yet.*

Type `@`, `$`, `#`, or `/` anywhere you can type on the canvas and a list appears at the caret — the Slack composer pattern applied to clients, money documents, categories, and actions. The client chip becomes the result of a gesture, not the entry point.

## What we keep from Slack

1. The trigger is a character at the caret; the list follows the caret.
2. Rows are identity plus context: initials, client name, then company or email in a quieter weight.
3. Special rows sit in the same list with a one-line description ("New client …", "Link this card to …").
4. Keyboard is complete: arrows move, Enter/Tab accept, Esc dismisses and keeps the typed text.
5. The mouse gets an equivalent door: an `@` button on the note toolbar; the card chip for cards without an editor.
6. The result is a pill that carries the id, not the label.

## Vocabulary (four triggers is the ceiling)

| Trigger | Kind | Searches | On accept |
| --- | --- | --- | --- |
| `@` | bind | contacts in the current organization | inserts a pill; if the card is unbound, binds it through `contactId`. Special rows: *New client "…"*; on Free a single upgrade row. |
| `$` | reference | invoices, estimates, payments — bound client's first | inserts a pill with live status (`$INV-0012 · sent · viewed 2d`). Special row: *New estimate for <client>*. |
| `#` | organize | categories now, frames once they exist | sets category / frame. Wait for the frames slice; build once. |
| `/` | command | actions: turn into estimate, new list, share, archive | runs the action. `Ctrl K` is the global version; `/` is in-context. |

## Two primitives

| Primitive | Meaning | Cardinality | Storage |
| --- | --- | --- | --- |
| Binding | this card is *about* this client | one per card | `contact_id` on the card (shipped) |
| Reference | this text *points at* that entity | many per card | `workspace_references` (new): source type/id, entity type/id, owner |

A mention pill is a reference. The first `@` on an unbound card also creates the binding; unlinking from the chip removes the binding without touching the text.

## Behaviour rules

- Ids, never names. Pills render from ids; a pill whose entity the reader cannot see renders as plain text.
- The server validates every id on save with the organization-membership check the binding uses; unauthorized ids are downgraded to text and nothing else is written (same concealment as `CONTACT_NOT_FOUND`).
- Public share projections strip pills to labels.
- The dialog remains the fallback: mobile, Free's empty slot, screen readers, whiteboards.
- Suggestions are scoped by context (`$` → bound client's documents first; `@` → recently linked first). An empty query shows the top five.
- `role="listbox"` + `aria-activedescendant`; Esc always restores the caret with the typed text.

## Architecture

```
useEntitySuggestions(trigger, query, context)   // '@' | '$' | '#' | '/'
<EntitySuggestionList/>                          // cmdk list shared with ContactCatalogPicker
adapters: notes (TipTap Mention + Suggestion), plain inputs (list items, titles), later email/notes
```

- Rich text: TipTap mention node `<span data-type="mention" data-entity="contact" data-id="1">@Casey Sanchez</span>`.
- Plain text: token `@[Casey Sanchez](contact:1)` inside the existing string — no schema change to list `items`.
- Hydration on read resolves ids to current labels/status for the owner.
- Save (already replay-safe) parses nodes/tokens, validates ids, and upserts `workspace_references` in the same transaction.
- `references` on the four workspace types; `referencedBy` on invoice and estimate.

## Traps already found

- `frontend/src/lib/sanitizeNoteHtml.ts` allows only `class`/`style` attributes; mention nodes must be admitted (`data-type`, `data-entity`, `data-id`) or pills silently degrade to text on reload. The backend regex sanitizer keeps them.
- List items are `{ id, text, completed }` JSONB with nowhere for metadata — hence the token form.
- `workspaceListMutationsGraphql.ts`, `workspaceNoteMutationsGraphql.ts`, and the snapshot loader's `mapCanvasList` each carry their own selection/mapper; new fields go in all three (regression tests guard this).
- Realtime is not needed; pills hydrate on read.

## Slices

1. **`@` in notes (~1.5 days).** `@tiptap/extension-mention` + `@tiptap/suggestion`; lift the picker's query into `useEntitySuggestions`; sanitizer allowlist; first mention binds; toolbar `@` button; Free upgrade row. *Accept:* typing `@Cas`, Enter, reload, and the client page shows pill, chip, and the note under Related Content — no modal.
2. **`@` in list items and titles (~1 day).** Input adapter, token insert, parser + pill renderer, server-side id validation. *Accept:* `Call @Casey about tile` renders a pill, survives edits, binds an unbound list.
3. **References + `$` (~3 days).** `workspace_references` migration; money-document suggestion query; hydrated `references` / `referencedBy`; status pills; public projections strip; *New estimate for <client>* row. *Accept:* `$INV-0012` shows "sent · viewed", the invoice page lists the note, a public viewer sees only text.
4. **`/` actions (~2 days), then `#` with frames.** *Accept:* `/turn into estimate` on a bound list opens a prefilled draft.

## Verification

Unit (hook, token parser, sanitizer allowlist); contract specs unchanged (replay, authorization, consumer); integration (outsider id downgrades to text and writes no reference, hydration conceals, public share strips); one recorded browser story per slice.

## Open decisions

1. Second client on a bound card: reference only (recommended) vs. a one-time "Switch link?" row.
2. Plain-text token syntax: `@[label](contact:id)` (recommended) vs. a per-item `mentions` array (needs a migration).
3. `$` default scope: bound client first (recommended) vs. organization-wide by recency.
4. Free plan `@`: one upgrade row (recommended) vs. no trigger.
