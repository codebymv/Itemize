/**
 * CRM Database Migrations
 * Schema for organizations, contacts, pipelines, deals, tasks, and activities
 */

/**
 * Create organizations table for multi-tenancy support
 */
const runOrganizationsMigration = async (pool) => {
  console.log('Running organizations table migration...');
  
  try {
    // Create organizations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        settings JSONB DEFAULT '{}'::jsonb,
        logo_url VARCHAR(500),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Organizations table created');

    // Create organization_members table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organization_members (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
        invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        joined_at TIMESTAMP WITH TIME ZONE,
        invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(organization_id, user_id)
      );
    `);
    console.log('✅ Organization members table created');

    // Create indexes for organization lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(organization_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
    `);
    console.log('✅ Organization indexes created');

    // Add default_organization_id to users table
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS default_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
    `);
    console.log('✅ Added default_organization_id to users table');

    console.log('✅ Organizations migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Organizations migration failed:', error.message);
    return false;
  }
};

/**
 * Create tags table for contact/deal organization
 */
const runTagsMigration = async (pool) => {
  console.log('Running tags table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(7) DEFAULT '#3B82F6',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(organization_id, name)
      );
    `);
    console.log('✅ Tags table created');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tags_org_id ON tags(organization_id);
    `);
    console.log('✅ Tags indexes created');

    console.log('✅ Tags migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Tags migration failed:', error.message);
    return false;
  }
};

/**
 * Create contacts table - core CRM entity
 */
const runContactsMigration = async (pool) => {
  console.log('Running contacts table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        company VARCHAR(255),
        job_title VARCHAR(255),
        address JSONB DEFAULT '{}'::jsonb,
        source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'form', 'integration', 'api')),
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
        custom_fields JSONB DEFAULT '{}'::jsonb,
        tags TEXT[] DEFAULT '{}',
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Contacts table created');

    // Create indexes for contact search and filtering
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(organization_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(assigned_to);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);
    `);
    // GIN index for tags array search
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN(tags);
    `);
    // Full-text search index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts 
      USING GIN(to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(company, '')));
    `);
    console.log('✅ Contacts indexes created');

    console.log('✅ Contacts migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Contacts migration failed:', error.message);
    return false;
  }
};

/**
 * Create contact_activities table for activity timeline
 */
const runContactActivitiesMigration = async (pool) => {
  console.log('Running contact activities table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_activities (
        id SERIAL PRIMARY KEY,
        contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('note', 'email', 'call', 'task', 'meeting', 'status_change', 'deal_update', 'system')),
        title VARCHAR(255),
        content JSONB DEFAULT '{}'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Contact activities table created');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_activities_contact_id ON contact_activities(contact_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_activities_type ON contact_activities(type);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_activities_created_at ON contact_activities(created_at DESC);
    `);
    console.log('✅ Contact activities indexes created');

    console.log('✅ Contact activities migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Contact activities migration failed:', error.message);
    return false;
  }
};

/**
 * Create pipelines table for sales pipeline management
 */
const runPipelinesMigration = async (pool) => {
  console.log('Running pipelines table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pipelines (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        stages JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_default BOOLEAN DEFAULT FALSE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Pipelines table created');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pipelines_org_id ON pipelines(organization_id);
    `);
    console.log('✅ Pipelines indexes created');

    console.log('✅ Pipelines migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Pipelines migration failed:', error.message);
    return false;
  }
};

/**
 * Create deals table for opportunity tracking
 */
const runDealsMigration = async (pool) => {
  console.log('Running deals table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deals (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        stage_id VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        value DECIMAL(15, 2) DEFAULT 0,
        currency VARCHAR(3) DEFAULT 'USD',
        probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
        expected_close_date DATE,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        won_at TIMESTAMP WITH TIME ZONE,
        lost_at TIMESTAMP WITH TIME ZONE,
        lost_reason TEXT,
        custom_fields JSONB DEFAULT '{}'::jsonb,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Deals table created');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_org_id ON deals(organization_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_pipeline_id ON deals(pipeline_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON deals(contact_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_stage_id ON deals(stage_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON deals(assigned_to);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at DESC);
    `);
    console.log('✅ Deals indexes created');

    console.log('✅ Deals migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Deals migration failed:', error.message);
    return false;
  }
};

/**
 * Create tasks table for task management
 */
const runTasksMigration = async (pool) => {
  console.log('Running tasks table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
        reminder_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tasks table created');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_org_id ON tasks(organization_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_deal_id ON tasks(deal_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    `);
    console.log('✅ Tasks indexes created');

    console.log('✅ Tasks migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Tasks migration failed:', error.message);
    return false;
  }
};

/**
 * Add contact_id to existing tables (lists, notes, whiteboards)
 */
const runLinkExistingContentMigration = async (pool) => {
  console.log('Running link existing content migration...');
  
  try {
    // Add contact_id to lists table
    await pool.query(`
      ALTER TABLE lists 
      ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lists_contact_id ON lists(contact_id);
    `);
    console.log('✅ Added contact_id to lists table');

    // Add contact_id to notes table
    await pool.query(`
      ALTER TABLE notes 
      ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_contact_id ON notes(contact_id);
    `);
    console.log('✅ Added contact_id to notes table');

    // Add contact_id to whiteboards table
    await pool.query(`
      ALTER TABLE whiteboards 
      ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_whiteboards_contact_id ON whiteboards(contact_id);
    `);
    console.log('✅ Added contact_id to whiteboards table');

    // Add organization_id to existing tables for multi-tenancy
    await pool.query(`
      ALTER TABLE lists 
      ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
    `);
    await pool.query(`
      ALTER TABLE notes 
      ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
    `);
    await pool.query(`
      ALTER TABLE whiteboards 
      ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
    `);
    await pool.query(`
      ALTER TABLE categories 
      ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
    `);
    console.log('✅ Added organization_id to existing tables');

    console.log('✅ Link existing content migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Link existing content migration failed:', error.message);
    return false;
  }
};

/**
 * Run all CRM migrations in order
 */
const runAllCRMMigrations = async (pool) => {
  console.log('=== Starting CRM Migrations ===');
  
  const migrations = [
    { name: 'Organizations', fn: runOrganizationsMigration },
    { name: 'Tags', fn: runTagsMigration },
    { name: 'Contacts', fn: runContactsMigration },
    { name: 'Contact Activities', fn: runContactActivitiesMigration },
    { name: 'Pipelines', fn: runPipelinesMigration },
    { name: 'Deals', fn: runDealsMigration },
    { name: 'Tasks', fn: runTasksMigration },
    { name: 'Link Existing Content', fn: runLinkExistingContentMigration },
  ];

  for (const migration of migrations) {
    console.log(`\n--- Running ${migration.name} Migration ---`);
    const success = await migration.fn(pool);
    if (!success) {
      console.error(`⚠️ ${migration.name} migration failed, continuing with next...`);
    }
  }

  console.log('\n=== CRM Migrations Complete ===');
  return true;
};

module.exports = {
  runOrganizationsMigration,
  runTagsMigration,
  runContactsMigration,
  runContactActivitiesMigration,
  runPipelinesMigration,
  runDealsMigration,
  runTasksMigration,
  runLinkExistingContentMigration,
  runAllCRMMigrations,
};
