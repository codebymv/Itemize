# Itemize.cloud Infinite Canvas Implementation Overview

## Introduction

Itemize.cloud features an interactive "infinite canvas" where users can freely arrange, resize, and interact with various content types, including lists, notes, and whiteboards. This document outlines the core implementation details that enable this dynamic and flexible user interface.

## Core Components

### `react-rnd`

`react-rnd` is a React component that provides drag-and-drop and resizing capabilities. It is the foundational library enabling users to manipulate the position and dimensions of lists, notes, and whiteboards on the canvas.

#### Key Features Used:
-   **Draggable**: Allows elements to be moved freely across the canvas.
-   **Resizable**: Enables users to change the width and height of elements.
-   **Custom Handles**: Supports custom resize handles for a tailored UI.
-   **Boundaries**: Can constrain movement and resizing within a defined area (though for an "infinite" canvas, this might be less restrictive).

### Data Persistence

The position (`position_x`, `position_y`), width (`width`), and height (`height`) of each canvas item (list, note, whiteboard) are stored in their respective database tables. This ensures that the layout is preserved across user sessions and device changes.

## Implementation Details

### Common Pattern for Canvas Items

Each canvas-enabled component (e.g., `ListCard`, `NoteCard`, `WhiteboardCard`) wraps its content with `Rnd` from `react-rnd`. Event handlers for `onDragStop` and `onResizeStop` are used to capture the new position and dimensions, which are then sent to the backend via API calls.

```typescript
// Conceptual example within a canvas item component (e.g., ListCard)
import React from 'react';
import { Rnd } from 'react-rnd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface CanvasItemProps {
  item: {
    id: string;
    position_x: number;
    position_y: number;
    width: number;
    height: number;
    // ... other item-specific properties
  };
  updateApiEndpoint: string; // e.g., '/api/lists/', '/api/notes/'
}

const CanvasItem: React.FC<CanvasItemProps> = ({ item, updateApiEndpoint, children }) => {
  const queryClient = useQueryClient();

  const updateItemMutation = useMutation({
    mutationFn: (updatedProps) => axios.put(`${updateApiEndpoint}${item.id}`, updatedProps),
    onSuccess: () => {
      // Invalidate relevant queries to refetch updated data
      queryClient.invalidateQueries(['canvasItems']); // Or specific query key like ['lists']
    },
  });

  const handleDragStop = (e, d) => {
    updateItemMutation.mutate({ position_x: d.x, position_y: d.y });
  };

  const handleResizeStop = (e, direction, ref, delta, position) => {
    updateItemMutation.mutate({
      width: parseInt(ref.style.width),
      height: parseInt(ref.style.height),
      position_x: position.x,
      position_y: position.y,
    });
  };

  return (
    <Rnd
      size={{ width: item.width, height: item.height }}
      position={{ x: item.position_x, y: item.position_y }}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      bounds=".canvas-container" // Optional: constrain within a parent container
      minWidth={100}
      minHeight={100}
      // ... other Rnd props
    >
      {children}
    </Rnd>
  );
};

export default CanvasItem;
```

### Backend API for Position Updates

Dedicated API endpoints are used to update the positional data of canvas items. For example, for lists:

-   `PUT /api/lists/:id/position`: Updates `position_x` and `position_y`.

### Z-Index Management

To handle overlapping items on the canvas, a `z_index` property is stored for notes and whiteboards. This allows for layering control, ensuring that the most recently interacted-with item appears on top.

## Canvas Rendering

The main canvas view component (`CanvasView`) fetches all canvas-enabled items (lists, notes, whiteboards) and renders them using their respective components, passing down their stored positional and dimensional data.

## Future Enhancements

-   **Real-time Collaboration**: Implement WebSockets to enable multiple users to interact with the same canvas simultaneously, with real-time updates.
-   **Grouping and Alignment**: Features to group multiple items and align them easily.
-   **Snap-to-Grid/Guides**: Visual aids for precise positioning.
-   **Infinite Scrolling**: Optimize rendering for a truly infinite canvas that can handle a very large number of items without performance degradation.
-   **Performance Optimization**: Implement virtualization for rendering only visible items on a very large canvas.
