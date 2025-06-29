# Itemize.cloud Lists Implementation Overview

## Introduction

Itemize.cloud provides robust list management functionalities, allowing users to create, organize, and interact with their lists. This document details the implementation of list features, including standard CRUD operations and canvas-specific interactions.

## Core List Management

### Data Model

Lists are stored in the `lists` table in the PostgreSQL database. Each list has a title, category, items (as JSONB), and positional data for the canvas view.

```sql
CREATE TABLE IF NOT EXISTS lists (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'General',
    items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    color_value VARCHAR(7),
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    width INTEGER DEFAULT 340,
    height INTEGER DEFAULT 265,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
);
```

### Backend Endpoints

List operations are handled by the following API endpoints in `backend/src/index.js`:

-   `GET /api/lists`: Retrieve all lists for the authenticated user.
-   `POST /api/lists`: Create a new list.
-   `PUT /api/lists/:id`: Update an existing list.
-   `DELETE /api/lists/:id`: Delete a list.

### Frontend Implementation

Lists are managed in the frontend using React components and `react-query` for data fetching and state management. The `ListCard` component (conceptual) is responsible for rendering individual lists.

```typescript
// src/features/lists/components/ListCard.tsx (Conceptual)
import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface ListCardProps {
  list: {
    id: string;
    title: string;
    items: { id: number; text: string; completed: boolean }[];
    position_x: number;
    position_y: number;
    width: number;
    height: number;
  };
}

const ListCard: React.FC<ListCardProps> = ({ list }) => {
  const queryClient = useQueryClient();

  const updateListMutation = useMutation({
    mutationFn: (updatedList) => axios.put(`/api/lists/${list.id}`, updatedList),
    onSuccess: () => {
      queryClient.invalidateQueries(['lists']);
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: () => axios.delete(`/api/lists/${list.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['lists']);
    },
  });

  const handleDragStop = (e, d) => {
    updateListMutation.mutate({ ...list, position_x: d.x, position_y: d.y });
  };

  // ... rendering logic with react-rnd for drag/resize
  return (
    <div style={{ left: list.position_x, top: list.position_y, width: list.width, height: list.height }}>
      <h3>{list.title}</h3>
      {/* Render items */}
      <button onClick={() => deleteListMutation.mutate()}>Delete</button>
    </div>
  );
};

export default ListCard;
```

## Canvas View Implementation

Itemize.cloud features a canvas view where lists can be freely positioned and resized. This is achieved using the `react-rnd` library.

### Backend Endpoints

-   `GET /api/canvas/lists`: Retrieves all lists with their positional data.
-   `PUT /api/lists/:id/position`: Updates the `position_x` and `position_y` of a specific list.

### Frontend Implementation

The `react-rnd` library is integrated into the `ListCard` component to enable drag-and-drop and resizing functionalities. The `onDragStop` and `onResizeStop` callbacks are used to update the list's position and dimensions in the backend.

```typescript
// src/features/canvas/components/CanvasView.tsx (Conceptual)
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import ListCard from '../../lists/components/ListCard';

const CanvasView = () => {
  const { data: lists, isLoading, isError } = useQuery({
    queryKey: ['lists'],
    queryFn: () => axios.get('/api/canvas/lists').then(res => res.data),
  });

  if (isLoading) return <div>Loading canvas...</div>;
  if (isError) return <div>Error loading canvas.</div>;

  return (
    <div className="canvas-container">
      {lists.map((list) => (
        <ListCard key={list.id} list={list} />
      ))}
    </div>
  );
};

export default CanvasView;
```

## Item Management within Lists

Each list contains an array of items, stored as JSONB in the `items` column. Items can be added, updated, and deleted directly within the list's UI.

### Data Structure

```json
[
  {
    "id": 1,
    "text": "Buy groceries",
    "completed": false
  },
  {
    "id": 2,
    "text": "Walk the dog",
    "completed": true
  }
]
```

### Implementation Details

Item updates are handled by updating the entire `items` JSONB array for a given list via the `PUT /api/lists/:id` endpoint. The frontend manages the state of items within a list and sends the updated array to the backend.

## Future Enhancements

- **Real-time Collaboration**: Implement WebSocket for real-time updates on lists and canvas.
- **List Sharing**: Allow users to share lists with other users.
- **Templates**: Provide pre-defined list templates.
