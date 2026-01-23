/**
 * Email Campaign Database Migrations
 * Tables for email campaigns and campaign analytics
 */

/**
 * Create email_campaigns table
 */
async function createEmailCampaignsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS email_campaigns (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Campaign info
                name VARCHAR(255) NOT NULL,
                subject VARCHAR(500) NOT NULL,
                from_name VARCHAR(255),
                from_email VARCHAR(255),
                reply_to VARCHAR(255),
                
                -- Content
                template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
                content_html TEXT,
                content_text TEXT,
                
                -- Targeting
                segment_type VARCHAR(50) DEFAULT 'all' CHECK (segment_type IN ('all', 'tag', 'status', 'custom', 'segment')),
                segment_filter JSONB DEFAULT '{}',
                tag_ids INTEGER[] DEFAULT '{}',
                excluded_tag_ids INTEGER[] DEFAULT '{}',
                
                -- Status
                status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'failed')),
                
                -- Scheduling
                scheduled_at TIMESTAMP WITH TIME ZONE,
                send_immediately BOOLEAN DEFAULT FALSE,
                timezone VARCHAR(100) DEFAULT 'UTC',
                
                -- A/B Testing
                is_ab_test BOOLEAN DEFAULT FALSE,
                ab_variants JSONB,
                ab_winner_criteria VARCHAR(50),
                ab_test_duration_hours INTEGER DEFAULT 4,
                
                -- Stats (updated after send)
                total_recipients INTEGER DEFAULT 0,
                total_sent INTEGER DEFAULT 0,
                total_delivered INTEGER DEFAULT 0,
                total_opened INTEGER DEFAULT 0,
                total_clicked INTEGER DEFAULT 0,
                total_bounced INTEGER DEFAULT 0,
                total_unsubscribed INTEGER DEFAULT 0,
                total_complained INTEGER DEFAULT 0,
                
                -- Rates (calculated)
                open_rate DECIMAL(5,2) DEFAULT 0,
                click_rate DECIMAL(5,2) DEFAULT 0,
                bounce_rate DECIMAL(5,2) DEFAULT 0,
                
                -- Metadata
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                
                -- Timestamps
                started_at TIMESTAMP WITH TIME ZONE,
                completed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_email_campaigns_org ON email_campaigns(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled ON email_campaigns(scheduled_at) 
            WHERE status = 'scheduled'
        `);

        console.log('✅ email_campaigns table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create campaign_recipients table
 * Tracks individual recipients for a campaign
 */
async function createCampaignRecipientsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS campaign_recipients (
                id SERIAL PRIMARY KEY,
                campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
                contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Recipient info (snapshot at send time)
                email VARCHAR(255) NOT NULL,
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                
                -- Status
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed', 'complained')),
                
                -- Tracking
                sent_at TIMESTAMP WITH TIME ZONE,
                delivered_at TIMESTAMP WITH TIME ZONE,
                opened_at TIMESTAMP WITH TIME ZONE,
                clicked_at TIMESTAMP WITH TIME ZONE,
                bounced_at TIMESTAMP WITH TIME ZONE,
                unsubscribed_at TIMESTAMP WITH TIME ZONE,
                
                -- Engagement
                open_count INTEGER DEFAULT 0,
                click_count INTEGER DEFAULT 0,
                clicked_links JSONB DEFAULT '[]',
                
                -- Error tracking
                error_message TEXT,
                bounce_type VARCHAR(50),
                
                -- External IDs
                email_log_id INTEGER REFERENCES email_logs(id) ON DELETE SET NULL,
                external_message_id VARCHAR(255),
                
                -- A/B variant (if applicable)
                ab_variant VARCHAR(10),
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(campaign_id, contact_id)
            )
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact ON campaign_recipients(contact_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email ON campaign_recipients(email)
        `);

        console.log('✅ campaign_recipients table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create campaign_links table
 * Tracks links in campaigns for click tracking
 */
async function createCampaignLinksTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS campaign_links (
                id SERIAL PRIMARY KEY,
                campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
                
                -- Link info
                original_url TEXT NOT NULL,
                tracking_url VARCHAR(500),
                link_text VARCHAR(500),
                link_position INTEGER,
                
                -- Stats
                total_clicks INTEGER DEFAULT 0,
                unique_clicks INTEGER DEFAULT 0,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_campaign_links_campaign ON campaign_links(campaign_id)
        `);

        console.log('✅ campaign_links table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Add unsubscribed field to contacts if not exists
 */
async function addUnsubscribedToContacts(pool) {
    const client = await pool.connect();
    try {
        // Check if column exists
        const result = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'contacts' AND column_name = 'email_unsubscribed'
        `);

        if (result.rows.length === 0) {
            await client.query(`
                ALTER TABLE contacts 
                ADD COLUMN email_unsubscribed BOOLEAN DEFAULT FALSE,
                ADD COLUMN email_unsubscribed_at TIMESTAMP WITH TIME ZONE,
                ADD COLUMN email_bounced BOOLEAN DEFAULT FALSE,
                ADD COLUMN email_bounce_type VARCHAR(50)
            `);
            console.log('✅ Added email subscription fields to contacts');
        } else {
            console.log('ℹ️ Email subscription fields already exist on contacts');
        }
    } finally {
        client.release();
    }
}

/**
 * Run all campaign migrations
 */
async function runAllCampaignMigrations(pool) {
    console.log('Running email campaign migrations...');
    
    await createEmailCampaignsTable(pool);
    await createCampaignRecipientsTable(pool);
    await createCampaignLinksTable(pool);
    await addUnsubscribedToContacts(pool);
    
    console.log('✅ All email campaign migrations completed');
}

module.exports = {
    runAllCampaignMigrations,
    createEmailCampaignsTable,
    createCampaignRecipientsTable,
    createCampaignLinksTable,
    addUnsubscribedToContacts
};
