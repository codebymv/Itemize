# Lists API

## Get all lists

Returns a list of all the lists that the user has access to.

### Endpoint

```
GET /lists
```

### Response

```json
[
  {
    "id": "1",
    "name": "My List",
    "createdAt": "2025-06-29T12:00:00.000Z",
    "updatedAt": "2025-06-29T12:00:00.000Z"
  }
]
```

## Create a new list

Creates a new list.

### Endpoint

```
POST /lists
```

### Request Body

```json
{
  "name": "My New List"
}
```

### Response

```json
{
  "id": "2",
  "name": "My New List",
  "createdAt": "2025-06-29T12:00:00.000Z",
  "updatedAt": "2025-06-29T12:00:00.000Z"
}
```

## Get a specific list

Returns a specific list.

### Endpoint

```
GET /lists/{listId}
```

### Response

```json
{
  "id": "1",
  "name": "My List",
  "createdAt": "2025-06-29T12:00:00.000Z",
  "updatedAt": "2025-06-29T12:00:00.000Z"
}
```

## Update a specific list

Updates a specific list.

### Endpoint

```
PUT /lists/{listId}
```

### Request Body

```json
{
  "name": "My Updated List"
}
```

### Response

```json
{
  "id": "1",
  "name": "My Updated List",
  "createdAt": "2025-06-29T12:00:00.000Z",
  "updatedAt": "2025-06-29T12:00:00.000Z"
}
```

## Delete a specific list

Deletes a specific list.

### Endpoint

```
DELETE /lists/{listId}
```

### Response

```json
{
  "message": "List deleted successfully"
}
```

## Get all lists for canvas view

Returns a list of all the lists that the user has access to, with their positions for the canvas view.

### Endpoint

```
GET /canvas/lists
```

### Response

```json
[
  {
    "id": "1",
    "name": "My List",
    "position_x": 100,
    "position_y": 200,
    "createdAt": "2025-06-29T12:00:00.000Z",
    "updatedAt": "2025-06-29T12:00:00.000Z"
  }
]
```

## Update list position for canvas view

Updates the position of a list for the canvas view.

### Endpoint

```
PUT /lists/{listId}/position
```

### Request Body

```json
{
  "x": 150,
  "y": 250
}
```

### Response

```json
{
  "id": "1",
  "name": "My List",
  "position_x": 150,
  "position_y": 250,
  "createdAt": "2025-06-29T12:00:00.000Z",
  "updatedAt": "2025-06-29T12:00:00.000Z"
}
```

## Share a list

Enables sharing for a list and returns the share URL.

### Endpoint

```
POST /lists/{listId}/share
```

### Authentication

Required (JWT token)

### Response

```json
{
  "shareToken": "550e8400-e29b-41d4-a716-446655440000",
  "shareUrl": "https://itemize.cloud/shared/list/550e8400-e29b-41d4-a716-446655440000"
}
```

## Revoke list sharing

Disables sharing for a list.

### Endpoint

```
DELETE /lists/{listId}/share
```

### Authentication

Required (JWT token)

### Response

```json
{
  "message": "List sharing revoked successfully"
}
```

## Get shared list (public)

Retrieves a shared list by its token. No authentication required.

### Endpoint

```
GET /shared/list/{token}
```

### Rate Limiting

Applied to prevent abuse

### Response

```json
{
  "id": "1",
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