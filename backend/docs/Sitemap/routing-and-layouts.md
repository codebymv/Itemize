# Itemize.cloud Page Routing and Layout Structure

## Frontend Routing

The Itemize.cloud frontend uses `react-router-dom` for client-side routing. The main application routes are defined in `src/App.tsx`.

### Route Structure

```
/
├── login
├── dashboard
├── lists
│   └── :listId
├── notes
│   └── :noteId
├── whiteboards
│   └── :whiteboardId
├── categories
└── settings
```

### Page Routes

#### Public Routes
- `/login`: User login and registration page.

#### Authenticated Routes
- `/dashboard`: The main user dashboard, displaying an overview of lists, notes, and whiteboards.
- `/lists`: Displays all user lists. Allows for creation, editing, and deletion of lists.
  - `/lists/:listId`: Displays a specific list and its items.
- `/notes`: Displays all user notes. Allows for creation, editing, and deletion of notes.
  - `/notes/:noteId`: Displays a specific note.
- `/whiteboards`: Displays all user whiteboards. Allows for creation, editing, and deletion of whiteboards.
  - `/whiteboards/:whiteboardId`: Displays a specific whiteboard.
- `/categories`: Manages user-defined categories for organizing lists and notes.
- `/settings`: User profile and application settings.

## Layout Structure

The application uses a common layout for authenticated users, typically including a sidebar navigation and a main content area.

### Main Layout (`src/layouts/MainLayout.tsx` - conceptual)
- **Sidebar**: Contains primary navigation links to Dashboard, Lists, Notes, Whiteboards, Categories, and Settings.
- **Header**: (Conceptual) May contain user profile, search, or other global actions.
- **Main Content Area**: Renders the content of the active route.

### Route Protection

Routes that require authentication are protected using a higher-order component or a similar mechanism that checks for a valid JWT. If a user tries to access a protected route without authentication, they are redirected to the login page.

```typescript
// Conceptual example of a protected route component
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Assuming an AuthContext

const ProtectedRoute: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
```

### Dynamic Routes

- **List Details**: `/lists/:listId`
  - `:listId` is a dynamic parameter representing the unique ID of a list.
- **Note Details**: `/notes/:noteId`
  - `:noteId` is a dynamic parameter representing the unique ID of a note.
- **Whiteboard Details**: `/whiteboards/:whiteboardId`
  - `:whiteboardId` is a dynamic parameter representing the unique ID of a whiteboard.
