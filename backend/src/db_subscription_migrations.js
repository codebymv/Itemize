/**
 * Subscription Migrations
 * Creates tables for subscription management, feature gating, and usage tracking
 */

const { logger } = require('./utils/logger');

/**
 * Create subscription_plans table
 * Defines available subscription tiers and their features/limits
 */
const createSubscriptionPlansTable = async (pool) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS subscription_plans (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                display_name VARCHAR(100) NOT NULL,
                description TEXT,
                tier_level INTEGER NOT NULL DEFAULT 1,
                price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
                price_yearly DECIMAL(10,2) NOT NULL DEFAULT 0,
                stripe_price_id_monthly VARCHAR(100),
                stripe_price_id_yearly VARCHAR(100),
                features JSONB DEFAULT '{}'::jsonb,
                limits JSONB DEFAULT '{}'::jsonb,
                is_active BOOLEAN DEFAULT true,
                is_default BOOLEAN DEFAULT false,
                trial_days INTEGER DEFAULT 14,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        logger.info('subscription_plans table created');
        return true;
    } catch (error) {
        if (error.code === '42P07') {
            logger.info('subscription_plans table already exists');
            return true;
        }
        logger.error('Error creating subscription_plans table', { error: error.message });
        throw error;
    }
};

/**
 * Create subscriptions table
 * Tracks organization subscriptions and Stripe integration
 */
const createSubscriptionsTable = async (pool) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                plan_id INTEGER REFERENCES subscription_plans(id),
                status VARCHAR(50) NOT NULL DEFAULT 'trialing',
                stripe_customer_id VARCHAR(100),
                stripe_subscription_id VARCHAR(100) UNIQUE,
                billing_period VARCHAR(20) DEFAULT 'monthly',
                current_period_start TIMESTAMP WITH TIME ZONE,
                current_period_end TIMESTAMP WITH TIME ZONE,
                trial_start TIMESTAMP WITH TIME ZONE,
                trial_end TIMESTAMP WITH TIME ZONE,
                canceled_at TIMESTAMP WITH TIME ZONE,
                cancel_at_period_end BOOLEAN DEFAULT false,
                pause_collection JSONB,
                metadata JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(organization_id)
            )
        `);
        
        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_subscriptions_org_id ON subscriptions(organization_id);
            CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
            CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
            CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);
        `);
        
        logger.info('subscriptions table created');
        return true;
    } catch (error) {
        if (error.code === '42P07') {
            logger.info('subscriptions table already exists');
            return true;
        }
        logger.error('Error creating subscriptions table', { error: error.message });
        throw error;
    }
};

/**
 * Create usage_tracking table
 * Tracks resource usage per organization per period
 */
const createUsageTrackingTable = async (pool) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usage_tracking (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                resource_type VARCHAR(50) NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                count INTEGER DEFAULT 0,
                limit_value INTEGER,
                overage_allowed BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(organization_id, resource_type, period_start)
            )
        `);
        
        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_usage_tracking_org ON usage_tracking(organization_id);
            CREATE INDEX IF NOT EXISTS idx_usage_tracking_resource ON usage_tracking(resource_type);
            CREATE INDEX IF NOT EXISTS idx_usage_tracking_period ON usage_tracking(period_start, period_end);
        `);
        
        logger.info('usage_tracking table created');
        return true;
    } catch (error) {
        if (error.code === '42P07') {
            logger.info('usage_tracking table already exists');
            return true;
        }
        logger.error('Error creating usage_tracking table', { error: error.message });
        throw error;
    }
};

/**
 * Create subscription_events table
 * Audit trail for subscription changes
 */
