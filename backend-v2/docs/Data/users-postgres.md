# users Table

This table stores information about the users of the application.

## Columns

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `SERIAL` | `PRIMARY KEY` | The unique identifier for the user. |
| `email` | `VARCHAR(255)` | `UNIQUE`, `NOT NULL` | The user's email address. |
| `name` | `VARCHAR(255)` | `NOT NULL` | The user's name. |
| `avatar_url` | `TEXT` | | The URL of the user's avatar. |
| `provider` | `VARCHAR(50)` | `NOT NULL` | The OAuth provider used by the user (e.g., 'google'). |
| `provider_id` | `VARCHAR(255)` | `NOT NULL` | The user's ID from the OAuth provider. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | The date and time when the user was created. |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | The date and time when the user was last updated. |
