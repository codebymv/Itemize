# categories Table

This table stores the categories created by users.

## Columns

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `SERIAL` | `PRIMARY KEY` | The unique identifier for the category. |
| `user_id` | `INTEGER` | `NOT NULL`, `FOREIGN KEY` to `users(id)` | The ID of the user who created the category. |
| `name` | `VARCHAR(100)` | `NOT NULL` | The name of the category. |
| `color_value` | `VARCHAR(7)` | `DEFAULT '#3B82F6'` | The color of the category. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | The date and time when the category was created. |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | The date and time when the category was last updated. |

## Constraints

*   `UNIQUE(user_id, name)`: Prevents a user from creating multiple categories with the same name.
