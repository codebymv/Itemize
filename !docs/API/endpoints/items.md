# Items API

## Get all items in a list

Returns a list of all the items in a specific list.

### Endpoint

```
GET /lists/{listId}/items
```

### Response

```json
[
  {
    "id": "1",
    "name": "My Item",
    "createdAt": "2025-06-29T12:00:00.000Z",
    "updatedAt": "2025-06-29T12:00:00.000Z"
  }
]
```

## Add a new item to a list

Adds a new item to a specific list.

### Endpoint

```
POST /lists/{listId}/items
```

### Request Body

```json
{
  "name": "My New Item"
}
```

### Response

```json
{
  "id": "2",
  "name": "My New Item",
  "createdAt": "2025-06-29T12:00:00.000Z",
  "updatedAt": "2025-06-29T12:00:00.000Z"
}
```

## Update an item in a list

Updates an item in a specific list.

### Endpoint

```
PUT /lists/{listId}/items/{itemId}
```

### Request Body

```json
{
  "name": "My Updated Item"
}
```

### Response

```json
{
  "id": "1",
  "name": "My Updated Item",
  "createdAt": "2025-06-29T12:00:00.000Z",
  "updatedAt": "2025-06-29T12:00:00.000Z"
}
```

## Delete an item from a list

Deletes an item from a specific list.

### Endpoint

```
DELETE /lists/{listId}/items/{itemId}
```

### Response

```json
{
  "message": "Item deleted successfully"
}
```
