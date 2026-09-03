const { Pool } = require('pg');

// Import migration tracker for fast startup (skips already-run migrations)
const { runMigrationOnce: runTrackedMigrationOnce } = require('./utils/migrationTracker');

// Database initialization is an all-required sequence. The shared tracker
// intentionally returns false so batch callers can count and continue, but
// application startup must stop at the first unrecorded migration.
const runMigrationOnce = async (pool, migrationName, migrationFn) => {
  const succeeded = await runTrackedMigrationOnce(pool, migrationName, migrationFn);
  if (!succeeded) {
    throw new Error(`Required migration failed: ${migrationName}`);
  }
  return true;
};

// Import database migrations
const { runCanvasMigration, runListResizeMigration, runCreateNotesTableMigration, runAddTitleAndCategoryToNotesMigration, runCategoriesTableMigration, runCategoriesDataMigration, runCleanupDefaultCategories, runSharingMigration, runEmailPasswordAuthMigration, runWireframesMigration, runWireframesDimensionsMigration, runOnboardingMigration, runGetStartedMigration } = require('./db_migrations');
const { runActivationEventsMigration } = require('./db_activation_events_migrations');
const {
  runAccountDeletionGraceMigration,
} = require('./db_account_deletion_migrations');
const {
  runWireframeContactMigration,
} = require('./db_wireframe_contact_migrations');
const {
  runWorkspaceCreationReceiptMigration,
} = require('./db_workspace_creation_receipt_migrations');

const { runCategoryContractMigration } = require('./db_category_contract_migrations');

// Import CRM migrations
const { runAllCRMMigrations } = require('./db_crm_migrations');
const {
  runContactImportReceiptMigration,
} = require('./db_contact_import_receipt_migrations');
const {
  runContactCreationReceiptMigration,
} = require('./db_contact_creation_receipt_migrations');
const {
  runDealCreationReceiptMigration,
} = require('./db_deal_creation_receipt_migrations');
const {
  runOrganizationInvitationsMigration,
  runOrganizationOwnerInvariantMigration,
} = require('./db_organization_lifecycle_migrations');
const {
  runOrganizationMutationReceiptMigration,
} = require('./db_organization_mutation_receipt_migrations');
const {
  runOrganizationAllowanceMigration,
} = require('./db_organization_allowance_migrations');

// Import Automation migrations
const { runAllAutomationMigrations } = require('./db_automation_migrations');
const {
  runWorkflowCreationReceiptMigration,
} = require('./db_workflow_creation_receipt_migrations');
const {
  runEmailTemplateVersionsMigration,
} = require('./db_email_template_versions_migrations');
const {
  runEmailTemplatePublishReceiptMigration,
} = require('./db_email_template_publish_receipt_migrations');
const {
  runEmailTemplateCreationReceiptMigration,
} = require('./db_email_template_creation_receipt_migrations');
const { runWorkflowRegistryMigration } = require('./db_workflow_registry_migrations');
const { runWorkflowWebhookIdempotencyMigration } = require('./db_workflow_webhook_migrations');
const { runWorkflowTriggerQueueMigration } = require('./db_workflow_trigger_queue_migrations');
const { runWorkflowScheduleMigration } = require('./db_workflow_schedule_migrations');
const {
    runWorkflowExecutionClaimMigration,
} = require('./db_workflow_execution_claim_migrations');
const {
    runWorkflowLifecycleMigration,
} = require('./db_workflow_lifecycle_migrations');
const {
    runWorkflowSmsReconciliationMigration,
} = require('./db_workflow_sms_reconciliation_migrations');
const {
    runWorkflowSideEffectOutboxMigration,
} = require('./db_workflow_side_effect_migrations');
const {
  runRealtimeOutboxMigration,
  runWhiteboardRealtimeOutboxMigration,
  runWireframeRealtimeOutboxMigration,
  runSharedRevocationRealtimeOutboxMigration,
  runRealtimeOutboxExpirationMigration,
} = require('./db_realtime_outbox_migrations');

