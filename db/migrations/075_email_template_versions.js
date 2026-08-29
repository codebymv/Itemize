const {
  runEmailTemplateVersionsMigration,
} = require('../src/db_email_template_versions_migrations');

exports.up = runEmailTemplateVersionsMigration;

exports.down = async function down(pool) {
  await pool.query(`
    ALTER TABLE email_templates
      DROP COLUMN IF EXISTS draft_version_id,
      DROP COLUMN IF EXISTS published_version_id,
      DROP COLUMN IF EXISTS preheader;
    DROP TABLE IF EXISTS email_template_versions;
  `);
};
