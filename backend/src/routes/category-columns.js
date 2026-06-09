const categoryColumnNames = [
    'id',
    'user_id',
    'name',
    'color_value',
    'created_at',
    'updated_at'
];

const qualify = (columns, alias) => columns.map(column => alias ? `${alias}.${column}` : column).join(', ');

const categoryColumns = (alias) => qualify(categoryColumnNames, alias);

module.exports = {
    categoryColumns,
    categoryColumnNames
};
