const fs = require('fs');
const path = require('path');
const {
    discoverExpectedMigrationMarkers,
    discoverExpectedTables,
} = require('../../../scripts/initialize-test-database');

describe('test database schema contract', () => {
    test('production Docker context includes the numbered migration stream', () => {
        const dockerIgnore = fs.readFileSync(
            path.resolve(__dirname, '../../../.dockerignore'),
            'utf8'
        );
        const ignoredPaths = dockerIgnore
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));

        expect(ignoredPaths).not.toContain('scripts/migrations/');
        expect(ignoredPaths).not.toContain('scripts/migrations');
    });

    test('discovers the application migration tables used by integration tests', () => {
        const tables = discoverExpectedTables();
        expect(tables).toEqual(expect.arrayContaining([
            '_migrations',
            'bookings',
            'calendar_external_busy_intervals',
            'contacts',
            'deal_activities',
            'email_webhook_events',
            'invoices',
            'organization_members',
            'organizations',
            'payments',
            'realtime_event_outbox',
            'sms_receiving_numbers',
            'social_webhook_events',
            'stripe_subscription_webhook_events',
            'users',
            'workflow_side_effect_outbox',
            'workflow_triggers',
            'workflows',
        ]));
        expect(tables.length).toBeGreaterThan(70);
    });

    test('discovers every top-level initializer marker', () => {
        const markers = discoverExpectedMigrationMarkers();
        expect(markers).toEqual(expect.arrayContaining([
            'core_users_table',
            'users_email_password_auth',
            'feature_onboarding',
            'deal_activity_contract_v1',
            'module_crm',
            'realtime_event_outbox',
            'shared_revocation_realtime_outbox',
            'workspace_shared_revocation_realtime_outbox',
            'email_webhook_events',
            'email_webhook_reconciliation',
            'workflow_webhook_idempotency',
            'workflow_registry',
            'workflow_side_effect_outbox',
            'workflow_trigger_queue',
            'workflow_schedules',
            'workflow_execution_claims',
            'workflow_lifecycle',
            'workflow_sms_reconciliation',
            'sms_webhook_idempotency',
            'sms_receiving_number_registry',
            'social_webhook_idempotency',
            'social_webhook_reconciliation',
            'subscription_webhook_idempotency',
            'subscription_webhook_notification_outbox',
            'subscription_webhook_reconciliation',
            'module_invoicing',
            'booking_availability_policy',
            'booking_public_capabilities',
            'calendar_token_encryption',
            'calendar_sync_jobs',
            'module_estimates_recurring',
            'estimates_business_column',
            'module_subscriptions',
        ]));
        expect(markers.length).toBeGreaterThan(20);
    });

    test('fresh integration runs cannot inherit live provider credentials', () => {
        const { buildTestEnvironment } = require('../../../scripts/run-integration-tests-fresh');
        const environment = buildTestEnvironment({
            AWS_ACCESS_KEY_ID: 'live-aws',
            GEMINI_API_KEY: 'live-ai',
            FACEBOOK_APP_SECRET: 'live-meta',
            FACEBOOK_WEBHOOK_VERIFY_TOKEN: 'live-meta-verify',
            CALENDAR_TOKEN_ENCRYPTION_KEYS: '{"live":"secret"}',
            CALENDAR_TOKEN_ACTIVE_KEY_ID: 'live',
            RESEND_API_KEY: 'live-email',
            RESEND_WEBHOOK_SECRET: 'live-email-webhook',
            STRIPE_SECRET_KEY: 'live-stripe',
            TWILIO_AUTH_TOKEN: 'live-sms',
        });

        expect(environment).toMatchObject({
            AWS_ACCESS_KEY_ID: '',
            FACEBOOK_APP_SECRET: '',
            FACEBOOK_WEBHOOK_VERIFY_TOKEN: '',
            CALENDAR_TOKEN_ENCRYPTION_KEYS: '',
            CALENDAR_TOKEN_ACTIVE_KEY_ID: '',
            GEMINI_API_KEY: '',
            MARKETING_CHAT_AI_ENABLED: 'false',
            RESEND_API_KEY: '',
            RESEND_WEBHOOK_SECRET: '',
            STRIPE_SECRET_KEY: '',
            TWILIO_AUTH_TOKEN: '',
        });
    });

    test('production migration stream creates the Stripe event claim table', async () => {
        const migration = require('../../../scripts/migrations/006_stripe_webhook_idempotency');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        expect(pool.query.mock.calls.some(([sql]) => sql.includes('CREATE TABLE IF NOT EXISTS stripe_webhook_events')))
            .toBe(true);
    });

    test('production migration stream creates durable workflow webhook claims', async () => {
        const migration = require('../../../scripts/migrations/007_workflow_webhook_idempotency');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS workflow_triggers');
        expect(sql).toContain('idx_workflow_triggers_delivery');
    });

    test('production migration stream creates leased workflow provider delivery claims', async () => {
        const migration = require('../../../scripts/migrations/018_workflow_side_effect_outbox');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS workflow_side_effect_outbox');
        expect(sql).toContain('lease_expires_at');
        expect(sql).toContain("'dead_letter'");
        expect(sql).toContain('idx_workflow_side_effect_outbox_queue');
        expect(sql).toContain('workflow_side_effect_id');
    });

    test('production migration stream installs the canonical workflow trigger constraint', async () => {
        const migration = require('../../../scripts/migrations/019_workflow_registry');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('workflows_trigger_type_check');
        expect(sql).toContain("'booking_created'");
        expect(sql).toContain("'invoice_paid'");
        expect(sql).toContain("'contract_signed'");
        expect(sql).not.toContain("'contact_created'");
    });

    test('production migration stream upgrades workflow triggers into a leased queue', async () => {
        const migration = require('../../../scripts/migrations/020_workflow_trigger_queue');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('lease_expires_at');
        expect(sql).toContain("'dead_letter'");
        expect(sql).toContain('idx_workflow_triggers_queue');
        expect(sql).toContain('idx_workflow_triggers_event_key');
        expect(sql).toContain('workflow_triggers_trigger_type_check');
    });

    test('production migration stream persists one-shot workflow schedules', async () => {
        const migration = require('../../../scripts/migrations/021_workflow_schedules');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('scheduled_contact_id');
        expect(sql).toContain('next_trigger_at');
        expect(sql).toContain('last_triggered_at');
        expect(sql).toContain('idx_workflows_scheduled_due');
    });

    test('production migration stream adds durable workflow execution claims', async () => {
        const migration = require('../../../scripts/migrations/022_workflow_execution_claims');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('execution_attempt_count');
        expect(sql).toContain('execution_claim_token');
        expect(sql).toContain('execution_lease_expires_at');
        expect(sql).toContain('idx_workflow_enrollments_execution_due');
    });

    test('production migration stream defines workflow lifecycle policy state', async () => {
        const migration = require('../../../scripts/migrations/023_workflow_lifecycle');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('pause_reason');
        expect(sql).toContain('paused_at');
        expect(sql).toContain('operator_retry_count');
        expect(sql).toContain('last_operator_retry_at');
        expect(sql).toContain("'cancelled'");
    });

    test('production migration stream creates the deal transition ledger', async () => {
        const migration = require('../../../scripts/migrations/025_deal_activity_contract');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS deal_activities');
        expect(sql).toContain('deals_terminal_state_check');
        expect(sql).toContain('deal_activities_deal_org_fk');
        expect(sql).toContain("'deal_won'");
        expect(sql).toContain("'deal_reopened'");
    });

    test('production migration stream installs the canonical pipeline-stage contract', () => {
        const migration = require('../../../scripts/migrations/026_canonical_pipeline_stage_contract');
        const {
            runCanonicalPipelineStageModelMigration,
        } = require('../../db_pipeline_stage_canonical_migrations');

        expect(migration.up).toBe(runCanonicalPipelineStageModelMigration);
    });

    test('production migration stream installs the public form contract', () => {
        const migration = require('../../../scripts/migrations/027_public_form_contract');
        const {
            runPublicFormContractMigration,
        } = require('../../db_public_form_contract_migrations');

        expect(migration.up).toBe(runPublicFormContractMigration);
    });

    test('production migration stream creates the durable realtime bridge', async () => {
        const migration = require('../../../scripts/migrations/028_realtime_outbox');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS realtime_event_outbox');
        expect(sql).toContain('lease_expires_at');
        expect(sql).toContain("'dead_letter'");
        expect(sql).toContain('idx_realtime_event_outbox_queue');
        expect(sql).toContain('realtime_event_outbox_channel_event_check');
        expect(sql).toContain('CHECK (aggregate_id > 0)');
        expect(sql).toContain("CHECK (jsonb_typeof(payload) = 'object')");
    });

    test('production migration stream extends realtime delivery to whiteboards', async () => {
        const migration = require('../../../scripts/migrations/029_whiteboard_realtime_outbox');
        const {
            runWhiteboardRealtimeOutboxMigration,
        } = require('../../db_realtime_outbox_migrations');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        expect(migration.up).toBe(runWhiteboardRealtimeOutboxMigration);
        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain("'whiteboard'");
        expect(sql).toContain("'shared_whiteboard'");
        expect(sql).toContain("'whiteboardUpdated'");
    });

    test('production migration stream extends realtime delivery to wireframes', async () => {
        const migration = require('../../../scripts/migrations/046_wireframe_realtime_outbox');
        const {
            runWireframeRealtimeOutboxMigration,
        } = require('../../db_realtime_outbox_migrations');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        expect(migration.up).toBe(runWireframeRealtimeOutboxMigration);
        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain("'wireframe'");
        expect(sql).toContain("'shared_wireframe'");
        expect(sql).toContain("'userWireframeUpdated'");
    });

    test('production migration stream adds durable sharing revocation', async () => {
        const migration = require('../../../scripts/migrations/048_workspace_shared_revocation_realtime_outbox');
        const {
            runSharedRevocationRealtimeOutboxMigration,
        } = require('../../db_realtime_outbox_migrations');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        expect(migration.up).toBe(runSharedRevocationRealtimeOutboxMigration);
        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain("'shared_revocation'");
        expect(sql).toContain("'sharedContentRevoked'");
        expect(sql).toContain("'wireframe'");
        expect(sql).toContain(
            "aggregate_type IN ('list', 'note', 'whiteboard', 'wireframe')"
        );
    });

    test('production migration stream installs landing-page version storage', async () => {
        const migration = require('../../../scripts/migrations/049_landing_page_versions');
        const client = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn(),
        };
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await migration.up(pool);
        const sql = client.query.mock.calls
            .map(([statement]) => statement)
            .join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS page_versions');
        expect(sql).toContain('ADD COLUMN IF NOT EXISTS current_version_id');
        expect(sql).toContain('pages_current_version_id_fkey');
        expect(sql).toContain('idx_pages_version');
        expect(client.query).toHaveBeenLastCalledWith('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });

    test('production migration stream installs encrypted vault storage', async () => {
        const migration = require('../../../scripts/migrations/050_vault_storage');
        const client = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn(),
        };
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await migration.up(pool);
        const sql = client.query.mock.calls
            .map(([statement]) => statement)
            .join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS vaults');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS vault_items');
        expect(sql).toContain('idx_vault_items_order');
        expect(sql).toContain('trigger_vault_item_updated_at');
        expect(client.query).toHaveBeenLastCalledWith('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });

    test('production migration stream installs authoritative booking availability', async () => {
        const migration = require('../../../scripts/migrations/030_booking_availability_policy');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS calendar_external_busy_intervals');
        expect(sql).toContain('calendar_external_busy_interval_tenant');
        expect(sql).toContain('CREATE OR REPLACE FUNCTION booking_slot_policy_reason');
        expect(sql).toContain('CREATE OR REPLACE FUNCTION booking_available_slots');
        expect(sql).toContain("'DST_TRANSITION'");
        expect(sql).toContain("'EXTERNAL_BUSY'");
    });

    test('production migration stream installs public booking capabilities', async () => {
        const migration = require('../../../scripts/migrations/031_booking_public_capabilities');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('public_id');
        expect(sql).toContain('idx_calendars_public_id');
        expect(sql).toContain("digest(cancellation_token, 'sha256')");
        expect(sql).toContain('cancellation_token_hash');
        expect(sql).toContain('cancellation_token_expires_at');
        expect(sql).toContain('bookings_raw_cancellation_token_forbidden');
    });

    test('production migration stream encrypts calendar provider credentials', async () => {
        const migration = require('../../../scripts/migrations/032_calendar_token_encryption');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('token_generation');
        expect(sql).toContain('calendar_connections_access_token_encrypted');
        expect(sql).toContain('calendar_connections_refresh_token_encrypted');
        expect(sql).toContain('calendar_connections_provider_account_identity');
    });

    test('production migration stream creates durable calendar sync jobs', async () => {
        const migration = require('../../../scripts/migrations/033_calendar_sync_jobs');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS calendar_sync_jobs');
        expect(sql).toContain('lease_expires_at');
        expect(sql).toContain('idx_calendar_sync_jobs_active_connection');
        expect(sql).toContain('calendar_sync_job_tenant');
        expect(sql).toContain('idx_calendar_sync_events_booking');
    });

    test('production startup requires the latest numbered migration marker', () => {
        const startupSource = fs.readFileSync(
            path.resolve(__dirname, '../../index.js'),
            'utf8'
        );

        expect(startupSource).toContain(
            "WHERE version = '050_vault_storage'"
        );
    });

    test('production migration stream creates durable review-request delivery intents', async () => {
        const migration = require('../../../scripts/migrations/040_reputation_request_deliveries');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS review_request_delivery_batches');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS review_request_deliveries');
        expect(sql).toContain('review_request_delivery_tenant');
        expect(sql).toContain('review_request_active_delivery');
    });

    test('production migration stream creates durable bulk campaign delivery intents', async () => {
        const migration = require('../../../scripts/migrations/039_campaign_deliveries');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS campaign_delivery_jobs');
        expect(sql).toContain('campaign_delivery_job_idempotency');
        expect(sql).toContain('delivery_lease_expires_at');
        expect(sql).toContain('idx_campaign_recipients_delivery_claim');
        expect(sql).toContain('campaign_recipient_delivery_job_tenant');
        expect(sql).toContain("'reconciliation_required'");
    });

    test('production migration stream creates durable campaign test-email intents', async () => {
        const migration = require('../../../scripts/migrations/038_campaign_test_email_deliveries');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS campaign_test_email_deliveries');
        expect(sql).toContain('campaign_test_email_delivery_idempotency');
        expect(sql).toContain('idx_campaign_test_email_deliveries_claim');
        expect(sql).toContain('campaign_test_email_delivery_tenant');
        expect(sql).toContain("'reconciliation_required'");
    });

    test('production migration stream creates durable estimate email delivery intents', async () => {
        const migration = require('../../../scripts/migrations/034_estimate_email_deliveries');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS estimate_email_deliveries');
        expect(sql).toContain('reconciliation_required');
        expect(sql).toContain('estimate_email_delivery_idempotency');
        expect(sql).toContain('estimate_email_delivery_tenant');
    });

    test('production migration stream creates durable invoice email delivery intents', async () => {
        const migration = require('../../../scripts/migrations/035_invoice_email_deliveries');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS invoice_email_deliveries');
        expect(sql).toContain('reconciliation_required');
        expect(sql).toContain('invoice_email_delivery_idempotency');
        expect(sql).toContain('idx_invoice_email_deliveries_active');
        expect(sql).toContain('invoice_email_delivery_tenant');
    });

    test('production migration stream creates durable invoice payment-link intents', async () => {
        const migration = require('../../../scripts/migrations/036_invoice_payment_link_intents');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS invoice_payment_link_intents');
        expect(sql).toContain('reconciliation_required');
        expect(sql).toContain('invoice_payment_link_intent_idempotency');
        expect(sql).toContain('idx_invoice_payment_link_intents_active');
        expect(sql).toContain('invoice_payment_link_intent_tenant');
    });

    test('production migration stream creates durable invoice logo cleanup jobs', async () => {
        const migration = require('../../../scripts/migrations/037_invoice_logo_deletion_jobs');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS invoice_logo_deletion_jobs');
        expect(sql).toContain('invoice_logo_deletion_identity');
        expect(sql).toContain('idx_invoice_logo_deletion_jobs_claim');
        expect(sql).toContain('invoice_logo_deletion_tenant');
        expect(sql).toContain("'dead_letter'");
    });

    test('production migration stream quarantines ambiguous workflow SMS attempts', async () => {
        const migration = require('../../../scripts/migrations/024_workflow_sms_reconciliation');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('reconciliation_required_at');
        expect(sql).toContain('last_reconciliation_action');
        expect(sql).toContain('ALTER COLUMN status TYPE VARCHAR(32)');
        expect(sql).toContain("'reconciliation_required'");
        expect(sql).toContain('idx_workflow_side_effect_outbox_reconciliation');
    });

    test('production migration stream creates durable SMS webhook claims', async () => {
        const migration = require('../../../scripts/migrations/008_sms_webhook_idempotency');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS sms_webhook_events');
        expect(sql).toContain('idx_sms_webhook_events_external_id');
    });

    test('production migration stream creates the organization receiving-number registry', async () => {
        const migration = require('../../../scripts/migrations/017_sms_receiving_number_registry');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS sms_receiving_numbers');
        expect(sql).toContain('phone_number VARCHAR(20) NOT NULL UNIQUE');
        expect(sql).toContain('sms_webhook_events_processing_status_check');
        expect(sql).toContain("'unmatched_receiver'");
    });

    test('production migration stream preserves saved campaign segment targeting', async () => {
        const migration = require('../../../scripts/migrations/009_campaign_segment_targeting');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('ADD COLUMN IF NOT EXISTS segment_id INTEGER');
        expect(sql).toContain('email_campaigns_segment_id_fkey');
        expect(sql).toContain('idx_email_campaigns_segment_id');
    });

    test('production migration stream creates replay-safe email provider events', async () => {
        const migration = require('../../../scripts/migrations/010_email_webhook_events');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS email_webhook_events');
        expect(sql).toContain('svix_id VARCHAR(255) PRIMARY KEY');
        expect(sql).toContain('email_bounced_at');
    });

    test('production migration stream creates leased email-event reconciliation', async () => {
        const migration = require('../../../scripts/migrations/015_email_webhook_reconciliation');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('reconciliation_attempt_count');
        expect(sql).toContain('reconciliation_lease_expires_at');
        expect(sql).toContain("'dead_letter'");
    });

    test('production migration stream creates durable Meta message claims', async () => {
        const migration = require('../../../scripts/migrations/011_social_webhook_idempotency');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS social_webhook_events');
        expect(sql).toContain('event_key VARCHAR(255) PRIMARY KEY');
        expect(sql).toContain('idx_social_messages_channel_external_unique');
    });

    test('production migration stream creates leased Meta replay queues', async () => {
        const migration = require('../../../scripts/migrations/016_social_webhook_reconciliation');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('work_lease_expires_at');
        expect(sql).toContain('reconciliation_lease_expires_at');
        expect(sql).toContain("'dead_letter'");
        expect(sql).toContain('idx_social_webhook_events_reconciliation_queue');
    });

    test('production migration stream creates durable Stripe subscription claims', async () => {
        const migration = require('../../../scripts/migrations/012_subscription_webhook_idempotency');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS stripe_subscription_webhook_events');
        expect(sql).toContain('stripe_event_id VARCHAR(100) PRIMARY KEY');
        expect(sql).toContain('subscription_provider_updated_at');
    });

    test('production migration stream creates the Stripe subscription notification outbox', async () => {
        const migration = require('../../../scripts/migrations/013_subscription_webhook_notification_outbox');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('notification_attempt_count');
        expect(sql).toContain('notification_lease_expires_at');
        expect(sql).toContain("'dead_letter'");
    });

    test('production migration stream creates the signature delivery outbox', async () => {
        const migration = require('../../../scripts/migrations/042_signature_delivery_outbox');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS signature_delivery_outbox');
        expect(sql).toContain('idx_signature_delivery_outbox_claim');
        expect(sql).toContain('idempotency_key VARCHAR(255) NOT NULL UNIQUE');
        expect(sql).toContain("'dead_letter'");
    });

    test('production migration stream creates durable signature file deletion jobs', async () => {
        const migration = require('../../../scripts/migrations/043_signature_file_deletion_jobs');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS signature_file_deletion_jobs');
        expect(sql).toContain('signature_file_deletion_identity');
        expect(sql).toContain('idx_signature_file_deletion_jobs_claim');
    });

    test('production migration stream creates durable signature completion jobs', async () => {
        const migration = require('../../../scripts/migrations/044_signature_completion_jobs');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS signature_completion_jobs');
        expect(sql).toContain('idx_signature_completion_jobs_claim');
        expect(sql).toContain("'document_completed'");
        expect(sql).toContain("'signature_declined'");
    });

    test('production migration stream preserves cleanup authority after tenant deletion', async () => {
        const migration = require('../../../scripts/migrations/045_signature_evidence_retention');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain(
            'DROP CONSTRAINT IF EXISTS signature_file_deletion_jobs_organization_id_fkey'
        );
        expect(sql).toContain('cleanup authority survives organization deletion');
    });

    test('production migration stream creates replayable Stripe subscription reconciliation', async () => {
        const migration = require('../../../scripts/migrations/014_subscription_webhook_reconciliation');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        const sql = pool.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('event_snapshot JSONB');
        expect(sql).toContain('reconciliation_lease_expires_at');
        expect(sql).toContain('subscription_provider_event_id');
    });
});
