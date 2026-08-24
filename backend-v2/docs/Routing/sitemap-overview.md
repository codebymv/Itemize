# Itemize.cloud Application Sitemap Overview

## Public Pages

### Home Page (`/`)
- User authentication (login/signup)
- Overview of application features

## Authenticated User Pages

### Dashboard (`/dashboard`)
- Central hub for all user content
- Quick access to lists, notes, and whiteboards

### Lists (`/lists`)
- View all user's lists
- Create new lists
- Edit and delete existing lists

### Notes (`/notes`)
- View all user's notes
- Create new notes
- Edit and delete existing notes

### Whiteboards (`/whiteboards`)
- View all user's whiteboards
- Create new whiteboards
- Edit and delete existing whiteboards

### Categories (`/categories`)
- Manage custom categories for lists and notes

### Settings (`/settings`)
- User profile management
- Account settings

## API Endpoints

### Authentication API (`/api/auth`)
- `POST /api/auth/google-login` - Google OAuth login
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/profile` - Get user profile

### Lists API (`/api/lists`)
- `GET /api/lists` - Get all lists
- `POST /api/lists` - Create a new list
- `PUT /api/lists/:id` - Update a list
- `DELETE /api/lists/:id` - Delete a list
- `GET /api/canvas/lists` - Get all lists for canvas view
- `PUT /api/lists/:id/position` - Update list position for canvas view

### Notes API (`/api/notes`)
- `GET /api/notes` - Get all notes
- `POST /api/notes` - Create a new note
- `PUT /api/notes/:noteId` - Update a note
- `DELETE /api/notes/:noteId` - Delete a note

### Whiteboards API (`/api/whiteboards`)
- `GET /api/whiteboards` - Get all whiteboards
- `POST /api/whiteboards` - Create a new whiteboard
- `PUT /api/whiteboards/:whiteboardId` - Update a whiteboard
- `DELETE /api/whiteboards/:whiteboardId` - Delete a whiteboard

### Categories API (`/api/categories`)
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create a new category
- `PUT /api/categories/:id` - Update a category
- `DELETE /api/categories/:id` - Delete a category

### AI Suggestions API (`/api/suggestions`)
- `POST /api/suggestions` - Get AI suggestions for a list

### System Endpoints
- `GET /health` - Health check
- `GET /api/health` - API health check
- `GET /docs/content` - Get documentation content
- `GET /docs/structure` - Get documentation structure
- `GET /docs/search` - Search documentation
