const wireframeColumnNames = [
  'id',
  'user_id',
  'title',
  'category',
  'flow_data',
  'position_x',
  'position_y',
  'z_index',
  'color_value',
  'share_token',
  'is_public',
  'shared_at',
  'created_at',
  'updated_at',
  'width',
  'height'
];

const qualify = (columns, alias) => columns.map(column => alias ? `${alias}.${column}` : column).join(', ');

const wireframeColumns = (alias) => qualify(wireframeColumnNames, alias);

module.exports = {
  wireframeColumns,
  wireframeColumnNames
};
