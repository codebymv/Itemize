# Itemize.cloud Notes Implementation Overview

## Introduction

Itemize.cloud provides a flexible note-taking feature, allowing users to create and manage free-form text notes. These notes can be positioned and resized on the canvas, similar to lists.

## Core Note Management

### Data Model

Notes are stored in the `notes` table in the PostgreSQL database. Each note has a title, content, category, and positional data.

```sql
CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT DEFAULT '',
    category VARCHAR(100) DEFAULT 'General',
    color_value VARCHAR(7) DEFAULT '#3B82F6',
    position_x INTEGER,
    position_y INTEGER,
    width INTEGER,
    height INTEGER,
    z_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
);
```

### Backend Endpoints

Note operations are handled by the following API endpoints in `backend/src/index.js`:

-   `GET /api/notes`: Retrieve all notes for the authenticated user.
-   `POST /api/notes`: Create a new note.
-   `PUT /api/notes/:noteId`: Update an existing note.
-   `DELETE /api/notes/:noteId`: Delete a note.

### Frontend Implementation

Notes are managed in the frontend using React components. The `NoteCard` component (conceptual) is responsible for rendering individual notes and handling their interactions.

```typescript
// src/features/notes/components/NoteCard.tsx (Conceptual)
import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface NoteCardProps {
  note: {
    id: string;
    title: string;
    content: string;
    position_x: number;
    position_y: number;
    width: number;
    height: number;
  };
}

const NoteCard: React.FC<NoteCardProps> = ({ note }) => {
  const queryClient = useQueryClient();

  const updateNoteMutation = useMutation({
    mutationFn: (updatedNote) => axios.put(`/api/notes/${note.id}`, updatedNote),
    onSuccess: () => {
      queryClient.invalidateQueries(['notes']);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: () => axios.delete(`/api/notes/${note.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['notes']);
    },
  });

  const handleDragStop = (e, d) => {
    updateNoteMutation.mutate({ ...note, position_x: d.x, position_y: d.y });
  };

  // ... rendering logic with react-rnd for drag/resize
  return (
    <div style={{ left: note.position_x, top: note.position_y, width: note.width, height: note.height }}>
      <h3>{note.title}</h3>
      <p>{note.content}</p>
      <button onClick={() => deleteNoteMutation.mutate()}>Delete</button>
    </div>
  );
};

export default NoteCard;
```

## Canvas View Integration

Notes are fully integrated into the canvas view, allowing users to drag, resize, and layer them alongside lists and whiteboards. The `react-rnd` library is used for this functionality.

### Implementation Details

Similar to lists, the `position_x`, `position_y`, `width`, `height`, and `z_index` properties of notes are updated via API calls when the user interacts with them on the canvas. This ensures their state is persisted across sessions.

## Content Editing

Notes support rich text editing capabilities, allowing users to format their content. (Conceptual: This would typically involve a rich text editor library like TipTap or Quill).

## Future Enhancements

- **Rich Text Editor**: Integrate a full-featured rich text editor for note content.
- **Markdown Support**: Allow notes to be written in Markdown format.
- **Note Sharing**: Enable sharing of notes with other users.
