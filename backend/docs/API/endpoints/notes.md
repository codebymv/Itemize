# Notes API

## Get all notes

Returns a list of all the notes that the user has access to.

### Endpoint

```
GET /notes
```

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