const createSubscriptionEventsTable = async (pool) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS subscription_events (
                id SERIAL PRIMARY KEY,
                subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
                organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
                event_type VARCHAR(100) NOT NULL,
                previous_plan_id INTEGER REFERENCES subscription_plans(id),
                new_plan_id INTEGER REFERENCES subscription_plans(id),
                stripe_event_id VARCHAR(100),
                metadata JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_sub_events_subscription ON subscription_events(subscription_id);
            CREATE INDEX IF NOT EXISTS idx_sub_events_org ON subscription_events(organization_id);
            CREATE INDEX IF NOT EXISTS idx_sub_events_type ON subscription_events(event_type);
            CREATE INDEX IF NOT EXISTS idx_sub_events_stripe ON subscription_events(stripe_event_id);
        `);
        
        logger.info('subscription_events table created');
        return true;
    } catch (error) {
        if (error.code === '42P07') {
            logger.info('subscription_events table already exists');
            return true;
        }
        logger.error('Error creating subscription_events table', { error: error.message });
        throw error;
    }
};

/**
 * Add subscription fields to organizations table
 * Following gleamai pattern - store subscription data directly on organization
 */
const addOrganizationSubscriptionFields = async (pool) => {
    try {
        // === Core Stripe Fields ===
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100)
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100)
        `);
        
        // === Plan & Status Fields ===
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'starter'
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'none'
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS billing_period VARCHAR(20) DEFAULT 'monthly'
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMP WITH TIME ZONE
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMP WITH TIME ZONE
        `);
        
        // === Trial Fields ===
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE
        `);
        
        // === Usage Tracking Fields (Monthly Counters) ===
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS emails_used INTEGER DEFAULT 0
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS emails_limit INTEGER DEFAULT 1000
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS sms_used INTEGER DEFAULT 0
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS sms_limit INTEGER DEFAULT 500
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS api_calls_used INTEGER DEFAULT 0
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS api_calls_limit INTEGER DEFAULT 0
        `);
        
        // === Limit Fields (Set Based on Plan) ===
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS contacts_limit INTEGER DEFAULT 5000
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS users_limit INTEGER DEFAULT 3
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS workflows_limit INTEGER DEFAULT 5
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS landing_pages_limit INTEGER DEFAULT 10
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS forms_limit INTEGER DEFAULT 10
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS calendars_limit INTEGER DEFAULT 3
        `);
        
        // === Legacy field for backward compatibility ===
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS current_plan_id INTEGER REFERENCES subscription_plans(id)
        `);
        
        // === Features Override (for manual unlocks) ===
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS features_override JSONB DEFAULT '{}'::jsonb
        `);
        
        // === Cancellation Fields ===
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false
        `);
        
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITH TIME ZONE
        `);
        
        // === Create Indexes ===
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_org_subscription_status ON organizations(subscription_status)
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_org_plan ON organizations(plan)
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_org_stripe_customer ON organizations(stripe_customer_id)
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_org_stripe_subscription ON organizations(stripe_subscription_id)
        `);
        
        logger.info('Organization subscription fields added');
        return true;
    } catch (error) {
        logger.error('Error adding organization subscription fields', { error: error.message });
        throw error;
    }
};

/**
 * Seed default subscription plans
 */
const seedSubscriptionPlans = async (pool) => {
    try {
        // Check if plans already exist
        const existingPlans = await pool.query('SELECT COUNT(*) FROM subscription_plans');
        if (parseInt(existingPlans.rows[0].count) > 0) {
            logger.info('Subscription plans already seeded');
            return true;
        }
        
        // Insert default plans
        await pool.query(`
            INSERT INTO subscription_plans (name, display_name, description, tier_level, price_monthly, price_yearly, features, limits, is_default, trial_days, sort_order)
            VALUES 
            (
                'starter',
                'Starter',
                'Perfect for solo operators and small businesses getting started',
                1,
                97.00,
                970.00,
                '{"contacts": true, "pipelines": true, "calendars": true, "forms": true, "landing_pages": true, "email_templates": true, "sms_templates": true, "conversations": true, "basic_automation": true, "api_access": false, "advanced_workflows": false, "white_label": false, "saas_mode": false, "priority_support": false}'::jsonb,
                '{"organizations": 3, "contacts_per_org": 5000, "users_per_org": 3, "workflows": 5, "emails_per_month": 1000, "sms_per_month": 500, "landing_pages": 10, "api_calls_per_day": 0}'::jsonb,
                true,
                14,
                1
            ),
            (
                'unlimited',
                'Agency Unlimited',
                'For growing agencies managing multiple clients',
                2,
                297.00,
                2970.00,
                '{"contacts": true, "pipelines": true, "calendars": true, "forms": true, "landing_pages": true, "email_templates": true, "sms_templates": true, "conversations": true, "basic_automation": true, "api_access": true, "advanced_workflows": true, "white_label": true, "saas_mode": false, "priority_support": false, "unlimited_orgs": true, "custom_domains": true}'::jsonb,
                '{"organizations": -1, "contacts_per_org": 25000, "users_per_org": 10, "workflows": 25, "emails_per_month": 10000, "sms_per_month": 5000, "landing_pages": 50, "api_calls_per_day": 10000}'::jsonb,
                false,
                14,
                2
            ),
            (
                'pro',
                'SaaS Pro',
                'Build your own SaaS business with white-label and reselling',
                3,
                497.00,
                4970.00,
                '{"contacts": true, "pipelines": true, "calendars": true, "forms": true, "landing_pages": true, "email_templates": true, "sms_templates": true, "conversations": true, "basic_automation": true, "api_access": true, "advanced_workflows": true, "white_label": true, "saas_mode": true, "priority_support": true, "unlimited_orgs": true, "custom_domains": true, "client_billing": true, "mobile_white_label": true, "dedicated_support": true}'::jsonb,
                '{"organizations": -1, "contacts_per_org": -1, "users_per_org": -1, "workflows": -1, "emails_per_month": 50000, "sms_per_month": 25000, "landing_pages": -1, "api_calls_per_day": 100000}'::jsonb,
                false,
                14,
                3
            )
            ON CONFLICT (name) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                tier_level = EXCLUDED.tier_level,
                price_monthly = EXCLUDED.price_monthly,
                price_yearly = EXCLUDED.price_yearly,
                features = EXCLUDED.features,
                limits = EXCLUDED.limits,
                trial_days = EXCLUDED.trial_days,
                sort_order = EXCLUDED.sort_order,
                updated_at = CURRENT_TIMESTAMP
        `);
        
        logger.info('Default subscription plans seeded');
        return true;
    } catch (error) {
        logger.error('Error seeding subscription plans', { error: error.message });
        throw error;
    }
};

/**
 * Run all subscription migrations
 */
const runAllSubscriptionMigrations = async (pool) => {
    logger.info('Running subscription migrations...');
    
    try {
        await createSubscriptionPlansTable(pool);
        await createSubscriptionsTable(pool);
        await createUsageTrackingTable(pool);
        await createSubscriptionEventsTable(pool);
        await addOrganizationSubscriptionFields(pool);
        await seedSubscriptionPlans(pool);
        
        logger.info('All subscription migrations completed successfully');
        return true;
    } catch (error) {
        logger.error('Subscription migrations failed', { error: error.message });
        throw error;
    }
};

module.exports = {
    runAllSubscriptionMigrations,
    createSubscriptionPlansTable,
    createSubscriptionsTable,
    createUsageTrackingTable,
    createSubscriptionEventsTable,
    addOrganizationSubscriptionFields,
    seedSubscriptionPlans
};
