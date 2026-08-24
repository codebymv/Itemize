# whiteboards Table

This table stores the whiteboards created by users.

## Columns

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `SERIAL` | `PRIMARY KEY` | The unique identifier for the whiteboard. |
| `user_id` | `INTEGER` | `FOREIGN KEY` to `users(id)` | The ID of the user who created the whiteboard. |
| `title` | `VARCHAR(255)` | `NOT NULL` | The title of the whiteboard. |
| `category` | `VARCHAR(100)` | `DEFAULT 'General'` | The category of the whiteboard. |
| `canvas_data` | `JSONB` | `DEFAULT '{"paths": [], "shapes": []}'` | The data for the whiteboard canvas. |
| `canvas_width` | `INTEGER` | | The width of the whiteboard canvas. |
| `canvas_height` | `INTEGER` | | The height of the whiteboard canvas. |
| `background_color` | `VARCHAR(7)` | `DEFAULT '#FFFFFF'` | The background color of the whiteboard. |
| `position_x` | `INTEGER` | | The x-position of the whiteboard on the canvas. |
| `position_y` | `INTEGER` | | The y-position of the whiteboard on the canvas. |
| `z_index` | `INTEGER` | `DEFAULT 0` | The z-index of the whiteboard on the canvas. |
| `color_value` | `VARCHAR(7)` | `DEFAULT '#3B82F6'` | The color of the whiteboard. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | The date and time when the whiteboard was created. |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | The date and time when the whiteboard was last updated. |
