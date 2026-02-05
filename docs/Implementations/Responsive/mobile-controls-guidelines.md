# Mobile Controls Bar Guidelines

## Overview

The `MobileControlsBar` component provides standardized mobile-only controls at the top of list pages. All pages should follow consistent patterns for consistency and usability.

## Component Location

```tsx
import { MobileControlsBar } from '@/components/MobileControlsBar';
```

## Standard Patterns

### Pattern A1: Simple (Primary Action Only)

**Use for:** Pages with only search and primary add action, no filters

**Layout:** Single row with search (flex-1) + icon-only add button

```tsx
<MobileControlsBar>
  <div className="relative flex-1">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
    <Input
      placeholder="Search..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="pl-10 h-9 w-full bg-muted/20 border-border/50"
    />
  </div>
  <Button size="icon" className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9" onClick={handleCreate}>
    <Plus className="h-4 w-4" />
  </Button>
</MobileControlsBar>
```

**Example pages:** Calendars, Inbox, Social, Chat Widget

---

### Pattern A2: Simple with Filter

**Use for:** Pages with search, one filter select, and add action

**Layout:** Single row with search (flex-1) + select (100-120px) + icon-only add button

```tsx
<MobileControlsBar>
  <div className="relative flex-1">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
    <Input
      placeholder="Search..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="pl-10 h-9 w-full bg-muted/20 border-border/50"
    />
  </div>
  <Select value={filter} onValueChange={setFilter}>
    <SelectTrigger className="w-[100px] h-9">
      <SelectValue placeholder="Filter" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All</SelectItem>
      {/* ... */}
    </SelectContent>
  </Select>
  <Button size="icon" className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9" onClick={handleCreate}>
    <Plus className="h-4 w-4" />
  </Button>
</MobileControlsBar>
```

**Example pages:** Forms, Bookings, Reputation, Campaigns, Email Templates

---

### Pattern B1: Multi Row (Tabs or Filters)

**Use for:** Pages with tab navigation or multiple filters requiring more space

**Layout:** Two rows. Row 1 = search + primary action. Row 2 = tabs/selects + menu.

```tsx
<MobileControlsBar className="flex-col items-stretch">
  {/* Row 1: Primary Actions */}
  <div className="flex items-center gap-2 w-full">
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
      <Input
        placeholder="Search..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="pl-10 h-9 w-full bg-muted/20 border-border/50"
      />
    </div>
    <Button size="icon" className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9" onClick={handleCreate}>
      <Plus className="h-4 w-4" />
    </Button>
  </div>
  
  {/* Row 2: Filters / Tabs / Menu */}
  <div className="flex items-center gap-2 w-full">
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="w-full h-9">
        <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
        {/* ... */}
      </TabsList>
    </Tabs>
    {moreMenu && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* ... */}
        </DropdownMenuContent>
      </DropdownMenu>
    )}
  </div>
</MobileControlsBar>
```

**OR with selects instead of tabs:**

```tsx
<MobileControlsBar className="flex-col items-stretch">
  {/* Row 1: Primary Actions */}
  <div className="flex items-center gap-2 w-full">
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
      <Input
        placeholder="Search..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="pl-10 h-9 w-full bg-muted/20 border-border/50"
      />
    </div>
    <Button size="icon" className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9" onClick={handleCreate}>
      <Plus className="h-4 w-4" />
    </Button>
  </div>
  
  {/* Row 2: Filters */}
  <div className="flex items-center gap-2 w-full">
    <Select value={filter1} onValueChange={setFilter1}>
      <SelectTrigger className="flex-1 h-9">
        <SelectValue placeholder="Filter 1" />
      </SelectTrigger>
      <SelectContent>
        {/* ... */}
      </SelectContent>
    </Select>
    <Select value={filter2} onValueChange={setFilter2}>
      <SelectTrigger className="flex-1 h-9">
        <SelectValue placeholder="Filter 2" />
      </SelectTrigger>
      <SelectContent>
        {/* ... */}
      </SelectContent>
    </Select>
    {moreMenu && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* ... */}
        </DropdownMenuContent>
      </DropdownMenu>
    )}
  </div>
</MobileControlsBar>
```

**Example pages:** Contacts, Invoices, Signatures, Landing Pages, Automations

---

## Standard Classes Reference

### Input (Search)
- Padding: `pl-10` (icon on left)
- Height: `h-9`
- Background: `bg-muted/20 border-border/50`

### Button (Add Action)
- Size on mobile: `size="icon"` or `h-9 w-9` (icon-only)
- Background: `bg-blue-600 hover:bg-blue-700 text-white`

### Select
- Width: `w-[100px]` or `w-[120px]` (for single-row patterns)
- Width: `flex-1` (for multi-row patterns with multiple selects)
- Height: `h-9`
- Background: `bg-muted/20 border-border/50` (same as Input)

### Tabs
- Wrapper: `w-full h-9`
- Triggers: `flex-1 text-xs` (for mobile tabs row)

### Spacing
- Gap between controls: `gap-2` (standard)
- For multi-row: Row gap via separate divs or optional `gap-2` on container

---

## Page Classification

Choose pattern based on page complexity:

| Complexity | Pattern | Reason |
|------------|---------|--------|
| Very simple (only search + add) | A1 | Minimal controls needed |
| Simple (search + single select + add) | A2 | One filter required |
| Complex (tabs or multiple filters) | B1 | More space needed for filters |

---

## Desktop Controls Standard

While this doc focuses on mobile, desktop controls should follow:

```tsx
<div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
  <div className="relative w-full max-w-xs">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
    <Input
      placeholder="Search..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors"
    />
  </div>
  {/* Select if needed: w-[120px] h-9 bg-muted/20 border-border/50 */}
  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-light">
    <Plus className="h-4 w-4 mr-2" />
    Add Item
  </Button>
</div>
```

---

## Migration Checklist

For existing pages that don't follow these patterns:

- [ ] Move Add button to row 1 (next to search)
- [ ] Use icon-only Add button on mobile (`size="icon"`)
- [ ] Standardize search input: `pl-10 h-9 bg-muted/20 border-border/50`
- [ ] Standardize select widths: 100-120px (A1/A2) or flex-1 (B1)
- [ ] Use `gap-2` between controls
- [ ] Use `flex-col items-stretch` for multi-row patterns

---

## Common Pitfalls

### Don't use full-width search in row 1
❌ `w-full` without add button in row 1
✅ `flex-1` with add button next to it

### Don't put Add button in row 2
❌ Row 1 = search only, Row 2 = filters + add button
✅ Row 1 = search + add button, Row 2 = filters only

### Don't use text in Add button on mobile
❌ `<Button size="sm"><Plus /> Add Item</Button>` on mobile
✅ `<Button size="icon"><Plus /></Button>` on mobile

### Don't mix spacing values
❌ `gap-3` sometimes, `gap-2` others
✅ Always `gap-2`

### Don't vary search padding
❌ `pl-9` on some pages, `pl-10` on others
✅ Always `pl-10` (with `left-3` icon)