// Import Calendar migrations
const { runAllCalendarMigrations } = require('./db_calendar_migrations');
const {
  runCalendarCreationReceiptMigration,
} = require('./db_calendar_creation_receipt_migrations');
const {
  runBookingAvailabilityPolicyMigration,
} = require('./db_booking_availability_policy_migrations');
const {
  runBookingPublicCapabilityMigration,
} = require('./db_booking_public_capability_migrations');
const {
  runBookingIdempotencyMigration,
} = require('./db_booking_idempotency_migrations');
const {
  runBookingCreationReceiptMigration,
} = require('./db_booking_creation_receipt_migrations');
const {
  runCalendarTokenEncryptionMigration,
} = require('./db_calendar_token_encryption_migrations');
const {
  runCalendarSyncJobMigration,
} = require('./db_calendar_sync_job_migrations');
const {
  runEstimateEmailDeliveryMigration,
} = require('./db_estimate_email_delivery_migrations');
const {
  runEstimateResponseNotificationMigration,
} = require('./db_estimate_response_notification_migrations');
const {
  runEstimatePublicCapabilityMigration,
} = require('./db_estimate_public_capability_migrations');
const {
  runInvoiceEmailDeliveryMigration,
} = require('./db_invoice_email_delivery_migrations');
const {
  runInvoicePaymentLinkMigration,
} = require('./db_invoice_payment_link_migrations');
const {
  runInvoicePaymentUrlMigration,
} = require('./db_invoice_payment_url_migrations');
const {
  runInvoicePaymentResultMigration,
} = require('./db_invoice_payment_result_migrations');
const {
  runPaymentRefundMigration,
  runRefundedInvoiceTerminalBalanceMigration,
} = require('./db_payment_refund_migrations');
const {
  runPaymentRecordingReceiptMigration,
} = require('./db_payment_recording_receipt_migrations');
const {
  runInvoiceHostedUrlMigration,
} = require('./db_invoice_hosted_url_migrations');
const {
  runInvoiceLogoDeletionMigration,
} = require('./db_invoice_logo_deletion_migrations');
const {
  runCampaignTestEmailDeliveryMigration,
} = require('./db_campaign_test_email_delivery_migrations');
const {
  runCampaignDeliveryMigration,
} = require('./db_campaign_delivery_migrations');
const {
  runCampaignSuppressionMigration,
} = require('./db_campaign_suppression_migrations');
const {
  runAdminEmailDeliveryMigration,
} = require('./db_admin_email_delivery_migrations');
const {
  runMessageDeliveryMigration,
  runMessageDeliveryConversationLinkMigration,
} = require('./db_message_delivery_migrations');
const {
  runSignatureDeliveryMigration,
} = require('./db_signature_delivery_migrations');
const {
  runSignatureFileDeletionMigration,
} = require('./db_signature_file_deletion_migrations');
const {
  runSignatureCompletionMigration,
} = require('./db_signature_completion_migrations');
const {
  runSignatureEvidenceRetentionMigration,
} = require('./db_signature_evidence_retention_migrations');
const {
  runTrialReminderDeliveryMigration,
} = require('./db_trial_reminder_delivery_migrations');
const {
  runNotificationCenterMigration,
} = require('./db_notification_migrations');

// Import Forms migrations
const { runAllFormsMigrations } = require('./db_forms_migrations');
const {
  runFormCreationReceiptMigration,
} = require('./db_form_creation_receipt_migrations');

// Import Inbox migrations
const { runAllInboxMigrations } = require('./db_inbox_migrations');
const {
  runConversationCreationReceiptMigration,
} = require('./db_conversation_creation_receipt_migrations');

// Import SMS migrations
const { runAllSmsMigrations } = require('./db_sms_migrations');
const {
  runSmsTemplateCreationReceiptMigration,
} = require('./db_sms_template_creation_receipt_migrations');
const {
    runSmsReceivingNumberRegistryMigration,
    runSmsWebhookIdempotencyMigration,
} = require('./db_sms_webhook_migrations');

// Import Chat Widget migrations
const { runAllChatWidgetMigrations } = require('./db_chat_widget_migrations');
const {
  runChatWidgetGraphqlMigration,
} = require('./db_chat_widget_graphql_migrations');
const {
  runChatWidgetCreationReceiptMigration,
} = require('./db_chat_widget_creation_receipt_migrations');
const {
  runChatInboxBridgeMigration,
} = require('./db_chat_inbox_bridge_migrations');
const {
  runChatWidgetPublicIdempotencyMigration,
} = require('./db_chat_widget_public_idempotency_migrations');

// Import Email Campaign migrations
const { runAllCampaignMigrations } = require('./db_campaign_migrations');
const {
  runCampaignCreationReceiptMigration,
} = require('./db_campaign_creation_receipt_migrations');
const {
    runEmailWebhookMigration,
    runEmailWebhookReconciliationMigration,
} = require('./db_email_webhook_migrations');

// Import Segments migrations
const { runAllSegmentMigrations } = require('./db_segments_migrations');
const { runSegmentCreationReceiptMigration } = require('./db_segment_creation_receipt_migrations');
const { runCampaignSegmentTargetMigration } = require('./db_campaign_segment_migrations');

// Import Invoicing migrations
const { runAllInvoicingMigrations, addBusinessIdToEstimates } = require('./db_invoicing_migrations');
const { runInvoiceCreationReceiptMigration } = require('./db_invoice_creation_receipt_migrations');
const { runEstimateCreationReceiptMigration } = require('./db_estimate_creation_receipt_migrations');
const {
  runRecurringInvoiceCreationReceiptMigration,
} = require('./db_recurring_invoice_creation_receipt_migrations');
const { runStripeWebhookIdempotencyMigration } = require('./db_stripe_webhook_migrations');

// Import Estimates and Recurring migrations
const { runEstimatesRecurringMigrations } = require('./db_estimates_recurring_migrations');

// Import Reputation migrations
const { runAllReputationMigrations } = require('./db_reputation_migrations');
const {
  runReputationWidgetCreationReceiptMigration,
} = require('./db_reputation_widget_creation_receipt_migrations');
const {
  runReputationRequestDeliveryMigration,
} = require('./db_reputation_request_delivery_migrations');
const {
  runPublicReviewSubmissionMigration,
} = require('./db_public_review_submission_migrations');

