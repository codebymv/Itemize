async function runEstimatePublicCapabilityMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS estimate_public_capabilities (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
      estimate_id INTEGER NOT NULL
        REFERENCES estimates(id) ON DELETE CASCADE,
      delivery_id BIGINT NOT NULL UNIQUE
        REFERENCES estimate_email_deliveries(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      revoked_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT estimate_public_capability_token_hash
        CHECK (token_hash ~ '^[0-9a-f]{64}$')
    );

    CREATE INDEX IF NOT EXISTS idx_estimate_public_capabilities_active_token
      ON estimate_public_capabilities(token_hash)
      WHERE revoked_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_estimate_public_capabilities_estimate
      ON estimate_public_capabilities(organization_id, estimate_id, created_at DESC);
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_estimate_public_capability_tenant()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $tenant$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM estimate_email_deliveries delivery
        WHERE delivery.id = NEW.delivery_id
          AND delivery.estimate_id = NEW.estimate_id
          AND delivery.organization_id = NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'Estimate capability must share its delivery organization and estimate'
          USING ERRCODE = '23514',
                CONSTRAINT = 'estimate_public_capability_tenant';
      END IF;
      RETURN NEW;
    END
    $tenant$;

    DROP TRIGGER IF EXISTS estimate_public_capability_tenant
      ON estimate_public_capabilities;
    CREATE TRIGGER estimate_public_capability_tenant
      BEFORE INSERT OR UPDATE OF organization_id, estimate_id, delivery_id
      ON estimate_public_capabilities
      FOR EACH ROW
      EXECUTE FUNCTION enforce_estimate_public_capability_tenant();
  `);

  return true;
}

module.exports = { runEstimatePublicCapabilityMigration };
