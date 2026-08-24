# lists Table

This table stores the lists created by users.

## Columns

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `SERIAL` | `PRIMARY KEY` | The unique identifier for the list. |
| `title` | `VARCHAR(255)` | `NOT NULL` | The title of the list. |
| `category` | `VARCHAR(100)` | `DEFAULT 'General'` | The category of the list. |
| `items` | `JSONB` | `DEFAULT '[]'::jsonb` | The items in the list. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | The date and time when the list was created. |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | The date and time when the list was last updated. |
| `user_id` | `INTEGER` | `FOREIGN KEY` to `users(id)` | The ID of the user who created the list. |
| `color_value` | `VARCHAR(7)` | | The color of the list. |
| `position_x` | `INTEGER` | `DEFAULT 0` | The x-position of the list on the canvas. |
| `position_y` | `INTEGER` | `DEFAULT 0` | The y-position of the list on the canvas. |
| `width` | `INTEGER` | `DEFAULT 340` | The width of the list on the canvas. |
| `height` | `INTEGER` | `DEFAULT 265` | The height of the list on the canvas. |
| `category_id` | `INTEGER` | `FOREIGN KEY` to `categories(id)` | The ID of the category that the list belongs to. |