// Import Social migrations
const { runAllSocialMigrations } = require('./db_social_migrations');
const {
  runSocialWebhookMigration,
  runSocialWebhookReconciliationMigration,
} = require('./db_social_webhook_migrations');
const {
  runSocialMessageDeliveryMigration,
} = require('./db_social_delivery_migrations');
const {
  runSocialInboxBridgeMigration,
} = require('./db_social_inbox_bridge_migrations');

// Import Pages migrations
const { runAllPagesMigrations } = require('./db_pages_migrations');
const {
  runLandingPageCreationReceiptMigration,
} = require('./db_landing_page_creation_receipt_migrations');
const {
  runLandingPageVersionReceiptMigration,
} = require('./db_landing_page_version_receipt_migrations');

// Import Index migrations (performance optimization)
const { runAllIndexMigrations } = require('./db_indexes_migrations');

// Import Normalization migrations (schema improvements)
const { runAllNormalizationMigrations } = require('./db_normalization_migrations');
const { runCanonicalTagModelMigration } = require('./db_tag_canonical_migrations');
const { runCanonicalPipelineStageModelMigration } = require('./db_pipeline_stage_canonical_migrations');
const {
  runCanonicalContactEmailIdentityMigration,
} = require('./db_contact_email_identity_migrations');
const { runPublicFormContractMigration } = require('./db_public_form_contract_migrations');
const {
  runPublicFormSubmissionIdempotencyMigration,
} = require('./db_public_form_submission_idempotency_migrations');
const { runDealActivityMigration } = require('./db_deal_activity_migrations');

// Import Subscription migrations (feature gating and billing)
const { runAllSubscriptionMigrations } = require('./db_subscription_migrations');
const {
    runSubscriptionWebhookMigration,
    runSubscriptionWebhookNotificationOutboxMigration,
    runSubscriptionWebhookReconciliationMigration,
} = require('./db_subscription_webhook_migrations');

// Import E-Signature migrations
const { runAllESignatureMigrations, runESignatureMvpPlusMigrations } = require('./db_esignature_migrations');
const { runSignatureReliabilityMigration } = require('./db_signature_reliability_migrations');
const {
  runSignaturePublicResponseMigration,
} = require('./db_signature_public_response_migrations');
const {
  runSignatureCreationReceiptMigration,
} = require('./db_signature_creation_receipt_migrations');

// Import Vault migrations (encrypted storage)
const { runVaultMigrations } = require('./db_vault_migrations');

const userColumns = [
  'id',
  'email',
  'name',
  'google_id',
  'created_at',
  'updated_at',
  'default_organization_id'
].join(', ');

