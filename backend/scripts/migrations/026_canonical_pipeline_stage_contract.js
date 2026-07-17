const {
  runCanonicalPipelineStageModelMigration,
} = require('../../src/db_pipeline_stage_canonical_migrations');

exports.up = runCanonicalPipelineStageModelMigration;

exports.down = async function down(pool) {
  await pool.query(`
    ALTER TABLE deals
      DROP CONSTRAINT IF EXISTS deals_pipeline_organization_fk,
      DROP CONSTRAINT IF EXISTS deals_pipeline_stage_fk
  `);
  await pool.query('DROP TRIGGER IF EXISTS pipelines_prepare_canonical_stages ON pipelines');
  await pool.query('DROP TRIGGER IF EXISTS pipelines_sync_canonical_stages ON pipelines');
  await pool.query('DROP TRIGGER IF EXISTS pipeline_stages_prepare_row ON pipeline_stages');
  await pool.query('DROP TRIGGER IF EXISTS pipeline_stages_project_json ON pipeline_stages');
  await pool.query('DROP FUNCTION IF EXISTS itemize_prepare_pipeline_stages_json()');
  await pool.query('DROP FUNCTION IF EXISTS itemize_sync_pipeline_stage_rows()');
  await pool.query('DROP FUNCTION IF EXISTS itemize_prepare_pipeline_stage_row()');
  await pool.query('DROP FUNCTION IF EXISTS itemize_project_pipeline_stage_json()');
};
