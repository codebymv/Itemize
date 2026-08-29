async function runEmailTemplateVersionsMigration(pool) {
  await pool.query(`
    ALTER TABLE email_templates
      ADD COLUMN IF NOT EXISTS preheader VARCHAR(255),
      ADD COLUMN IF NOT EXISTS draft_version_id BIGINT,
      ADD COLUMN IF NOT EXISTS published_version_id BIGINT;

    CREATE TABLE IF NOT EXISTS email_template_versions (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL CHECK (version_number > 0),
      state VARCHAR(16) NOT NULL CHECK (state IN ('draft', 'published')),
      subject VARCHAR(500) NOT NULL,
      preheader VARCHAR(255),
      body_html TEXT NOT NULL,
      body_text TEXT,
      variables JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TIMESTAMP WITH TIME ZONE,
      UNIQUE(template_id, version_number)
    );

    ALTER TABLE email_template_versions
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_templates_draft_version_fk') THEN
        ALTER TABLE email_templates
          ADD CONSTRAINT email_templates_draft_version_fk
          FOREIGN KEY (draft_version_id) REFERENCES email_template_versions(id) ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_templates_published_version_fk') THEN
        ALTER TABLE email_templates
          ADD CONSTRAINT email_templates_published_version_fk
          FOREIGN KEY (published_version_id) REFERENCES email_template_versions(id) ON DELETE SET NULL;
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_template_versions_one_draft
      ON email_template_versions(template_id) WHERE state = 'draft';
    CREATE INDEX IF NOT EXISTS idx_email_template_versions_org_template
      ON email_template_versions(organization_id, template_id, version_number DESC);

    INSERT INTO email_template_versions (
      organization_id, template_id, version_number, state, subject, preheader,
      body_html, body_text, variables, is_active, created_by, created_at, updated_at, published_at
    )
    SELECT et.organization_id, et.id, 1, 'published', et.subject, et.preheader,
      et.body_html, et.body_text, COALESCE(et.variables, '[]'::jsonb),
      COALESCE(et.is_active, TRUE), existing_user.id,
      COALESCE(et.created_at, CURRENT_TIMESTAMP),
      COALESCE(et.updated_at, et.created_at, CURRENT_TIMESTAMP),
      COALESCE(et.updated_at, et.created_at, CURRENT_TIMESTAMP)
    FROM email_templates et
    -- Some pre-organization production rows are intentionally tenantless. They are
    -- not reachable through organization-scoped APIs, so do not invent ownership.
    JOIN organizations existing_organization ON existing_organization.id = et.organization_id
    LEFT JOIN users existing_user ON existing_user.id = et.created_by
    WHERE NOT EXISTS (
      SELECT 1 FROM email_template_versions version WHERE version.template_id = et.id
    )
    ON CONFLICT (template_id, version_number) DO NOTHING;

    UPDATE email_templates template
    SET published_version_id = version.id
    FROM email_template_versions version
    WHERE version.template_id = template.id
      AND version.organization_id = template.organization_id
      AND version.state = 'published'
      AND template.published_version_id IS NULL
      AND version.version_number = (
        SELECT MAX(candidate.version_number)
        FROM email_template_versions candidate
        WHERE candidate.template_id = template.id AND candidate.state = 'published'
      );
  `);
  return true;
}

module.exports = { runEmailTemplateVersionsMigration };
