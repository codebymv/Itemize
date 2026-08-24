# Whiteboards API

## Get all whiteboards

Returns a list of all the whiteboards that the user has access to.

### Endpoint

```
GET /whiteboards
```

### Response

```json
[
  {
    "id": "1",
    "title": "My Whiteboard",
    "createdAt": "2025-06-29T12:00:00.000Z",
    "updatedAt": "2025-06-29T12:00:00.000Z"
  }
]
```

## Create a new whiteboard

Creates a new whiteboard.

### Endpoint

```
POST /whiteboards
```

### Request Body

```json
{
  "title": "My New Whiteboard"
}
```

### Response

```json
{
  "id": "2",
  "title": "My New Whiteboard",
  "createdAt": "2025-06-29T12:00:00.000Z",
  "updatedAt": "2025-06-29T12:00:00.000Z"
}
```

## Update a specific whiteboard

Updates a specific whiteboard.

### Endpoint

```
PUT /whiteboards/{whiteboardId}
```

### Request Body

```json
{
  "title": "My Updated Whiteboard"
}
```

### Response

```json
{
  "id": "1",
  "title": "My Updated Whiteboard",
  "createdAt": "2025-06-29T12:00:00.000Z",
  "updatedAt": "2025-06-29T12:00:00.000Z"
}
```

## Delete a specific whiteboard

Deletes a specific whiteboard.

### Endpoint

```
DELETE /whiteboards/{whiteboardId}
```

### Response

```json
{
  "message": "Whiteboard deleted successfully"
}
```

## Share a whiteboard

Enables sharing for a whiteboard and returns the share URL.

### Endpoint

```
POST /whiteboards/{whiteboardId}/share
```

### Authentication

Required (JWT token)

### Response

```json
{
  "shareToken": "550e8400-e29b-41d4-a716-446655440002",
  "shareUrl": "https://itemize.cloud/shared/whiteboard/550e8400-e29b-41d4-a716-446655440002"
}
```

## Revoke whiteboard sharing

Disables sharing for a whiteboard.

### Endpoint

```
DELETE /whiteboards/{whiteboardId}/share
```

### Authentication

Required (JWT token)

### Response

```json
{
  "message": "Whiteboard sharing revoked successfully"
}
```

## Get shared whiteboard (public)

Retrieves a shared whiteboard by its token. No authentication required.

### Endpoint

```
GET /shared/whiteboard/{token}
```

### Rate Limiting

Applied to prevent abuse

### Response

```json
{
  "id": "1",
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
