const runGleamNotificationMigration = async pool => {
  await pool.query(`CREATE TABLE IF NOT EXISTS gleam_handoff_notifications (
    connection_id UUID NOT NULL REFERENCES gleam_connections(id) ON DELETE CASCADE,
    handoff_id VARCHAR(128) NOT NULL,
    receipt JSONB NOT NULL,
    PRIMARY KEY(connection_id,handoff_id)
  )`);
};
module.exports = { runGleamNotificationMigration };
