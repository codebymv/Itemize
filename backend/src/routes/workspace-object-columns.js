const NOTE_COLUMNS = [
    'id',
    'user_id',
    'title',
    'content',
    'category',
    'color_value',
    'position_x',
    'position_y',
    'width',
    'height',
    'z_index',
    'share_token',
    'is_public',
    'shared_at',
    'category_id',
    'contact_id',
    'organization_id',
    'created_at',
    'updated_at'
];

const WHITEBOARD_COLUMNS = [
    'id',
    'user_id',
    'title',
    'category',
    'canvas_data',
    'canvas_width',
    'canvas_height',
    'background_color',
    'position_x',
    'position_y',
    'z_index',
    'color_value',
    'share_token',
    'is_public',
    'shared_at',
    'contact_id',
    'organization_id',
    'created_at',
    'updated_at'
];

const noteColumns = (alias) => alias ? NOTE_COLUMNS.map(column => `${alias}.${column}`).join(', ') : NOTE_COLUMNS.join(', ');
const whiteboardColumns = (alias) => alias ? WHITEBOARD_COLUMNS.map(column => `${alias}.${column}`).join(', ') : WHITEBOARD_COLUMNS.join(', ');

module.exports = {
    noteColumns,
    whiteboardColumns
};
