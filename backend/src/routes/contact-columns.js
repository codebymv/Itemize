const { contactColumns } = require('./template-columns');

const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const CONTACT_ACTIVITY_COLUMNS = [
  'id',
  'contact_id',
  'user_id',
  'type',
  'title',
  'content',
  'metadata',
  'created_at'
];

const contactActivityColumns = (alias) => alias ? qualify(CONTACT_ACTIVITY_COLUMNS, alias) : CONTACT_ACTIVITY_COLUMNS.join(', ');

module.exports = {
  contactActivityColumns,
  contactColumns
};
