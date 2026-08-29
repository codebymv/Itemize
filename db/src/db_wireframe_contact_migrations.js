const runWireframeContactMigration = async (pool) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE wireframes
      ADD COLUMN IF NOT EXISTS contact_id INTEGER;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'wireframes_contact_id_fkey'
            AND conrelid = 'wireframes'::regclass
        ) THEN
          ALTER TABLE wireframes
          ADD CONSTRAINT wireframes_contact_id_fkey
          FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wireframes_contact_id
      ON wireframes(contact_id);
    `);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Wireframe contact migration failed:', error.message);
    return false;
  } finally {
    client.release();
  }
};

module.exports = { runWireframeContactMigration };
