const LIST_COLUMNS = [
    'id',
    'title',
    'category',
    'type',
    'items',
    'user_id',
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

const listColumns = () => LIST_COLUMNS.join(', ');

module.exports = {
    listColumns
};
