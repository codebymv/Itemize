# Categories API

## Get all categories

Returns a list of all the categories that the user has access to.

### Endpoint

```
GET /categories
```

### Response

```json
[
  {
    "id": "1",
    "name": "My Category",
    "color": "#ff0000"
  }
]
```

## Create a new category

Creates a new category.

### Endpoint

```
POST /categories
```

### Request Body

```json
{
  "name": "My New Category",
  "color": "#00ff00"
}
```

### Response

```json
{
  "id": "2",
  "name": "My New Category",
  "color": "#00ff00"
}
```

## Update a specific category

Updates a specific category.

### Endpoint

```
PUT /categories/{categoryId}
```

### Request Body

```json
{
  "name": "My Updated Category",
  "color": "#0000ff"
}
```

### Response

```json
{
  "id": "1",
  "name": "My Updated Category",
  "color": "#0000ff"
}
```

## Delete a specific category

Deletes a specific category.

### Endpoint

```
DELETE /categories/{categoryId}
```

### Response

```json
{
  "message": "Category deleted successfully"
}
```
