# AI suggestions GraphQL API

Authenticated workspace list and note suggestions are served by the Nest GraphQL API. Both mutations require the session cookie and matching CSRF header.

## List suggestions

```graphql
mutation ListSuggestions($input: ListSuggestionsInput!) {
  listSuggestions(input: $input) {
    suggestions
    cached
    error
  }
}
```

```json
{
  "input": {
    "listTitle": "Product launch checklist",
    "existingItems": ["Confirm pricing", "Publish landing page"]
  }
}
```

## Note suggestions

```graphql
mutation NoteSuggestions($input: NoteSuggestionsInput!) {
  noteSuggestions(input: $input) {
    suggestions
    cached
    error
  }
}
```

```json
{
  "input": {
    "content": "The customer approved the proposal."
  }
}
```

The stable payload always contains `suggestions`. Provider failures return an empty array and a client-safe `error`; authentication, CSRF, validation, and rate-limit failures use GraphQL errors. Successful results may return `cached: true`.
