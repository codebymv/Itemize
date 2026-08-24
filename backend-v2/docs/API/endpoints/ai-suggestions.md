# AI Suggestions API

## Get AI suggestions for a list

Returns a list of AI-generated suggestions for a list.

### Endpoint

```
POST /suggestions
```

### Request Body

```json
{
  "listTitle": "My List",
  "existingItems": [
    "Item 1",
    "Item 2"
  ]
}
```

### Response

```json
{
  "suggestions": [
    "Item 3",
    "Item 4",
    "Item 5"
  ]
}
```
