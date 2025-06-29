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