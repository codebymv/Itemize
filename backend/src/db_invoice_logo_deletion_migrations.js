async function runInvoiceLogoDeletionMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_logo_deletion_jobs (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
      scope VARCHAR(16) NOT NULL CHECK (scope IN ('business', 'settings')),
      resource_id INTEGER,
      logo_url TEXT NOT NULL CHECK (length(logo_url) BETWEEN 1 AND 2048),
      status VARCHAR(16) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'retry', 'deleted', 'dead_letter')),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      claimed_by VARCHAR(255),
      last_error TEXT,
      deleted_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT invoice_logo_deletion_scope_resource CHECK (
        (scope = 'settings' AND resource_id IS NULL) OR
        (scope = 'business' AND resource_id IS NOT NULL)
      ),
      CONSTRAINT invoice_logo_deletion_identity
        UNIQUE (organization_id, logo_url)
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_logo_deletion_jobs_claim
      ON invoice_logo_deletion_jobs(status, next_attempt_at, created_at)
      WHERE status IN ('queued', 'processing', 'retry');
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_invoice_logo_deletion_tenant()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $tenant$
    BEGIN
      IF NEW.scope = 'business' AND NOT EXISTS (
        SELECT 1 FROM businesses business
        WHERE business.id = NEW.resource_id
          AND business.organization_id = NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'Logo deletion must share its business organization'
          USING ERRCODE = '23514',
                CONSTRAINT = 'invoice_logo_deletion_tenant';
      END IF;
      RETURN NEW;
    END
    $tenant$;

    DROP TRIGGER IF EXISTS invoice_logo_deletion_tenant
      ON invoice_logo_deletion_jobs;
    CREATE TRIGGER invoice_logo_deletion_tenant
      BEFORE INSERT OR UPDATE OF organization_id, scope, resource_id
      ON invoice_logo_deletion_jobs
      FOR EACH ROW
      EXECUTE FUNCTION enforce_invoice_logo_deletion_tenant();
  `);

  return true;
}

module.exports = { runInvoiceLogoDeletionMigration };
