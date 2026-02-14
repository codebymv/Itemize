/**
 * E-Signature Database Migrations
 * Tables for signature documents, recipients, fields, and audit trail
 */

/**
 * Create signature_documents table
 */
async function createSignatureDocumentsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS signature_documents (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Document metadata
                title VARCHAR(255) NOT NULL,
                document_number VARCHAR(100),
                description TEXT,
                message TEXT,
                
                -- File storage
                file_url TEXT,
                file_name VARCHAR(255),
                file_size INTEGER,
                file_type VARCHAR(100),
                
                -- Status tracking
                status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'in_progress', 'completed', 'cancelled', 'expired')),
                expiration_days INTEGER DEFAULT 30,
                expires_at TIMESTAMP WITH TIME ZONE,
                
                -- Sender info
                sender_name VARCHAR(255),
                sender_email VARCHAR(255),
                
                -- Completion tracking
                sent_at TIMESTAMP WITH TIME ZONE,
                completed_at TIMESTAMP WITH TIME ZONE,
                signed_file_url TEXT,
                
                -- Integrity
                original_sha256 VARCHAR(64),
                signed_sha256 VARCHAR(64),
                
                -- Localization
                timezone VARCHAR(100),
                locale VARCHAR(20),
                
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_documents_org ON signature_documents(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_documents_status ON signature_documents(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_documents_number ON signature_documents(organization_id, document_number)
        `);

        console.log('✅ signature_documents table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create signature_recipients table
 */
async function createSignatureRecipientsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS signature_recipients (
                id SERIAL PRIMARY KEY,
                document_id INTEGER NOT NULL REFERENCES signature_documents(id) ON DELETE CASCADE,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
                
                -- Recipient info
                name VARCHAR(255),
                email VARCHAR(255) NOT NULL,
                signing_order INTEGER DEFAULT 1,
                
                -- Token and status
                signing_token_hash VARCHAR(64),
                token_expires_at TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'viewed', 'signed', 'declined')),
                
                -- Timestamps
                sent_at TIMESTAMP WITH TIME ZONE,
                viewed_at TIMESTAMP WITH TIME ZONE,
                signed_at TIMESTAMP WITH TIME ZONE,
                declined_at TIMESTAMP WITH TIME ZONE,
                decline_reason TEXT,
                
                -- Audit data
                ip_address VARCHAR(100),
                user_agent TEXT,
                
                -- Identity verification
                identity_method VARCHAR(20) DEFAULT 'none' CHECK (identity_method IN ('none', 'email_otp', 'sms_otp')),
                identity_verified_at TIMESTAMP WITH TIME ZONE,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_recipients_doc ON signature_recipients(document_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_recipients_org ON signature_recipients(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_recipients_status ON signature_recipients(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_recipients_token_hash ON signature_recipients(signing_token_hash)
        `);
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_recipients_doc_email ON signature_recipients(document_id, email)
        `);

        console.log('✅ signature_recipients table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create signature_fields table
 */
async function createSignatureFieldsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS signature_fields (
                id SERIAL PRIMARY KEY,
                document_id INTEGER NOT NULL REFERENCES signature_documents(id) ON DELETE CASCADE,
                recipient_id INTEGER REFERENCES signature_recipients(id) ON DELETE SET NULL,
                
                -- Field type and placement
                field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('signature', 'initials', 'text', 'date', 'checkbox')),
                page_number INTEGER NOT NULL DEFAULT 1,
                x_position DECIMAL(6,3) NOT NULL,
                y_position DECIMAL(6,3) NOT NULL,
                width DECIMAL(6,3) NOT NULL,
                height DECIMAL(6,3) NOT NULL,
                
                -- Field config
                label VARCHAR(255),
                is_required BOOLEAN DEFAULT TRUE,
                value TEXT,
                font_size INTEGER,
                font_family VARCHAR(100),
                text_align VARCHAR(10),
                locked BOOLEAN DEFAULT FALSE,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_fields_doc ON signature_fields(document_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_fields_recipient ON signature_fields(recipient_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_fields_type ON signature_fields(field_type)
        `);

        console.log('✅ signature_fields table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create signature_audit_log table
 */
async function createSignatureAuditLogTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS signature_audit_log (
                id SERIAL PRIMARY KEY,
                document_id INTEGER NOT NULL REFERENCES signature_documents(id) ON DELETE CASCADE,
                recipient_id INTEGER REFERENCES signature_recipients(id) ON DELETE SET NULL,
                
                event_type VARCHAR(50) NOT NULL,
                description TEXT,
                ip_address VARCHAR(100),
                user_agent TEXT,
                metadata JSONB DEFAULT '{}'::jsonb,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_audit_doc ON signature_audit_log(document_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_audit_recipient ON signature_audit_log(recipient_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_audit_type ON signature_audit_log(event_type)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_audit_created_at ON signature_audit_log(created_at DESC)
        `);

        console.log('✅ signature_audit_log table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create signature_document_versions table
 */
async function createSignatureDocumentVersionsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS signature_document_versions (
                id SERIAL PRIMARY KEY,
                document_id INTEGER NOT NULL REFERENCES signature_documents(id) ON DELETE CASCADE,
                version_number INTEGER NOT NULL DEFAULT 1,
                
                -- File storage
                file_url TEXT,
                file_name VARCHAR(255),
                file_size INTEGER,
                file_type VARCHAR(100),
                original_sha256 VARCHAR(64),
                
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(document_id, version_number)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_doc_versions_doc ON signature_document_versions(document_id)
        `);

        console.log('✅ signature_document_versions table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Run all e-signature migrations
 */
async function runAllESignatureMigrations(pool) {
    console.log('Running e-signature migrations...');
    
    await createSignatureDocumentsTable(pool);
    await createSignatureRecipientsTable(pool);
    await createSignatureFieldsTable(pool);
    await createSignatureAuditLogTable(pool);
    await createSignatureDocumentVersionsTable(pool);
    
    console.log('✅ All e-signature migrations completed');
}

/**
 * MVP+ migrations for templates, routing, and reminders
 */
async function runESignatureMvpPlusMigrations(pool) {
    const client = await pool.connect();
    try {
        // Extend signature_documents with routing + template linkage
        await client.query(`
            ALTER TABLE signature_documents
            ADD COLUMN IF NOT EXISTS routing_mode VARCHAR(20) DEFAULT 'parallel'
        `);
        await client.query(`
            ALTER TABLE signature_documents
            ADD COLUMN IF NOT EXISTS template_id INTEGER
        `);

        // Extend signature_recipients for role-based routing
        await client.query(`
            ALTER TABLE signature_recipients
            ADD COLUMN IF NOT EXISTS role_name VARCHAR(100)
        `);
        await client.query(`
            ALTER TABLE signature_recipients
            ADD COLUMN IF NOT EXISTS routing_status VARCHAR(20) DEFAULT 'locked'
        `);

        // Extend signature_fields to support role mapping
        await client.query(`
            ALTER TABLE signature_fields
            ADD COLUMN IF NOT EXISTS role_name VARCHAR(100)
        `);

        // Templates
        await client.query(`
            CREATE TABLE IF NOT EXISTS signature_templates (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                message TEXT,
                file_url TEXT,
                file_name VARCHAR(255),
                file_size INTEGER,
                file_type VARCHAR(100),
                original_sha256 VARCHAR(64),
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_templates_org ON signature_templates(organization_id)
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS signature_template_roles (
                id SERIAL PRIMARY KEY,
                template_id INTEGER NOT NULL REFERENCES signature_templates(id) ON DELETE CASCADE,
                role_name VARCHAR(100) NOT NULL,
                signing_order INTEGER DEFAULT 1,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_template_roles_template ON signature_template_roles(template_id)
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS signature_template_fields (
                id SERIAL PRIMARY KEY,
                template_id INTEGER NOT NULL REFERENCES signature_templates(id) ON DELETE CASCADE,
                role_name VARCHAR(100),
                field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('signature', 'initials', 'text', 'date', 'checkbox')),
                page_number INTEGER NOT NULL DEFAULT 1,
                x_position DECIMAL(6,3) NOT NULL,
                y_position DECIMAL(6,3) NOT NULL,
                width DECIMAL(6,3) NOT NULL,
                height DECIMAL(6,3) NOT NULL,
                label VARCHAR(255),
                is_required BOOLEAN DEFAULT TRUE,
                font_size INTEGER,
                font_family VARCHAR(100),
                text_align VARCHAR(10),
                locked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_template_fields_template ON signature_template_fields(template_id)
        `);

        // Reminders
        await client.query(`
            CREATE TABLE IF NOT EXISTS signature_reminders (
                id SERIAL PRIMARY KEY,
                document_id INTEGER NOT NULL REFERENCES signature_documents(id) ON DELETE CASCADE,
                recipient_id INTEGER REFERENCES signature_recipients(id) ON DELETE SET NULL,
                scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
                sent_at TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_reminders_document ON signature_reminders(document_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_signature_reminders_scheduled ON signature_reminders(scheduled_at)
        `);
    } finally {
        client.release();
    }
}

module.exports = {
    runAllESignatureMigrations,
    runESignatureMvpPlusMigrations,
    createSignatureDocumentsTable,
    createSignatureRecipientsTable,
    createSignatureFieldsTable,
    createSignatureAuditLogTable,
    createSignatureDocumentVersionsTable
};
