# Itemize.cloud Whiteboards Implementation Overview

## Introduction

Itemize.cloud offers an interactive whiteboard feature, providing users with a free-form canvas for drawing and visual organization. Whiteboards can be positioned and resized on the main canvas alongside lists and notes.

## Core Whiteboard Management

### Data Model

Whiteboards are stored in the `whiteboards` table in the PostgreSQL database. Key attributes include title, category, canvas data (as JSONB), and positional data.

```sql
CREATE TABLE IF NOT EXISTS whiteboards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'General',
    canvas_data JSONB DEFAULT '{"paths": [], "shapes": []}',
    canvas_width INTEGER,
    canvas_height INTEGER,
    background_color VARCHAR(7) DEFAULT '#FFFFFF',
    position_x INTEGER,
    position_y INTEGER,
    z_index INTEGER DEFAULT 0,
    color_value VARCHAR(7) DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Backend Endpoints

Whiteboard operations are handled by the following API endpoints in `backend/src/index.js`:

-   `GET /api/whiteboards`: Retrieve all whiteboards for the authenticated user.
-   `POST /api/whiteboards`: Create a new whiteboard.
-   `PUT /api/whiteboards/:whiteboardId`: Update an existing whiteboard.
-   `DELETE /api/whiteboards/:whiteboardId`: Delete a whiteboard.

### Frontend Implementation

Whiteboards are rendered using React components. The `WhiteboardCard` component (conceptual) integrates `react-sketch-canvas` for drawing functionality and `react-rnd` for positioning and resizing.

```typescript
// src/features/whiteboards/components/WhiteboardCard.tsx (Conceptual)
import React, { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ReactSketchCanvas } from 'react-sketch-canvas';

interface WhiteboardCardProps {
  whiteboard: {
    id: string;
    title: string;
    canvas_data: string; // JSON string
    position_x: number;
    position_y: number;
    width: number;
    height: number;
  };
}

const WhiteboardCard: React.FC<WhiteboardCardProps> = ({ whiteboard }) => {
  const queryClient = useQueryClient();
  const canvasRef = useRef<any>(null);

  const updateWhiteboardMutation = useMutation({
    mutationFn: (updatedWhiteboard) => axios.put(`/api/whiteboards/${whiteboard.id}`, updatedWhiteboard),
    onSuccess: () => {
      queryClient.invalidateQueries(['whiteboards']);
    },
  });

  const handleCanvasUpdate = async () => {
    if (canvasRef.current) {
      const paths = await canvasRef.current.exportPaths();
      updateWhiteboardMutation.mutate({ ...whiteboard, canvas_data: JSON.stringify({ paths }) });
    }
  };

  const handleDragStop = (e, d) => {
    updateWhiteboardMutation.mutate({ ...whiteboard, position_x: d.x, position_y: d.y });
  };

  // ... rendering logic with react-rnd for drag/resize
  return (
    <div style={{ left: whiteboard.position_x, top: whiteboard.position_y, width: whiteboard.width, height: whiteboard.height }}>
      <h3>{whiteboard.title}</h3>
      <ReactSketchCanvas
        ref={canvasRef}
        strokeWidth={4}
        strokeColor="black"
        canvasColor="#f0f0f0"
        height={whiteboard.height - 40} // Adjust for title
        width={whiteboard.width}
        onStroke={handleCanvasUpdate}
        // initialPaths={JSON.parse(whiteboard.canvas_data).paths}
      />
      <button onClick={() => canvasRef.current?.clearCanvas()}>Clear</button>
    </div>
  );
};

export default WhiteboardCard;
```

## Canvas View Integration

Whiteboards are first-class citizens on the main canvas, allowing users to freely position, resize, and draw within them. The `react-rnd` library facilitates the drag-and-drop and resizing interactions, while `react-sketch-canvas` provides the drawing surface.

### Canvas Data Storage

The `canvas_data` column stores the drawing paths and shapes as a JSONB object. This allows for persistence of the whiteboard content across sessions.

## Future Enhancements

- **Real-time Collaboration**: Enable multiple users to draw on the same whiteboard simultaneously.
- **Shape Recognition**: Implement features to recognize drawn shapes (circles, squares, etc.) and convert them into perfect forms.
- **Image/Text Embedding**: Allow users to embed images and text boxes onto whiteboards.
- **Version History**: Maintain a history of whiteboard changes for rollback capabilities.
