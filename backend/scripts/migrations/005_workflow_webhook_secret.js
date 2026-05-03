exports.up = async function up(pool) {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await pool.query(`
    ALTER TABLE workflows
    ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(128);
  `);
  await pool.query(`
    UPDATE workflows
    SET webhook_secret = encode(gen_random_bytes(32), 'hex')
    WHERE webhook_secret IS NULL;
  `);
  await pool.query(`
    ALTER TABLE workflows
    ALTER COLUMN webhook_secret SET DEFAULT encode(gen_random_bytes(32), 'hex');
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflows_webhook_secret ON workflows(webhook_secret);
  `);
};

exports.down = async function down(pool) {
  await pool.query('DROP INDEX IF EXISTS idx_workflows_webhook_secret;');
  await pool.query('ALTER TABLE workflows ALTER COLUMN webhook_secret DROP DEFAULT;');
  await pool.query('ALTER TABLE workflows DROP COLUMN IF EXISTS webhook_secret;');
};
