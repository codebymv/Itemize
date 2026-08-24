/**
 * Canonical contact-email storage without universal contact uniqueness.
 *
 * Duplicate and email-less contacts remain legal. The database normalizes all
 * retained and future writers so organization-scoped resolution and recipient
 * deduplication operate on one stable representation.
 */
async function runCanonicalContactEmailIdentityMigration(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('LOCK TABLE contacts IN SHARE ROW EXCLUSIVE MODE');

        await client.query(`
            DROP TRIGGER IF EXISTS contacts_normalize_email ON contacts
        `);
        await client.query(`
            ALTER TABLE contacts
            DROP CONSTRAINT IF EXISTS contacts_email_canonical
        `);

        await client.query(`
            UPDATE contacts
            SET email = lower(NULLIF(btrim(email), ''))
            WHERE email IS DISTINCT FROM lower(NULLIF(btrim(email), ''))
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_normalize_contact_email()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                NEW.email := lower(NULLIF(btrim(NEW.email), ''));
                RETURN NEW;
            END
            $$
        `);
        await client.query(`
            CREATE TRIGGER contacts_normalize_email
            BEFORE INSERT OR UPDATE OF email ON contacts
            FOR EACH ROW EXECUTE FUNCTION itemize_normalize_contact_email()
        `);

        await client.query(`
            ALTER TABLE contacts
            ADD CONSTRAINT contacts_email_canonical
            CHECK (
                email IS NULL
                OR (
                    email <> ''
                    AND email = lower(btrim(email))
                )
            )
        `);

        await client.query('DROP INDEX IF EXISTS idx_contacts_org_email');
        await client.query(`
            CREATE INDEX idx_contacts_org_email
            ON contacts (organization_id, email, id)
            WHERE email IS NOT NULL
        `);

        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    runCanonicalContactEmailIdentityMigration,
};
