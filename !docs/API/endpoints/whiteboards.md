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
