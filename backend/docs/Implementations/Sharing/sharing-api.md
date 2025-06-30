# Sharing API Reference

## Overview

The Sharing API provides endpoints for enabling, managing, and accessing shared content in itemize.cloud. All sharing operations use token-based authentication for the owner and public access for shared content.

## Authentication

- **Owner Operations**: Require JWT authentication
- **Public Access**: No authentication required for viewing shared content
- **Rate Limiting**: Public endpoints include rate limiting protection

## Share Content Endpoints

### Share a List

Enable sharing for a list and get the share URL.

**Endpoint:** `POST /api/lists/:listId/share`

**Authentication:** Required (JWT)

**Parameters:**
- `listId` (path): The ID of the list to share

**Response:**
```json
{
  "shareToken": "550e8400-e29b-41d4-a716-446655440000",
  "shareUrl": "https://itemize.cloud/shared/list/550e8400-e29b-41d4-a716-446655440000"
}
```

**Status Codes:**
- `200 OK`: Share link created or retrieved successfully
- `404 Not Found`: List not found or access denied
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

### Share a Note

Enable sharing for a note and get the share URL.

**Endpoint:** `POST /api/notes/:noteId/share`

**Authentication:** Required (JWT)

**Parameters:**
- `noteId` (path): The ID of the note to share

**Response:**
```json
{
  "shareToken": "550e8400-e29b-41d4-a716-446655440001",
  "shareUrl": "https://itemize.cloud/shared/note/550e8400-e29b-41d4-a716-446655440001"
}
```

### Share a Whiteboard

Enable sharing for a whiteboard and get the share URL.

**Endpoint:** `POST /api/whiteboards/:whiteboardId/share`

**Authentication:** Required (JWT)

**Parameters:**
- `whiteboardId` (path): The ID of the whiteboard to share

**Response:**
```json
{
  "shareToken": "550e8400-e29b-41d4-a716-446655440002",
  "shareUrl": "https://itemize.cloud/shared/whiteboard/550e8400-e29b-41d4-a716-446655440002"
}
```

## Revoke Sharing Endpoints

### Revoke List Sharing

Disable sharing for a list (keeps token but makes content inaccessible).

**Endpoint:** `DELETE /api/lists/:listId/share`

**Authentication:** Required (JWT)

**Parameters:**
- `listId` (path): The ID of the list to unshare

**Response:**
```json
{
  "message": "List sharing revoked successfully"
}
```

### Revoke Note Sharing

**Endpoint:** `DELETE /api/notes/:noteId/share`

### Revoke Whiteboard Sharing

**Endpoint:** `DELETE /api/whiteboards/:whiteboardId/share`

## Public Access Endpoints

### Get Shared List

Retrieve a shared list by its token (public access).

**Endpoint:** `GET /api/shared/list/:token`

**Authentication:** None (public endpoint)

**Rate Limiting:** Applied

**Parameters:**
- `token` (path): The share token for the list

**Response:**
```json
{
  "id": "123",
  "title": "My Shared List",
  "category": "Work",
  "items": [
    {
      "id": "1",
      "text": "Task 1",
      "completed": false
    }
  ],
  "color_value": "#3B82F6",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T12:00:00Z",
  "creator_name": "John Doe"
}
```

**Status Codes:**
- `200 OK`: Shared content retrieved successfully
- `404 Not Found`: Shared content not found or no longer available
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

### Get Shared Note

**Endpoint:** `GET /api/shared/note/:token`

**Response:**
```json
{
  "id": "456",
  "title": "My Shared Note",
  "content": "This is the note content...",
  "category": "Personal",
  "color_value": "#10B981",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T12:00:00Z",
  "creator_name": "Jane Smith"
}
```

### Get Shared Whiteboard

**Endpoint:** `GET /api/shared/whiteboard/:token`

**Response:**
```json
{
  "id": "789",
  "title": "My Shared Whiteboard",
  "category": "Design",
  "canvas_data": "...", 
  "canvas_width": 800,
  "canvas_height": 600,
  "background_color": "#FFFFFF",
  "color_value": "#EF4444",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T12:00:00Z",
  "creator_name": "Bob Wilson"
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message description"
}
```

Common error scenarios:
- **404 Not Found**: Content doesn't exist or user lacks access
- **401 Unauthorized**: Authentication required but not provided
- **403 Forbidden**: Valid authentication but insufficient permissions
- **429 Too Many Requests**: Rate limit exceeded (public endpoints)
- **500 Internal Server Error**: Unexpected server error

## Implementation Notes

### Token Management
- Tokens are generated using `crypto.randomUUID()`
- Tokens persist even when sharing is disabled
- Re-enabling sharing uses the existing token

### Security Features
- Public endpoints include rate limiting
- Path validation prevents directory traversal
- Creator information is limited to name only
- No sensitive user data exposed in public endpoints

### Frontend Integration
- Share URLs are automatically generated based on environment
- Development uses `localhost:5173`, production uses `itemize.cloud`
- Share modals automatically generate links when opened
