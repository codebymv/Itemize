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

module.exports = { runOrganizationOwnerInvariantMigration };
