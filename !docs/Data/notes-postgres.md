# notes Table

This table stores the notes created by users.

## Columns

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `SERIAL` | `PRIMARY KEY` | The unique identifier for the note. |
| `user_id` | `INTEGER` | `FOREIGN KEY` to `users(id)` | The ID of the user who created the note. |
| `title` | `VARCHAR(255)` | `NOT NULL` | The title of the note. |
| `content` | `TEXT` | `DEFAULT '''` | The content of the note. |
| `category` | `VARCHAR(100)` | `DEFAULT 'General'` | The category of the note. |
| `color_value` | `VARCHAR(7)` | `DEFAULT '#3B82F6'` | The color of the note. |
| `position_x` | `INTEGER` | | The x-position of the note on the canvas. |
| `position_y` | `INTEGER` | | The y-position of the note on the canvas. |
| `width` | `INTEGER` | | The width of the note on the canvas. |
| `height` | `INTEGER` | | The height of the note on the canvas. |
| `z_index` | `INTEGER` | `DEFAULT 0` | The z-index of the note on the canvas. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | The date and time when the note was created. |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | The date and time when the note was last updated. |
| `category_id` | `INTEGER` | `FOREIGN KEY` to `categories(id)` | The ID of the category that the note belongs to. |
