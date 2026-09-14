async function runAdminMfaMigration(pool) {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_valid_after TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
      reauthenticated_at TIMESTAMPTZ,
      admin_verified_at TIMESTAMPTZ, recovery_until TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE TABLE IF NOT EXISTS admin_mfa (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret TEXT, enabled_at TIMESTAMPTZ, last_step BIGINT,
      pending_secret TEXT, pending_session UUID, pending_until TIMESTAMPTZ,
      failed_attempts INTEGER NOT NULL DEFAULT 0, attempt_window TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS admin_mfa_recovery_codes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL, consumed_at TIMESTAMPTZ,
      PRIMARY KEY(user_id,code_hash)
    );
    CREATE TABLE IF NOT EXISTS admin_mfa_audit (
      id BIGSERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE OR REPLACE FUNCTION invalidate_auth_on_security_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.password_hash IS DISTINCT FROM OLD.password_hash
        OR NEW.role IS DISTINCT FROM OLD.role
        OR NEW.account_deletion_scheduled_at IS DISTINCT FROM OLD.account_deletion_scheduled_at THEN
        NEW.auth_valid_after = clock_timestamp();
        UPDATE auth_sessions SET revoked_at=clock_timestamp(),admin_verified_at=NULL,recovery_until=NULL
          WHERE user_id=NEW.id AND revoked_at IS NULL;
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS users_revoke_auth ON users;
    CREATE TRIGGER users_revoke_auth BEFORE UPDATE ON users FOR EACH ROW
      EXECUTE FUNCTION invalidate_auth_on_security_change();
  `);
  return true;
}
module.exports = { runAdminMfaMigration };
