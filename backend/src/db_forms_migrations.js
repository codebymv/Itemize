/**
 * Forms Database Migrations
 * Schema for forms, form_fields, and form_submissions
 */

/**
 * Create forms table
 */
const runFormsMigration = async (pool) => {
    console.log('Running forms table migration...');

    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS forms (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        slug VARCHAR(255) NOT NULL,
        
        -- Form settings
        type VARCHAR(20) DEFAULT 'form' CHECK (type IN ('form', 'survey', 'quiz')),
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        
        -- Submission settings
        submit_button_text VARCHAR(100) DEFAULT 'Submit',
        success_message TEXT DEFAULT 'Thank you for your submission!',
        redirect_url VARCHAR(500),
        
        -- Notifications
        notify_on_submit BOOLEAN DEFAULT TRUE,
        notification_emails TEXT[] DEFAULT '{}',
        
        -- Styling
        theme JSONB DEFAULT '{"primaryColor": "#3B82F6"}'::jsonb,
        
        -- Contact settings
        create_contact BOOLEAN DEFAULT TRUE,
        contact_tags TEXT[] DEFAULT '{}',
        
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(organization_id, slug)
      );
    `);
        console.log('✅ Forms table created');

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_forms_org_id ON forms(organization_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_forms_slug ON forms(slug);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_forms_status ON forms(status);`);
        console.log('✅ Forms indexes created');

        console.log('✅ Forms migration completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Forms migration failed:', error.message);
        return false;
    }
};

/**
 * Create form_fields table
 */
const runFormFieldsMigration = async (pool) => {
    console.log('Running form fields table migration...');

    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS form_fields (
        id SERIAL PRIMARY KEY,
        form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
        
        field_type VARCHAR(50) NOT NULL,
        label VARCHAR(255) NOT NULL,
        placeholder VARCHAR(255),
        help_text TEXT,
        
        -- Validation
        is_required BOOLEAN DEFAULT FALSE,
        validation JSONB DEFAULT '{}'::jsonb,
        
        -- Options (for select, radio, checkbox)
        options JSONB DEFAULT '[]'::jsonb,
        
        -- Layout
        field_order INTEGER NOT NULL,
        width VARCHAR(20) DEFAULT 'full' CHECK (width IN ('full', 'half')),
        
        -- Conditional logic
        conditions JSONB DEFAULT '[]'::jsonb,
        
        -- Contact field mapping
        map_to_contact_field VARCHAR(100),
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Form fields table created');

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_form_fields_form_id ON form_fields(form_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_form_fields_order ON form_fields(form_id, field_order);`);
        console.log('✅ Form fields indexes created');

        console.log('✅ Form fields migration completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Form fields migration failed:', error.message);
        return false;
    }
};

/**
 * Create form_submissions table
 */
const runFormSubmissionsMigration = async (pool) => {
    console.log('Running form submissions table migration...');

    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS form_submissions (
        id SERIAL PRIMARY KEY,
        form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        
        data JSONB NOT NULL,
        
        -- Metadata
        ip_address VARCHAR(50),
        user_agent TEXT,
        referrer VARCHAR(500),
        
        -- Survey scoring
        score INTEGER,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Form submissions table created');

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON form_submissions(form_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_form_submissions_org_id ON form_submissions(organization_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_form_submissions_contact_id ON form_submissions(contact_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at ON form_submissions(created_at DESC);`);
        console.log('✅ Form submissions indexes created');

        console.log('✅ Form submissions migration completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Form submissions migration failed:', error.message);
        return false;
    }
};

/**
 * Run all forms migrations
 */
const runAllFormsMigrations = async (pool) => {
    console.log('=== Starting Forms Migrations ===');

    const migrations = [
        { name: 'Forms', fn: runFormsMigration },
        { name: 'Form Fields', fn: runFormFieldsMigration },
        { name: 'Form Submissions', fn: runFormSubmissionsMigration },
    ];

    for (const migration of migrations) {
        console.log(`\n--- Running ${migration.name} Migration ---`);
        const success = await migration.fn(pool);
        if (!success) {
            console.error(`⚠️ ${migration.name} migration failed, continuing...`);
        }
    }

    console.log('\n=== Forms Migrations Complete ===');
    return true;
};

module.exports = {
    runFormsMigration,
    runFormFieldsMigration,
    runFormSubmissionsMigration,
    runAllFormsMigrations,
};
