const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const PIPELINE_COLUMNS = [
  'id',
  'organization_id',
  'name',
  'description',
  'stages',
  'is_default',
  'created_by',
  'created_at',
  'updated_at'
];

const DEAL_COLUMNS = [
  'id',
  'organization_id',
  'pipeline_id',
  'contact_id',
  'stage_id',
  'title',
  'value',
  'currency',
  'probability',
  'expected_close_date',
  'assigned_to',
  'created_by',
  'won_at',
  'lost_at',
  'lost_reason',
  'custom_fields',
  'tags',
  'created_at',
  'updated_at'
];

const pipelineColumns = (alias) => alias ? qualify(PIPELINE_COLUMNS, alias) : PIPELINE_COLUMNS.join(', ');
const dealColumns = (alias) => alias ? qualify(DEAL_COLUMNS, alias) : DEAL_COLUMNS.join(', ');

module.exports = {
  dealColumns,
  pipelineColumns
};
