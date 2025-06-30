# Notes API

## Get all notes

Returns a list of all the notes that the user has access to.

### Endpoint

```
GET /notes
```

### Authentication

Required (JWT token)

### Response

```json
[
  {
    "id": "1",
    "title": "My Note",
    "content": "This is my note.",
    "createdAt": "2025-06-29T12:00:00.000Z",
    "updatedAt": "2025-06-29T12:00:00.000Z"
  }
]
```

## Create a new note

Creates a new note.

### Endpoint

```
POST /notes
```

### Request Body

```json
{
  "title": "My New Note",
  "content": "This is my new note."
}
```

### Response

```json
{
  "id": "2",
  "title": "My New Note",
  "content": "This is my new note.",
  "createdAt": "2025-06-29T12:00:00.000Z",
  "updatedAt": "2025-06-29T12:00:00.000Z"
}
```

## Update a specific note

Updates a specific note.

### Endpoint

```
PUT /notes/{noteId}
```

### Request Body

```json
{
  "title": "My Updated Note",
  "content": "This is my updated note."
}
```

### Response

```json
{
  "id": "1",
  "title": "My Updated Note",
  "content": "This is my updated note.",
  "createdAt": "2025-06-29T12:00:00.000Z",
  "updatedAt": "2025-06-29T12:00:00.000Z"
}
```

## Delete a specific note

Deletes a specific note.

### Endpoint

```
DELETE /notes/{noteId}
```

### Response

```json
{
  "message": "Note deleted successfully"
}
```

## Share a note

Enables sharing for a note and returns the share URL.

### Endpoint

```
POST /notes/{noteId}/share
```

### Authentication

Required (JWT token)

### Response

```json
{
  "shareToken": "550e8400-e29b-41d4-a716-446655440001",
  "shareUrl": "https://itemize.cloud/shared/note/550e8400-e29b-41d4-a716-446655440001"
}
```

## Revoke note sharing

Disables sharing for a note.

### Endpoint

```
DELETE /notes/{noteId}/share
```

### Authentication

Required (JWT token)

### Response

```json
{
  "message": "Note sharing revoked successfully"
}
```

## Get shared note (public)

Retrieves a shared note by its token. No authentication required.

### Endpoint

```
GET /shared/note/{token}
```

### Rate Limiting

Applied to prevent abuse

### Response

```json
{
  "id": "1",
  "title": "My Shared Note",
  "content": "This is the shared note content...",
  "category": "Personal",
  "color_value": "#10B981",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T12:00:00Z",
  "creator_name": "Jane Smith"
}
```
