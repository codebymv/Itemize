# Canvas Refactoring Phase 2 Plan

## Next Hooks to Extract

### 1. useCanvasFilters (~150 lines)

**Responsibility:**
- Type filter state and logic
- Category filter state and logic  
- Search query state
- Filter by category logic
- Combine all filters (type + category + search)

**Extract from canvas.tsx lines:**
- Lines 102-104: typeFilter, categoryFilter, searchQuery state
- Lines 270-311: getUniqueCategories, getCategoryCounts, filterByCategory
- Lines 571-589: filteredData useMemo
- Lines 1718-1765: getFilteredContent function

**Interface:**
```ts
export function useCanvasFilters(
  lists: List[],
  notes: Note[],
  whiteboards: Whiteboard[],
  wireframes: Wireframe[],
  vaults: Vault[]
) {
  typeFilter, categoryFilter, searchQuery setters
  uniqueCategories, categoryCounts
  filteredContent
  setters and handlers
}
```

---

### 2. useCanvasCRUD (~250 lines)

**Responsibility:**
- handleCreateNote, handleUpdateNote, handleDeleteNote
- handleCreateWhiteboard, handleUpdateWhiteboard, handleDeleteWhiteboard  
- handleCreateWireframe, handleUpdateWireframe, handleDeleteWireframe
- handleCreateVault, handleUpdateVault, handleDeleteVault
- handleShareVault, handleUnshareVault

**Extract from canvas.tsx lines:**
- Lines 841-873: handleCreateNote
- Lines 876-900: handleUpdateNote
- Lines 918-948: handleDeleteNote
- Lines 951-984: handleCreateWhiteboard
- Lines 987-1027: handleUpdateWhiteboard
- Lines 1029-1048: handleDeleteWhiteboard
- Lines 1051-1080: handleCreateWireframe
- Lines 1082-1103: handleUpdateWireframe
- Lines 1105-1123: handleDeleteWireframe  
- Lines 1137-1209: handleCreateVault, handleUpdateVault, handleDeleteVault, handleShareVault, handleUnshareVault

**Interface:**
```ts
export function useCanvasCRUD(
  token: string | null,
  categoriesHook: useDatabaseCategories,
  onWireframeUpdate: (wireframe: Wireframe) => void
) {
  return {
    noteHandlers: { create, update, delete }
    whiteboardHandlers: { create, update, delete, share }
    wireframeHandlers: { create, update, delete }
    vaultHandlers: { create, update, delete, share, unshare }
  }
}
```

---

### 3. useCanvasCollapsible (~60 lines)

**Responsibility:**
- Collapsed state for lists, notes, whiteboards
- Toggle functions
- Generate stable callbacks (memoized)

**Extract from canvas.tsx lines:**
- Lines 468-568: collapsedListIds, collapsedNoteIds, collapsedWhiteboardIds state and toggle functions

**Interface:**
```ts
export function useCanvasCollapsible<T extends List | Note | Whiteboard>(items: T[]) {
  return {
    isCollapsed: (id: string | number) => boolean
    toggleCollapsed: (id: string | number) => void
    toggleCallbacks: Record<string, () => void>
  }
}
```

---

### 4. useCanvasContextMenu (~50 lines)

**Responsibility:**
- Button context menu position state
- Show/hide logic
- Click outside handling

**Extract from canvas.tsx lines:**
- Lines 340-338, 824-838: showButtonContextMenu, buttonMenuPosition, handleClickOutside

**Interface:**
```ts
export function useCanvasContextMenu() {
  return {
    showButtonContextMenu: boolean
    buttonMenuPosition: { x: number, y: number }
    handleOpenMenu: (position: { x, y }) => void
    handleCloseMenu: () => void
  }
}
```

---

### 5. useCanvasSharing (~100 lines)

**Responsibility:**
- Share modal state (showShareModal, currentShareItem)
- handleShareList, handleShareNote, handleShareWhiteboard, handleShareVault
- handleListShare, handleNoteShare, handleWhiteboardShare
- handleListUnshare, handleNoteUnshare, handleWhiteboardUnshare
- shareHandlers object (unified interface)

**Extract from canvas.tsx lines:**
- Lines 124-132, 1462-1599: Sharing modal state and all share handlers

**Interface:**
```ts
export function useCanvasSharing(
  lists: List[],
  notes: Note[],
  whiteboards: Whiteboard[],
  vaults: Vault[],
  token: string | null
) {
  return {
    showShareModal: boolean
    currentShareItem: ShareItem | null
    shareHandlers: Record<ItemType, { onShare, onUnshare }>
    handleShareX: (id: string | number) => void
    setShowShareModal: (show: boolean) => void
    setCurrentShareItem: (item: ShareItem) => void
  }
}
```

---

### 6. useCanvasPosition (~80 lines)

**Responsibility:**
- Intelligent positioning utility (non-overlapping)
- getIntelligentPosition function
- Position update handlers (delegated)

**Extract from canvas.tsx lines:**
- Lines 474-519: getIntelligentPosition function
- Lines 1657-1680: handleListPositionUpdate, handleWhiteboardPositionUpdate, handleWireframePositionChange, handleVaultPositionChange

---

## Component Extractions

### 1. CanvasToolbar Component (~150 lines)

**From canvas.tsx lines 350-465:**
- Desktop header toolbar with filters
- Type filter dropdown
- Category filter dropdown  
- Search input
- Add content button
- Button context menu trigger

### 2. MobileListView Component (~180 lines)

**From canvas.tsx lines 1789-1970:**
- Mobile content grid
- Category filter tabs
- Lists, notes, whiteboards sections
- Empty states

---

## Execution Order

| Step | Extract | Lines | Difficulty |
|------|---------|-------|------------|
| 1 | useCanvasFilters | ~150 | Medium |
| 2 | useCanvasCollapsible | ~60 | Easy |
| 3 | useCanvasContextMenu | ~50 | Easy |
| 4 | CanvasToolbar component | ~150 | Medium |
| 5 | MobileListView component | ~180 | Medium |
| 6 | useCanvasSharing | ~100 | Medium |
| 7 | useCanvasCRUD | ~250 | Hard |
| 8 | useCanvasPosition | ~80 | Medium |

**Total expected extraction: ~1,020 lines**

**Estimated canvas.tsx after Phase 2: ~280 lines**

---

## Dependencies

```
useCanvasFilters
  ↓ depends on
useCanvasCRUD
  ↓ needs
useCanvasSharing
  ↓ uses
useCanvasCollapsible
useCanvasContextMenu
useCanvasPosition

All hooks → data from useCanvasData
All hooks → token/useAuthState
```

---

## Success Criteria for Phase 2

- [ ] All 8 hooks/components created
- [ ] canvas.tsx reduced from ~2,000 → ~280 lines
- [ ] All existing tests pass
- [ ] No TypeScript errors
- [ ] All functionality verified working:
  - CRUD operations
  - Filtering and search
  - Sharing
  - Mobile view
  - Collapsible lists/notes
  - Real-time updates

---

## Next Actions

1. **Create useCanvasFilters** (start - medium complexity, most used)
2. **Create useCanvasCollapsible** (simple, easy win)
3. **Create useCanvasContextMenu** (simple, easy win)
4. **Create CanvasToolbar component** (isolated UI component)
5. **Create MobileListView component** (isolated UI component)
6. **Create useCanvasSharing** (complex but self-contained)
7. **Create useCanvasCRUD** (most complex, do last)
8. **Create useCanvasPosition** (medium complexity)

**Estimated time:** 2-3 sessions
**Total remaining canvas.tsx reduction:** ~720 lines