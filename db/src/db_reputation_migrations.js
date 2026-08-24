/**
 * Reputation Management Database Migrations
 * Tables for review collection, tracking, and management
 */

/**
 * Create review_platforms table
 * Stores connected review platforms (Google, Facebook, Yelp, etc.)
 */
async function createReviewPlatformsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS review_platforms (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Platform info
                platform VARCHAR(50) NOT NULL CHECK (platform IN ('google', 'facebook', 'yelp', 'trustpilot', 'g2', 'capterra', 'custom')),
                platform_name VARCHAR(100),
                
                -- Connection details
                place_id VARCHAR(255),
                page_id VARCHAR(255),
                business_url VARCHAR(500),
                review_url VARCHAR(500),
                
                -- OAuth (for platforms that support it)
                access_token TEXT,
                refresh_token TEXT,
                token_expires_at TIMESTAMP WITH TIME ZONE,
                
                -- Stats (updated periodically)
                total_reviews INTEGER DEFAULT 0,
                average_rating DECIMAL(2,1) DEFAULT 0,
                last_synced_at TIMESTAMP WITH TIME ZONE,
                
                -- Status
                is_active BOOLEAN DEFAULT TRUE,
                is_connected BOOLEAN DEFAULT FALSE,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(organization_id, platform, place_id)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_review_platforms_org ON review_platforms(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_review_platforms_active ON review_platforms(is_active) WHERE is_active = TRUE
        `);

        console.log('✅ review_platforms table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create reviews table
 * Stores collected reviews from all platforms
 */
async function createReviewsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                platform_id INTEGER REFERENCES review_platforms(id) ON DELETE SET NULL,
                
                -- Platform identification
                platform VARCHAR(50) NOT NULL,
                external_review_id VARCHAR(255),
                
                -- Review content
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                review_text TEXT,
                
                -- Reviewer info
                reviewer_name VARCHAR(255),
                reviewer_email VARCHAR(255),
                reviewer_phone VARCHAR(50),
                reviewer_avatar_url VARCHAR(500),
                reviewer_profile_url VARCHAR(500),
                contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
                
                -- Status
                status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'read', 'responded', 'flagged', 'hidden')),
                
                -- Response
                response_text TEXT,
                responded_at TIMESTAMP WITH TIME ZONE,
                responded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                
                -- Internal notes
                internal_notes TEXT,
                
                -- Sentiment analysis
                sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'neutral', 'negative')),
                sentiment_score DECIMAL(3,2),
                
                -- Source
                source VARCHAR(20) DEFAULT 'sync' CHECK (source IN ('sync', 'manual', 'request', 'widget')),
                review_request_id INTEGER,
                
                -- Timestamps
                review_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(organization_id, platform, external_review_id)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_org ON reviews(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_platform ON reviews(platform_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(review_date)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_contact ON reviews(contact_id)
        `);

        console.log('✅ reviews table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create review_requests table
 * Stores review request campaigns sent to contacts
 */
async function createReviewRequestsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS review_requests (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
                
                -- Contact info snapshot
                contact_email VARCHAR(255),
                contact_phone VARCHAR(50),
                contact_name VARCHAR(255),
                
                -- Request details
                channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
                template_id INTEGER,
                
                -- Delivery
                email_sent BOOLEAN DEFAULT FALSE,
                email_sent_at TIMESTAMP WITH TIME ZONE,
                email_opened BOOLEAN DEFAULT FALSE,
                email_opened_at TIMESTAMP WITH TIME ZONE,
                
                sms_sent BOOLEAN DEFAULT FALSE,
                sms_sent_at TIMESTAMP WITH TIME ZONE,
                
                -- Response
                clicked BOOLEAN DEFAULT FALSE,
                clicked_at TIMESTAMP WITH TIME ZONE,
                rating_given INTEGER,
                review_submitted BOOLEAN DEFAULT FALSE,
                review_submitted_at TIMESTAMP WITH TIME ZONE,
                review_id INTEGER REFERENCES reviews(id) ON DELETE SET NULL,
                
                -- Platform preference
                preferred_platform VARCHAR(50),
                redirect_url VARCHAR(500),
                
                -- Status
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'opened', 'clicked', 'completed', 'failed', 'unsubscribed')),
                
                -- Scheduling
                scheduled_at TIMESTAMP WITH TIME ZONE,
                expires_at TIMESTAMP WITH TIME ZONE,
                
                -- Metadata
                custom_message TEXT,
                unique_token VARCHAR(100) UNIQUE,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_review_requests_org ON review_requests(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_review_requests_contact ON review_requests(contact_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_review_requests_token ON review_requests(unique_token)
        `);

        console.log('✅ review_requests table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create review_widgets table
 * Stores embeddable review display widget configuration
 */
async function createReviewWidgetsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS review_widgets (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Widget identification
                widget_key VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                
                -- Display settings
                widget_type VARCHAR(20) DEFAULT 'carousel' CHECK (widget_type IN ('carousel', 'grid', 'list', 'badge', 'floating')),
                theme VARCHAR(20) DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
                
                -- Styling
                primary_color VARCHAR(7) DEFAULT '#6366F1',
                background_color VARCHAR(7) DEFAULT '#FFFFFF',
                text_color VARCHAR(7) DEFAULT '#1F2937',
                border_radius INTEGER DEFAULT 8,
                show_rating_stars BOOLEAN DEFAULT TRUE,
                show_reviewer_photo BOOLEAN DEFAULT TRUE,
                show_review_date BOOLEAN DEFAULT TRUE,
                show_platform_icon BOOLEAN DEFAULT TRUE,
                
                -- Content filtering
                min_rating INTEGER DEFAULT 4,
                platforms TEXT[] DEFAULT '{}',
                max_reviews INTEGER DEFAULT 10,
                hide_no_text_reviews BOOLEAN DEFAULT FALSE,
                
                -- Auto-update
                auto_refresh BOOLEAN DEFAULT TRUE,
                refresh_interval_hours INTEGER DEFAULT 24,
                
                -- Status
                is_active BOOLEAN DEFAULT TRUE,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_review_widgets_org ON review_widgets(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_review_widgets_key ON review_widgets(widget_key)
        `);

        console.log('✅ review_widgets table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create reputation_settings table
 */
async function createReputationSettingsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS reputation_settings (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
                
                -- Auto-request settings
                auto_request_enabled BOOLEAN DEFAULT FALSE,
                auto_request_delay_days INTEGER DEFAULT 3,
                auto_request_channel VARCHAR(20) DEFAULT 'email',
                auto_request_trigger VARCHAR(50) DEFAULT 'deal_won',
                
                -- Templates
                email_template_id INTEGER,
                sms_template_text TEXT,
                
                -- Threshold routing
                negative_threshold INTEGER DEFAULT 3,
                negative_alert_email VARCHAR(255),
                negative_route_internal BOOLEAN DEFAULT TRUE,
                positive_route_url VARCHAR(500),
                
                -- Default platforms
                default_review_url VARCHAR(500),
                google_place_id VARCHAR(255),
                
                -- Notifications
                new_review_notify_email BOOLEAN DEFAULT TRUE,
                new_review_notify_slack BOOLEAN DEFAULT FALSE,
                slack_webhook_url VARCHAR(500),
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reputation_settings_org ON reputation_settings(organization_id)
        `);

        console.log('✅ reputation_settings table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Run all reputation migrations
 */
async function runAllReputationMigrations(pool) {
    console.log('Running reputation migrations...');
    
    await createReviewPlatformsTable(pool);
    await createReviewsTable(pool);
    await createReviewRequestsTable(pool);
    await createReviewWidgetsTable(pool);
    await createReputationSettingsTable(pool);
    
    console.log('✅ All reputation migrations completed');
}

module.exports = {
    runAllReputationMigrations,
    createReviewPlatformsTable,
    createReviewsTable,
    createReviewRequestsTable,
    createReviewWidgetsTable,
    createReputationSettingsTable
};
