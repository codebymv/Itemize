const { contactColumns } = require('./template-columns');

const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const SEGMENT_COLUMNS = [
    'id',
    'organization_id',
    'name',
    'description',
    'color',
    'icon',
    'filter_type',
    'filters',
    'segment_type',
    'static_contact_ids',
    'contact_count',
    'last_calculated_at',
    'is_active',
    'used_in_campaigns',
    'used_in_automations',
    'created_by',
    'created_at',
    'updated_at'
];

const SEGMENT_HISTORY_COLUMNS = [
    'id',
    'segment_id',
    'organization_id',
    'contact_count',
    'calculated_at',
    'contacts_added',
    'contacts_removed',
    'created_at'
];

const segmentColumns = (alias) => alias ? qualify(SEGMENT_COLUMNS, alias) : SEGMENT_COLUMNS.join(', ');
const segmentHistoryColumns = (alias) => alias ? qualify(SEGMENT_HISTORY_COLUMNS, alias) : SEGMENT_HISTORY_COLUMNS.join(', ');

module.exports = {
    contactColumns,
    segmentColumns,
    segmentHistoryColumns
};
