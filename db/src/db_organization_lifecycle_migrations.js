const runOrganizationOwnerInvariantMigration = async (pool) => {
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT organization_id
        FROM organization_members
        WHERE role = 'owner'
        GROUP BY organization_id
        HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'organization_members contains multiple owners for one organization';
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_members_single_owner
      ON organization_members (organization_id)
      WHERE role = 'owner';
  `);
  return true;
};

const runOrganizationInvitationsMigration = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_invitations (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email VARCHAR(254) NOT NULL,
      role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
      token_hash CHAR(64) UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'revoked')),
      invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      last_sent_at TIMESTAMP WITH TIME ZONE,
      accepted_at TIMESTAMP WITH TIME ZONE,
      accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      revoked_at TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_invitations_pending_email
      ON organization_invitations (organization_id, lower(email))
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS idx_organization_invitations_org_pending
      ON organization_invitations (organization_id, expires_at)
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS idx_organization_invitations_token_hash
      ON organization_invitations (token_hash)
      WHERE token_hash IS NOT NULL;
  `);
  return true;
};

module.exports = {
  runOrganizationInvitationsMigration,
  runOrganizationOwnerInvariantMigration,
};
