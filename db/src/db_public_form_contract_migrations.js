async function runPublicFormContractMigration(pool) {
    await pool.query('BEGIN');
    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
        await pool.query('LOCK TABLE forms IN SHARE ROW EXCLUSIVE MODE');
        await pool.query('LOCK TABLE form_fields IN SHARE ROW EXCLUSIVE MODE');
        await pool.query('LOCK TABLE form_submissions IN SHARE ROW EXCLUSIVE MODE');

        await pool.query(`
            UPDATE form_fields
            SET field_type = 'phone'
            WHERE field_type = 'tel'
        `);

        await pool.query(`
            ALTER TABLE forms
            ADD COLUMN IF NOT EXISTS public_id VARCHAR(36)
        `);
        await pool.query(`
            UPDATE forms
            SET public_id = 'frm_' || encode(gen_random_bytes(16), 'hex')
            WHERE public_id IS NULL
               OR public_id !~ '^frm_[a-f0-9]{32}$'
        `);
        await pool.query(`
            ALTER TABLE forms
            ALTER COLUMN public_id
            SET DEFAULT ('frm_' || encode(gen_random_bytes(16), 'hex'))
        `);
        await pool.query(`
            ALTER TABLE forms
            ALTER COLUMN public_id SET NOT NULL
        `);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_public_id
            ON forms(public_id)
        `);
        await pool.query(`
            ALTER TABLE forms
            DROP CONSTRAINT IF EXISTS forms_public_id_format
        `);
        await pool.query(`
            ALTER TABLE forms
            ADD CONSTRAINT forms_public_id_format
            CHECK (public_id ~ '^frm_[a-f0-9]{32}$')
        `);

        await pool.query(`
            UPDATE forms
            SET redirect_url = NULL
            WHERE redirect_url IS NOT NULL
              AND (
                length(redirect_url) > 500
                OR redirect_url !~ '^https?://[^[:space:]]+$'
                OR redirect_url ~ '^https?://[^/[:space:]]*@'
              )
        `);
        await pool.query(`
            UPDATE forms AS form
            SET notification_emails = ARRAY(
                SELECT email
                FROM (
                    SELECT DISTINCT lower(btrim(raw_email)) AS email
                    FROM unnest(COALESCE(form.notification_emails, ARRAY[]::text[])) AS raw(raw_email)
                    WHERE length(btrim(raw_email)) BETWEEN 3 AND 254
                      AND btrim(raw_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
                ) normalized
                ORDER BY email
                LIMIT 20
            )
        `);
        await pool.query(`
            ALTER TABLE forms
            DROP CONSTRAINT IF EXISTS forms_notification_email_limit
        `);
        await pool.query(`
            ALTER TABLE forms
            ADD CONSTRAINT forms_notification_email_limit
            CHECK (cardinality(notification_emails) <= 20)
        `);
        await pool.query(`
            ALTER TABLE forms
            DROP CONSTRAINT IF EXISTS forms_redirect_url_safe
        `);
        await pool.query(`
            ALTER TABLE forms
            ADD CONSTRAINT forms_redirect_url_safe
            CHECK (
                redirect_url IS NULL
                OR (
                    length(redirect_url) <= 500
                    AND redirect_url ~ '^https?://[^[:space:]]+$'
                    AND redirect_url !~ '^https?://[^/[:space:]]*@'
                )
            )
        `);

        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'forms'::regclass
                      AND conname = 'forms_id_organization_unique'
                ) THEN
                    ALTER TABLE forms
                    ADD CONSTRAINT forms_id_organization_unique
                    UNIQUE (id, organization_id);
                END IF;
            END
            $$
        `);
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'contacts'::regclass
                      AND conname = 'contacts_id_organization_unique'
                ) THEN
                    ALTER TABLE contacts
                    ADD CONSTRAINT contacts_id_organization_unique
                    UNIQUE (id, organization_id);
                END IF;
            END
            $$
        `);

        await pool.query(`
            UPDATE form_submissions submission
            SET organization_id = form.organization_id
            FROM forms form
            WHERE submission.form_id = form.id
              AND submission.organization_id <> form.organization_id
        `);
        await pool.query(`
            UPDATE form_submissions submission
            SET contact_id = NULL
            WHERE contact_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM contacts contact
                WHERE contact.id = submission.contact_id
                  AND contact.organization_id = submission.organization_id
              )
        `);

        await pool.query(`
            ALTER TABLE form_submissions
            DROP CONSTRAINT IF EXISTS form_submissions_form_organization_fkey
        `);
        await pool.query(`
            ALTER TABLE form_submissions
            ADD CONSTRAINT form_submissions_form_organization_fkey
            FOREIGN KEY (form_id, organization_id)
            REFERENCES forms(id, organization_id)
            ON DELETE CASCADE
        `);
        await pool.query(`
            ALTER TABLE form_submissions
            DROP CONSTRAINT IF EXISTS form_submissions_contact_organization_fkey
        `);
        await pool.query(`
            ALTER TABLE form_submissions
            ADD CONSTRAINT form_submissions_contact_organization_fkey
            FOREIGN KEY (contact_id, organization_id)
            REFERENCES contacts(id, organization_id)
            ON DELETE SET NULL (contact_id)
        `);
        await pool.query(`
            ALTER TABLE form_submissions
            DROP CONSTRAINT IF EXISTS form_submissions_data_object
        `);
        await pool.query(`
            ALTER TABLE form_submissions
            ADD CONSTRAINT form_submissions_data_object
            CHECK (jsonb_typeof(data) = 'object')
        `);

        await pool.query('COMMIT');
        return true;
    } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
    }
}

module.exports = { runPublicFormContractMigration };
