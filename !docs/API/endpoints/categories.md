# Categories API

## Get all categories

Returns a list of all the categories that the user has access to.

### Endpoint

```
GET /api/categories
```

### Response

```json
[
  {
    "id": 1,
    "name": "My Category",
    "color_value": "#ff0000",
    "created_at": "2026-07-18T12:00:00.000Z",
    "updated_at": "2026-07-18T12:00:00.000Z"
  }
]
```

## Create a new category

Creates a new category.

### Endpoint

```
POST /api/categories
```

### Request Body

```json
{
  "name": "My New Category",
  "color_value": "#00ff00"
}
```

### Response

```json
{
  "id": 2,
  "name": "My New Category",
  "color_value": "#00ff00"
}
```

## Update a specific category

Updates a specific category.

### Endpoint

```
PUT /api/categories/{categoryId}
```

### Request Body

```json
{
  "name": "My Updated Category",
  "color_value": "#0000ff"
}
```

### Response

```json
{
  "id": 1,
  "name": "My Updated Category",
  "color_value": "#0000ff"
}
```

## Delete a specific category

Deletes a specific category.

### Endpoint

```
DELETE /api/categories/{categoryId}
```

### Response

```json
{
  "message": "Category deleted successfully"
}
```

The legacy routes remain available during the GraphQL cutover. The target
schema and deliberate invariant fixes are frozen in
[Categories GraphQL cutover contract](../contracts/categories-graphql-cutover.md).
