/**
 * SMS Database Migrations
 * Schema for SMS templates and SMS logging
 */

/**
 * Create sms_templates table for reusable SMS templates
 */
const runSmsTemplatesMigration = async (pool) => {
  console.log('Running SMS templates table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sms_templates (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        variables JSONB DEFAULT '[]'::jsonb,
        category VARCHAR(100) DEFAULT 'general',
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ SMS templates table created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_templates_org_id ON sms_templates(organization_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_templates_category ON sms_templates(category);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_templates_active ON sms_templates(is_active);
    `);
    console.log('✅ SMS templates indexes created');

    console.log('✅ SMS templates migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ SMS templates migration failed:', error.message);
    return false;
  }
};

/**
 * Create sms_logs table for tracking sent SMS messages
 */
const runSmsLogsMigration = async (pool) => {
  console.log('Running SMS logs table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sms_logs (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        template_id INTEGER REFERENCES sms_templates(id) ON DELETE SET NULL,
        workflow_enrollment_id INTEGER REFERENCES workflow_enrollments(id) ON DELETE SET NULL,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
        to_phone VARCHAR(50) NOT NULL,
        from_phone VARCHAR(50),
        message TEXT NOT NULL,
        direction VARCHAR(20) NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
        status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (status IN (
          'queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'received'
        )),
        external_id VARCHAR(255),
        segments INTEGER DEFAULT 1,
        error_code VARCHAR(20),
        error_message TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP WITH TIME ZONE,
        delivered_at TIMESTAMP WITH TIME ZONE
      );
    `);
    console.log('✅ SMS logs table created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_org_id ON sms_logs(organization_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_contact_id ON sms_logs(contact_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_template_id ON sms_logs(template_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_enrollment_id ON sms_logs(workflow_enrollment_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_conversation_id ON sms_logs(conversation_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON sms_logs(status);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_direction ON sms_logs(direction);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_queued_at ON sms_logs(queued_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_external_id ON sms_logs(external_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_to_phone ON sms_logs(to_phone);
    `);
    console.log('✅ SMS logs indexes created');

    console.log('✅ SMS logs migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ SMS logs migration failed:', error.message);
    return false;
  }
};

/**
 * Add phone number index to contacts table for SMS lookups
 */
const runContactsPhoneIndexMigration = async (pool) => {
  console.log('Running contacts phone index migration...');
  
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone) WHERE phone IS NOT NULL;
    `);
    console.log('✅ Contacts phone index created');

    console.log('✅ Contacts phone index migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Contacts phone index migration failed:', error.message);
    return false;
  }
};

/**
 * Run all SMS migrations in order
 */
const runAllSmsMigrations = async (pool) => {
  console.log('=== Starting SMS Migrations ===');
  
  const migrations = [
    { name: 'SMS Templates', fn: runSmsTemplatesMigration },
    { name: 'SMS Logs', fn: runSmsLogsMigration },
    { name: 'Contacts Phone Index', fn: runContactsPhoneIndexMigration },
  ];

  for (const migration of migrations) {
    console.log(`\n--- Running ${migration.name} Migration ---`);
    const success = await migration.fn(pool);
    if (!success) {
      console.error(`⚠️ ${migration.name} migration failed, continuing with next...`);
    }
  }

  console.log('\n=== SMS Migrations Complete ===');
  return true;
};

module.exports = {
  runSmsTemplatesMigration,
  runSmsLogsMigration,
  runContactsPhoneIndexMigration,
  runAllSmsMigrations,
};
