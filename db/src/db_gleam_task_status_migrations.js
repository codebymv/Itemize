const runGleamTaskStatusMigration = async (pool) => {
  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_client_task_version() RETURNS trigger AS $$
    BEGIN
      IF ROW(NEW.status,NEW.completed_at,NEW.title,NEW.description,NEW.priority,NEW.due_date,NEW.assigned_to,NEW.contact_id)
        IS DISTINCT FROM ROW(OLD.status,OLD.completed_at,OLD.title,OLD.description,OLD.priority,OLD.due_date,OLD.assigned_to,OLD.contact_id) THEN
        NEW.version := GREATEST(NEW.version,OLD.version+1);
        NEW.updated_at := NOW();
      ELSE
        NEW.version := GREATEST(NEW.version,OLD.version);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS client_task_version_guard ON tasks;
    CREATE TRIGGER client_task_version_guard BEFORE UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION enforce_client_task_version();
  `);
};
module.exports = { runGleamTaskStatusMigration };
