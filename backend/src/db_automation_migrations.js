/**
 * Marketing Automation Database Migrations
 * Schema for workflows, email templates, and automation tracking
 */

/**
 * Create email_templates table for reusable email templates
 */
const runEmailTemplatesMigration = async (pool) => {
  console.log('Running email templates table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body_html TEXT NOT NULL,
        body_text TEXT,
        variables JSONB DEFAULT '[]'::jsonb,
        category VARCHAR(100) DEFAULT 'general',
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Email templates table created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_templates_org_id ON email_templates(organization_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);
    `);
    console.log('✅ Email templates indexes created');

    console.log('✅ Email templates migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Email templates migration failed:', error.message);
    return false;
  }
};

/**
 * Create workflows table for automation definitions
 */
const runWorkflowsMigration = async (pool) => {
  console.log('Running workflows table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN (
          'contact_added', 'tag_added', 'tag_removed', 'deal_stage_changed',
          'form_submitted', 'manual', 'scheduled', 'contact_updated'
        )),
        trigger_config JSONB DEFAULT '{}'::jsonb,
        is_active BOOLEAN DEFAULT FALSE,
        stats JSONB DEFAULT '{"enrolled": 0, "completed": 0, "failed": 0}'::jsonb,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Workflows table created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflows_org_id ON workflows(organization_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflows_trigger_type ON workflows(trigger_type);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active);
    `);
    console.log('✅ Workflows indexes created');

    console.log('✅ Workflows migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Workflows migration failed:', error.message);
    return false;
  }
};

/**
 * Create workflow_steps table for actions within workflows
 */
const runWorkflowStepsMigration = async (pool) => {
  console.log('Running workflow steps table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_steps (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        step_order INTEGER NOT NULL,
        step_type VARCHAR(50) NOT NULL CHECK (step_type IN (
          'send_email', 'add_tag', 'remove_tag', 'wait', 'create_task',
          'move_deal', 'webhook', 'condition', 'update_contact', 'send_sms'
        )),
        step_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        condition_config JSONB DEFAULT NULL,
        true_branch_step INTEGER,
        false_branch_step INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workflow_id, step_order)
      );
    `);
    console.log('✅ Workflow steps table created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_order ON workflow_steps(workflow_id, step_order);
    `);
    console.log('✅ Workflow steps indexes created');

    console.log('✅ Workflow steps migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Workflow steps migration failed:', error.message);
    return false;
  }
};

/**
 * Create workflow_enrollments table for contacts in workflows
 */
const runWorkflowEnrollmentsMigration = async (pool) => {
  console.log('Running workflow enrollments table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_enrollments (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        current_step INTEGER DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN (
          'active', 'completed', 'paused', 'failed', 'cancelled'
        )),
        trigger_data JSONB DEFAULT '{}'::jsonb,
        context JSONB DEFAULT '{}'::jsonb,
        error_message TEXT,
        enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        next_action_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(workflow_id, contact_id)
      );
    `);
    console.log('✅ Workflow enrollments table created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_enrollments_workflow_id ON workflow_enrollments(workflow_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_enrollments_contact_id ON workflow_enrollments(contact_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_enrollments_status ON workflow_enrollments(status);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_enrollments_next_action ON workflow_enrollments(next_action_at) WHERE status = 'active';
    `);
    console.log('✅ Workflow enrollments indexes created');

    console.log('✅ Workflow enrollments migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Workflow enrollments migration failed:', error.message);
    return false;
  }
};

/**
 * Create email_logs table for tracking sent emails
 */
const runEmailLogsMigration = async (pool) => {
  console.log('Running email logs table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
        workflow_enrollment_id INTEGER REFERENCES workflow_enrollments(id) ON DELETE SET NULL,
        to_email VARCHAR(255) NOT NULL,
        from_email VARCHAR(255),
        subject VARCHAR(500) NOT NULL,
        body_html TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN (
          'queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed'
        )),
        external_id VARCHAR(255),
        metadata JSONB DEFAULT '{}'::jsonb,
        error_message TEXT,
        queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP WITH TIME ZONE,
        delivered_at TIMESTAMP WITH TIME ZONE,
        opened_at TIMESTAMP WITH TIME ZONE,
        clicked_at TIMESTAMP WITH TIME ZONE
      );
    `);
    console.log('✅ Email logs table created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_logs_org_id ON email_logs(organization_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_logs_contact_id ON email_logs(contact_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_logs_template_id ON email_logs(template_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_logs_enrollment_id ON email_logs(workflow_enrollment_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_logs_queued_at ON email_logs(queued_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_logs_external_id ON email_logs(external_id);
    `);
    console.log('✅ Email logs indexes created');

    console.log('✅ Email logs migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Email logs migration failed:', error.message);
    return false;
  }
};

/**
 * Create workflow_execution_logs table for debugging and audit
 */
const runWorkflowExecutionLogsMigration = async (pool) => {
  console.log('Running workflow execution logs table migration...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_execution_logs (
        id SERIAL PRIMARY KEY,
        enrollment_id INTEGER NOT NULL REFERENCES workflow_enrollments(id) ON DELETE CASCADE,
        step_id INTEGER REFERENCES workflow_steps(id) ON DELETE SET NULL,
        step_order INTEGER,
        action_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'skipped')),
        input_data JSONB DEFAULT '{}'::jsonb,
        output_data JSONB DEFAULT '{}'::jsonb,
        error_message TEXT,
        duration_ms INTEGER,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Workflow execution logs table created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_exec_logs_enrollment ON workflow_execution_logs(enrollment_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_exec_logs_executed_at ON workflow_execution_logs(executed_at DESC);
    `);
    console.log('✅ Workflow execution logs indexes created');

    console.log('✅ Workflow execution logs migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Workflow execution logs migration failed:', error.message);
    return false;
  }
};

/**
 * Run all automation migrations in order
 */
const runAllAutomationMigrations = async (pool) => {
  console.log('=== Starting Automation Migrations ===');
  
  const migrations = [
    { name: 'Email Templates', fn: runEmailTemplatesMigration },
    { name: 'Workflows', fn: runWorkflowsMigration },
    { name: 'Workflow Steps', fn: runWorkflowStepsMigration },
    { name: 'Workflow Enrollments', fn: runWorkflowEnrollmentsMigration },
    { name: 'Email Logs', fn: runEmailLogsMigration },
    { name: 'Workflow Execution Logs', fn: runWorkflowExecutionLogsMigration },
  ];

  for (const migration of migrations) {
    console.log(`\n--- Running ${migration.name} Migration ---`);
    const success = await migration.fn(pool);
    if (!success) {
      console.error(`⚠️ ${migration.name} migration failed, continuing with next...`);
    }
  }

  console.log('\n=== Automation Migrations Complete ===');
  return true;
};

module.exports = {
  runEmailTemplatesMigration,
  runWorkflowsMigration,
  runWorkflowStepsMigration,
  runWorkflowEnrollmentsMigration,
  runEmailLogsMigration,
  runWorkflowExecutionLogsMigration,
  runAllAutomationMigrations,
};
