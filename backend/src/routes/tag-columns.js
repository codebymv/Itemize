const tagColumnNames = [
  'id',
  'organization_id',
  'name',
  'color',
  'created_at'
];

const qualify = (columns, alias) => columns.map(column => alias ? `${alias}.${column}` : column).join(', ');

const tagColumns = (alias) => qualify(tagColumnNames, alias);

module.exports = {
  tagColumns,
  tagColumnNames
};