const ensureOrganizationBillingColumns = async (pool) => {
  await pool.query(`
    ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'starter',
      ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS billing_period VARCHAR(20) DEFAULT 'monthly',
      ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS trial_end_acknowledged_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS emails_used INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS emails_limit INTEGER DEFAULT 1000,
      ADD COLUMN IF NOT EXISTS sms_used INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS sms_limit INTEGER DEFAULT 500,
      ADD COLUMN IF NOT EXISTS api_calls_used INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS api_calls_limit INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS contacts_limit INTEGER DEFAULT 5000,
      ADD COLUMN IF NOT EXISTS users_limit INTEGER DEFAULT 3,
      ADD COLUMN IF NOT EXISTS workflows_limit INTEGER DEFAULT 5,
      ADD COLUMN IF NOT EXISTS landing_pages_limit INTEGER DEFAULT 10,
      ADD COLUMN IF NOT EXISTS forms_limit INTEGER DEFAULT 10,
      ADD COLUMN IF NOT EXISTS calendars_limit INTEGER DEFAULT 3,
      ADD COLUMN IF NOT EXISTS current_plan_id INTEGER REFERENCES subscription_plans(id),
      ADD COLUMN IF NOT EXISTS features_override JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITH TIME ZONE
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_org_subscription_status ON organizations(subscription_status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_org_plan ON organizations(plan)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_org_stripe_customer ON organizations(stripe_customer_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_org_stripe_subscription ON organizations(stripe_subscription_id)');

  return true;
};

// Connection configuration with better error handling
const createDbConnection = () => {
  try {
    // Check if DATABASE_URL is provided
    const dbUrl = process.env.DATABASE_URL;
    console.log('Starting database connection with URL:', dbUrl ? 'URL provided' : 'No URL found');

    if (!dbUrl) {
      console.warn('DATABASE_URL not found in environment. Using in-memory storage.');
      return null;
    }

    // For Railway deployments, we need to parse the connection info more granularly
    try {
      // Try to extract host from connection string to log it for debugging
      const matches = dbUrl.match(/postgresql:\/\/.*?@([^:]+)(:[0-9]+)?/);
      if (matches && matches[1]) {
        const host = matches[1];
        console.log(`Attempting to connect to host: ${host}`);

        // Try to resolve the host to its IP addresses for debugging
        require('dns').lookup(host, { all: true }, (err, addresses) => {
          if (err) {
            console.error('DNS lookup error:', err.message);
          } else {
            console.log('Host resolves to:', addresses.map(a => `${a.address} (${a.family === 4 ? 'IPv4' : 'IPv6'})`).join(', '));
          }
        });
      }
    } catch (err) {
      console.log('Could not parse host from connection string:', err.message);
    }

    // Create a connection pool with more robust timeout settings
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: process.env.DATABASE_SSL === 'false'
        ? false
        : { rejectUnauthorized: false }, // Required for hosted PostgreSQL connections
      // More robust connection settings to handle network latency and concurrent requests
      max: 20,                    // Increased from 5 to handle more concurrent OAuth requests
      min: 2,                     // Keep at least 2 connections alive for faster response
      idleTimeoutMillis: 60000,   // 60 seconds idle timeout (increased for better connection reuse)
      connectionTimeoutMillis: 10000, // 10 seconds connection timeout (reduced - fail fast if DB is down)
      statement_timeout: 30000,   // 30 seconds statement timeout
      query_timeout: 30000,       // 30 seconds query timeout
      acquireTimeoutMillis: 10000, // 10 seconds to acquire connection from pool (fail fast if pool exhausted)
      allowExitOnIdle: false,     // Keep pool alive even when idle
    });

    // Set up event handlers
    pool.on('connect', (_client) => {
      console.log('✅ Connected to PostgreSQL database successfully');
      console.log(`📊 Pool stats: Total=${pool.totalCount}, Idle=${pool.idleCount}, Waiting=${pool.waitingCount}`);
    });

    pool.on('error', (err, client) => {
      console.error('❌ Database pool error:', err.message);
      console.error('📊 Pool stats at error:', `Total=${pool.totalCount}, Idle=${pool.idleCount}, Waiting=${pool.waitingCount}`);
      console.error('Error code:', err.code);
      console.error('Error stack:', err.stack);

      // Don't crash the application on pool errors
      if (err.code === 'ENETUNREACH' || err.code === 'ENOTFOUND') {
        console.warn('🌐 Network unreachable or host not found. Switching to in-memory storage.');
      } else if (err.message && err.message.includes('timeout')) {
        console.warn('⏰ Database connection timeout detected. Pool may be exhausted.');
        console.warn('Consider checking database connectivity and pool configuration.');
      }
      
      // If client is provided and it's an error on a specific client, remove it from the pool
      if (client && err.code !== 'ENETUNREACH' && err.code !== 'ENOTFOUND') {
        console.warn('Removing errored client from pool');
        client.end();
      }
    });

    pool.on('acquire', (_client) => {
      // Only log in development to reduce noise in production
      if (process.env.NODE_ENV === 'development') {
        console.log('🔗 Client acquired from pool');
      }
    });

    pool.on('release', (_client) => {
      // Only log in development to reduce noise in production
      if (process.env.NODE_ENV === 'development') {
        console.log('🔓 Client released back to pool');
      }
    });

    // Monitor pool health periodically (every 5 minutes)
    const healthCheckInterval = setInterval(() => {
      const stats = {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: pool.options.max
      };
      
      // Log warning if pool is getting exhausted
      if (stats.total >= stats.max * 0.8) {
        console.warn('⚠️ Database pool usage high:', stats);
      }
      
      // Log warning if there are waiting clients
      if (stats.waiting > 0) {
        console.warn('⚠️ Clients waiting for database connections:', stats);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    // Clean up interval on process exit
    process.on('SIGINT', () => {
      clearInterval(healthCheckInterval);
    });
    process.on('SIGTERM', () => {
      clearInterval(healthCheckInterval);
    });

    // Test the connection immediately
    console.log('Testing database connection...');
    pool.query('SELECT 1 as health_check')
      .then(() => {
        console.log('✅ Database connection test successful');
      })
      .catch((err) => {
        console.error('❌ Database connection test failed:', err.message, err.stack);
        console.warn('Switching to in-memory storage');
      });

    return pool;
  } catch (error) {
    console.error('Error setting up database connection:', error);
    return null;
  }
};

// Create database tables if they don't exist
const initializeDatabase = async (pool) => {
  if (!pool) {
    console.log('No database connection, using in-memory storage');
    return false;
  }

  const startTime = Date.now();
  console.log('🚀 Starting database initialization...');

  try {
    // Core tables - always run (fast, idempotent)
    await runMigrationOnce(pool, 'core_users_table', async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255),
          google_id VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      return true;
    });









    // Core tables - lists and whiteboards (run once)
    await runMigrationOnce(pool, 'core_lists_table', async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.lists (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          category VARCHAR(255) DEFAULT 'General',
          type VARCHAR(255) DEFAULT 'General',
          items JSONB DEFAULT '[]'::jsonb,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          color_value VARCHAR(50) DEFAULT '#3B82F6',
          position_x FLOAT DEFAULT 0,
          position_y FLOAT DEFAULT 0,
          width FLOAT DEFAULT 320,
          height FLOAT,
          z_index INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          share_token VARCHAR(255),
          is_public BOOLEAN DEFAULT FALSE,
          shared_at TIMESTAMP WITH TIME ZONE,
          category_id INTEGER
        );
      `);
      return true;
    });

    await runMigrationOnce(pool, 'core_whiteboards_table', async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.whiteboards (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) DEFAULT 'Untitled Whiteboard',
          category VARCHAR(255),
          canvas_data JSONB DEFAULT '[]'::jsonb,
          canvas_width INTEGER DEFAULT 750,
          canvas_height INTEGER DEFAULT 620,
          background_color VARCHAR(50) DEFAULT '#ffffff',
          position_x FLOAT DEFAULT 0,
          position_y FLOAT DEFAULT 0,
          z_index INTEGER DEFAULT 0,
          color_value VARCHAR(50) DEFAULT '#3B82F6',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          share_token VARCHAR(255),
          is_public BOOLEAN DEFAULT FALSE,
          shared_at TIMESTAMP WITH TIME ZONE
        );
      `);
      return true;
    });

    // User column migrations
    await runMigrationOnce(pool, 'users_google_id_column', async () => {
      await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);`);
      return true;
    });

    await runMigrationOnce(pool, 'users_updated_at_column', async () => {
      await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);
      return true;
    });

    await runMigrationOnce(pool, 'users_email_password_auth', runEmailPasswordAuthMigration);
    await runMigrationOnce(
      pool,
      'account_deletion_grace_v1',
      runAccountDeletionGraceMigration,
    );

    // Feature migrations (tracked individually)
    await runMigrationOnce(pool, 'feature_canvas', runCanvasMigration);
    await runMigrationOnce(pool, 'feature_list_resize', runListResizeMigration);
    await runMigrationOnce(pool, 'feature_notes_table', runCreateNotesTableMigration);
    await runMigrationOnce(pool, 'feature_notes_title_category', runAddTitleAndCategoryToNotesMigration);
    await runMigrationOnce(pool, 'feature_categories_table', runCategoriesTableMigration);
    await runMigrationOnce(pool, 'feature_categories_data', runCategoriesDataMigration);
    await runMigrationOnce(pool, 'feature_categories_cleanup', runCleanupDefaultCategories);
    await runMigrationOnce(pool, 'category_contract_v1', runCategoryContractMigration);
    await runMigrationOnce(pool, 'feature_sharing', runSharingMigration);
    await runMigrationOnce(pool, 'feature_wireframes', runWireframesMigration);
    await runMigrationOnce(pool, 'feature_wireframes_dimensions', runWireframesDimensionsMigration);
    await runMigrationOnce(
      pool,
      'workspace_creation_receipts_v1',
      runWorkspaceCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'feature_onboarding', runOnboardingMigration);

    // Module migrations (each module handles its own tables)
    await runMigrationOnce(pool, 'module_crm', runAllCRMMigrations);
    await runMigrationOnce(
      pool,
      'contact_creation_receipts_v1',
      runContactCreationReceiptMigration,
    );
    await runMigrationOnce(
      pool,
      'deal_creation_receipts_v1',
      runDealCreationReceiptMigration,
    );
    await runMigrationOnce(
      pool,
      'contact_import_receipts_v1',
      runContactImportReceiptMigration,
    );
    await runMigrationOnce(
      pool,
      'wireframe_contact_link_v1',
      runWireframeContactMigration,
    );
    await runMigrationOnce(
      pool,
      'organization_owner_invariant_v1',
      runOrganizationOwnerInvariantMigration,
    );
    await runMigrationOnce(
      pool,
      'organization_invitations_v1',
      runOrganizationInvitationsMigration,
    );
    await runMigrationOnce(
      pool,
      'organization_mutation_receipts_v1',
      runOrganizationMutationReceiptMigration,
    );
    await runMigrationOnce(pool, 'feature_get_started', runGetStartedMigration);
    await runMigrationOnce(pool, 'activation_events_v1', runActivationEventsMigration);
    await runMigrationOnce(pool, 'module_automation', runAllAutomationMigrations);
    await runMigrationOnce(
      pool,
      'workflow_creation_receipts_v1',
      runWorkflowCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'email_template_versions_v1', runEmailTemplateVersionsMigration);
    await runMigrationOnce(
      pool,
      'email_template_creation_receipts_v1',
      runEmailTemplateCreationReceiptMigration,
    );
    await runMigrationOnce(
      pool,
      'email_template_publish_receipts_v1',
      runEmailTemplatePublishReceiptMigration,
    );
    await runMigrationOnce(pool, 'workflow_registry', runWorkflowRegistryMigration);
    await runMigrationOnce(pool, 'workflow_webhook_secrets', async (p) => {
      await p.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
      await p.query(`
        ALTER TABLE workflows
        ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(128);
      `);
      await p.query(`
        UPDATE workflows
        SET webhook_secret = encode(gen_random_bytes(32), 'hex')
        WHERE webhook_secret IS NULL;
      `);
      await p.query(`
        ALTER TABLE workflows
        ALTER COLUMN webhook_secret SET DEFAULT encode(gen_random_bytes(32), 'hex');
      `);
      await p.query(`
        CREATE INDEX IF NOT EXISTS idx_workflows_webhook_secret ON workflows(webhook_secret);
      `);
      return true;
    });
    await runMigrationOnce(pool, 'workflow_webhook_idempotency', runWorkflowWebhookIdempotencyMigration);
    await runMigrationOnce(pool, 'workflow_trigger_queue', runWorkflowTriggerQueueMigration);
    await runMigrationOnce(pool, 'workflow_schedules', runWorkflowScheduleMigration);
    await runMigrationOnce(pool, 'workflow_execution_claims', runWorkflowExecutionClaimMigration);
    await runMigrationOnce(pool, 'module_calendar', runAllCalendarMigrations);
    await runMigrationOnce(
      pool,
      'calendar_creation_receipts_v1',
      runCalendarCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'booking_availability_policy', runBookingAvailabilityPolicyMigration);
    await runMigrationOnce(pool, 'booking_public_capabilities', runBookingPublicCapabilityMigration);
    await runMigrationOnce(
      pool,
      'booking_public_idempotency_v1',
      runBookingIdempotencyMigration,
    );
    await runMigrationOnce(
      pool,
      'booking_creation_receipts_v1',
      runBookingCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'calendar_token_encryption', runCalendarTokenEncryptionMigration);
    await runMigrationOnce(pool, 'calendar_sync_jobs', runCalendarSyncJobMigration);
    await runMigrationOnce(pool, 'module_forms', runAllFormsMigrations);
    await runMigrationOnce(
      pool,
      'form_creation_receipts_v1',
      runFormCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'module_inbox', runAllInboxMigrations);
    await runMigrationOnce(
      pool,
      'conversation_creation_receipts_v1',
      runConversationCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'module_sms', runAllSmsMigrations);
    await runMigrationOnce(
      pool,
      'sms_template_creation_receipts_v1',
      runSmsTemplateCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'workflow_side_effect_outbox', runWorkflowSideEffectOutboxMigration);
    await runMigrationOnce(pool, 'realtime_event_outbox', runRealtimeOutboxMigration);
    await runMigrationOnce(pool, 'whiteboard_realtime_outbox', runWhiteboardRealtimeOutboxMigration);
    await runMigrationOnce(pool, 'wireframe_realtime_outbox', runWireframeRealtimeOutboxMigration);
    await runMigrationOnce(
      pool,
      'shared_revocation_realtime_outbox',
      runSharedRevocationRealtimeOutboxMigration,
    );
    await runMigrationOnce(
      pool,
      'workspace_shared_revocation_realtime_outbox',
      runSharedRevocationRealtimeOutboxMigration,
    );
    await runMigrationOnce(
      pool,
      'realtime_outbox_expiration',
      runRealtimeOutboxExpirationMigration,
    );
    await runMigrationOnce(pool, 'workflow_lifecycle', runWorkflowLifecycleMigration);
    await runMigrationOnce(pool, 'workflow_sms_reconciliation', runWorkflowSmsReconciliationMigration);
    await runMigrationOnce(pool, 'sms_webhook_idempotency', runSmsWebhookIdempotencyMigration);
    await runMigrationOnce(pool, 'sms_receiving_number_registry', runSmsReceivingNumberRegistryMigration);
    await runMigrationOnce(pool, 'module_chat_widget', runAllChatWidgetMigrations);
    await runMigrationOnce(
      pool,
      'chat_widget_graphql',
      runChatWidgetGraphqlMigration,
    );
    await runMigrationOnce(
      pool,
      'chat_widget_creation_receipts_v1',
      runChatWidgetCreationReceiptMigration,
    );
    await runMigrationOnce(
      pool,
      'chat_inbox_bridge_v1',
      runChatInboxBridgeMigration,
    );
    await runMigrationOnce(
      pool,
      'chat_widget_public_idempotency_v1',
      runChatWidgetPublicIdempotencyMigration,
    );
    await runMigrationOnce(pool, 'module_campaigns', runAllCampaignMigrations);
    await runMigrationOnce(
      pool,
      'campaign_creation_receipts_v1',
      runCampaignCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'email_webhook_events', runEmailWebhookMigration);
    await runMigrationOnce(pool, 'email_webhook_reconciliation', runEmailWebhookReconciliationMigration);
    await runMigrationOnce(pool, 'module_segments', runAllSegmentMigrations);
    await runMigrationOnce(
      pool,
      'segment_creation_receipts_v1',
      runSegmentCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'campaign_segment_targeting', runCampaignSegmentTargetMigration);
    await runMigrationOnce(pool, 'module_invoicing', runAllInvoicingMigrations);
    await runMigrationOnce(
      pool,
      'invoice_creation_receipts_v1',
      runInvoiceCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'stripe_webhook_idempotency', runStripeWebhookIdempotencyMigration);
    await runMigrationOnce(pool, 'module_estimates_recurring', runEstimatesRecurringMigrations);
    await runMigrationOnce(pool, 'estimates_business_column', addBusinessIdToEstimates);
    await runMigrationOnce(
      pool,
      'estimate_creation_receipts_v1',
      runEstimateCreationReceiptMigration,
    );
    await runMigrationOnce(
      pool,
      'recurring_invoice_creation_receipts_v1',
      runRecurringInvoiceCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'estimate_email_deliveries', runEstimateEmailDeliveryMigration);
    await runMigrationOnce(
      pool,
      'estimate_response_notifications',
      runEstimateResponseNotificationMigration,
    );
    await runMigrationOnce(
      pool,
      'estimate_public_capabilities',
      runEstimatePublicCapabilityMigration,
    );
    await runMigrationOnce(pool, 'invoice_email_deliveries', runInvoiceEmailDeliveryMigration);
    await runMigrationOnce(pool, 'invoice_payment_link_intents', runInvoicePaymentLinkMigration);
    await runMigrationOnce(
      pool,
      'invoice_payment_urls_text_v1',
      runInvoicePaymentUrlMigration,
    );
    await runMigrationOnce(
      pool,
      'invoice_payment_results_v1',
      runInvoicePaymentResultMigration,
    );
    await runMigrationOnce(
      pool,
      'payment_recording_receipts_v1',
      runPaymentRecordingReceiptMigration,
    );
    await runMigrationOnce(
      pool,
      'payment_refunds_v1',
      runPaymentRefundMigration,
    );
    await runMigrationOnce(
      pool,
      'refunded_invoice_terminal_balance_v1',
      runRefundedInvoiceTerminalBalanceMigration,
    );
    await runMigrationOnce(
      pool,
      'invoice_hosted_urls_text_v1',
      runInvoiceHostedUrlMigration,
    );
    await runMigrationOnce(pool, 'invoice_logo_deletion_jobs', runInvoiceLogoDeletionMigration);
    await runMigrationOnce(
      pool,
      'trial_reminder_deliveries',
      runTrialReminderDeliveryMigration,
    );
    await runMigrationOnce(
      pool,
      'notification_center_v1',
      runNotificationCenterMigration,
    );
    await runMigrationOnce(pool, 'campaign_test_email_deliveries', runCampaignTestEmailDeliveryMigration);
    await runMigrationOnce(pool, 'campaign_deliveries', runCampaignDeliveryMigration);
    await runMigrationOnce(pool, 'campaign_delivery_suppression_v1', runCampaignSuppressionMigration);
    
    // Non-destructive recurring invoice columns (source_invoice_id, is_recurring_source)
    await runMigrationOnce(pool, 'recurring_source_invoice_columns', async (p) => {
      // Add source_invoice_id to recurring_invoice_templates
      await p.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'recurring_invoice_templates' AND column_name = 'source_invoice_id'
          ) THEN
            ALTER TABLE recurring_invoice_templates ADD COLUMN source_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);
      // Add is_recurring_source to invoices
      await p.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'invoices' AND column_name = 'is_recurring_source'
          ) THEN
            ALTER TABLE invoices ADD COLUMN is_recurring_source BOOLEAN DEFAULT FALSE;
          END IF;
        END $$;
      `);
      // Add indexes
      await p.query(`
        CREATE INDEX IF NOT EXISTS idx_recurring_templates_source_invoice ON recurring_invoice_templates(source_invoice_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_recurring_source ON invoices(is_recurring_source) WHERE is_recurring_source = true;
      `);
      return true;
    });
    
    await runMigrationOnce(pool, 'module_reputation', runAllReputationMigrations);
    await runMigrationOnce(
      pool,
      'reputation_widget_creation_receipts_v1',
      runReputationWidgetCreationReceiptMigration,
    );
    await runMigrationOnce(
      pool,
      'public_review_submission_idempotency_v1',
      runPublicReviewSubmissionMigration,
    );
    await runMigrationOnce(
      pool,
      'reputation_request_deliveries',
      runReputationRequestDeliveryMigration
    );
    
    // Social migrations + oauth_states table
    await runMigrationOnce(pool, 'module_social', async (p) => {
      await runAllSocialMigrations(p);
      await p.query(`
        CREATE TABLE IF NOT EXISTS oauth_states (
          state VARCHAR(100) PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          provider VARCHAR(50) NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      return true;
    });
    await runMigrationOnce(pool, 'social_webhook_idempotency', runSocialWebhookMigration);
    await runMigrationOnce(pool, 'social_webhook_reconciliation', runSocialWebhookReconciliationMigration);
    await runMigrationOnce(pool, 'social_message_deliveries', runSocialMessageDeliveryMigration);
    await runMigrationOnce(pool, 'social_inbox_bridge_v1', runSocialInboxBridgeMigration);
    
    await runMigrationOnce(pool, 'module_pages', runAllPagesMigrations);
    await runMigrationOnce(
      pool,
      'landing_page_creation_receipts_v1',
      runLandingPageCreationReceiptMigration,
    );
    await runMigrationOnce(
      pool,
      'landing_page_version_mutation_receipts_v1',
      runLandingPageVersionReceiptMigration,
    );
    
    // Performance and schema optimization (run last)
    await runMigrationOnce(pool, 'optimization_indexes', runAllIndexMigrations);
    await runMigrationOnce(pool, 'optimization_normalization', runAllNormalizationMigrations);
    await runMigrationOnce(pool, 'canonical_tag_model_v1', runCanonicalTagModelMigration);
    await runMigrationOnce(pool, 'canonical_pipeline_stage_model_v1', runCanonicalPipelineStageModelMigration);
    await runMigrationOnce(pool, 'canonical_contact_email_identity_v1', runCanonicalContactEmailIdentityMigration);
    await runMigrationOnce(pool, 'public_form_contract_v1', runPublicFormContractMigration);
    await runMigrationOnce(
      pool,
      'public_form_submission_idempotency_v1',
      runPublicFormSubmissionIdempotencyMigration,
    );
    await runMigrationOnce(pool, 'deal_activity_contract_v1', runDealActivityMigration);
    
    // Billing and features
    await runMigrationOnce(pool, 'module_subscriptions', runAllSubscriptionMigrations);
    await runMigrationOnce(pool, 'organization_billing_columns_v2', ensureOrganizationBillingColumns);
    await runMigrationOnce(pool, 'free_owner_seat_v1', async (p) => {
      await p.query(`
        UPDATE organizations
        SET users_limit = 1, updated_at = CURRENT_TIMESTAMP
        WHERE plan = 'free' AND COALESCE(users_limit, 0) < 1;
      `);
      return true;
    });
    await runMigrationOnce(
      pool,
      'organization_allowance_v1',
      runOrganizationAllowanceMigration,
    );
    await runMigrationOnce(pool, 'subscription_webhook_idempotency', runSubscriptionWebhookMigration);
    await runMigrationOnce(pool, 'subscription_webhook_notification_outbox', runSubscriptionWebhookNotificationOutboxMigration);
    await runMigrationOnce(pool, 'subscription_webhook_reconciliation', runSubscriptionWebhookReconciliationMigration);
    await runMigrationOnce(pool, 'module_esignatures', runAllESignatureMigrations);
    await runMigrationOnce(pool, 'module_esignatures_mvp_plus', runESignatureMvpPlusMigrations);
    await runMigrationOnce(pool, 'signature_delivery_outbox', runSignatureDeliveryMigration);
    await runMigrationOnce(pool, 'signature_file_deletion_jobs', runSignatureFileDeletionMigration);
    await runMigrationOnce(pool, 'signature_completion_jobs', runSignatureCompletionMigration);
    await runMigrationOnce(pool, 'signature_evidence_retention', runSignatureEvidenceRetentionMigration);
    await runMigrationOnce(pool, 'signature_reliability_v1', runSignatureReliabilityMigration);
    await runMigrationOnce(
      pool,
      'signature_public_response_receipts_v1',
      runSignaturePublicResponseMigration,
    );
    await runMigrationOnce(
      pool,
      'signature_creation_receipts_v1',
      runSignatureCreationReceiptMigration,
    );
    await runMigrationOnce(pool, 'module_vault', runVaultMigrations);
    
    // Admin email communications - extend email_logs for admin use
    await runMigrationOnce(pool, 'admin_email_logs_columns', async (p) => {
      // Make organization_id nullable for system-wide admin emails
      await p.query(`
        DO $$ 
        BEGIN 
          -- Make organization_id nullable if it's currently NOT NULL
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'email_logs' AND column_name = 'organization_id'
            AND is_nullable = 'NO'
          ) THEN
            ALTER TABLE email_logs ALTER COLUMN organization_id DROP NOT NULL;
          END IF;
        END $$;
      `);
      
      // Add recipient_name column
      await p.query(`
        ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255);
      `);
      
      // Add recipient_id column for user ID (different from contact_id)
      await p.query(`
        ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      `);
      
      // Add sent_by column for admin user who sent the email
      await p.query(`
        ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
      `);
      
      // Add created_at column if missing (some older schemas use only queued_at)
      await p.query(`
        ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      `);
      
      // Ensure recipient_email column exists (maps to to_email in existing schema)
      await p.query(`
        ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(255);
      `);
      
      // Create indexes for admin queries
      await p.query(`
        CREATE INDEX IF NOT EXISTS idx_email_logs_sent_by ON email_logs(sent_by);
        CREATE INDEX IF NOT EXISTS idx_email_logs_recipient_id ON email_logs(recipient_id);
        CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);
      `);
      
      console.log('✅ Admin email logs columns migration complete');
      return true;
    });
    await runMigrationOnce(pool, 'admin_email_deliveries', runAdminEmailDeliveryMigration);
    await runMigrationOnce(pool, 'message_deliveries', runMessageDeliveryMigration);
    await runMigrationOnce(
      pool,
      'message_delivery_conversation_link_v1',
      runMessageDeliveryConversationLinkMigration,
    );

    const elapsed = Date.now() - startTime;
    console.log(`✅ Database initialized successfully in ${elapsed}ms`);
    return true;
  } catch (error) {
    console.error('Error initializing database schema:', error);
    return false;
  }
};

// Retry helper for database operations
const retryDbOperation = async (operation, maxRetries = 3, delayMs = 1000) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isTimeout = error.message && (
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT') ||
        error.code === 'ETIMEDOUT'
      );
      
      // Only retry on timeout errors or connection errors
      if (isTimeout || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        if (attempt < maxRetries) {
          console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`, error.message);
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt)); // Exponential backoff
          continue;
        }
      }
      // For non-retryable errors, throw immediately
      throw error;
    }
  }
  throw lastError;
};

// User operations
module.exports = {
  createDbConnection,
  initializeDatabase
};
