/**
 * Landing Page Builder Database Migrations
 * Tables for pages, page_sections, and page_analytics
 */

/**
 * Create pages table
 * Main table for landing pages
 */
async function createPagesTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS pages (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

                -- Page info
                name VARCHAR(255) NOT NULL,
                description TEXT,
                slug VARCHAR(255) NOT NULL,

                -- Status
                status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),

                -- SEO Settings
                seo_title VARCHAR(255),
                seo_description VARCHAR(500),
                seo_keywords TEXT,
                og_image VARCHAR(500),
                favicon_url VARCHAR(500),

                -- Theme settings
                theme JSONB DEFAULT '{
                    "primaryColor": "#3B82F6",
                    "secondaryColor": "#1E40AF",
                    "backgroundColor": "#FFFFFF",
                    "textColor": "#1F2937",
                    "fontFamily": "Inter",
                    "headingFont": "Inter",
                    "borderRadius": 8,
                    "spacing": "normal"
                }'::jsonb,

                -- Custom code
                custom_css TEXT,
                custom_js TEXT,
                custom_head TEXT,

                -- Settings
                settings JSONB DEFAULT '{
                    "showNavbar": false,
                    "showFooter": false,
                    "enableAnalytics": true,
                    "password": null,
                    "expiresAt": null
                }'::jsonb,

                -- Versioning
                current_version_id INTEGER REFERENCES page_versions(id) ON DELETE SET NULL,

                -- Stats (cached for performance)
                view_count INTEGER DEFAULT 0,
                unique_visitors INTEGER DEFAULT 0,

                -- Timestamps
                published_at TIMESTAMP WITH TIME ZONE,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

                UNIQUE(organization_id, slug)
            )
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pages_org ON pages(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pages_org_slug ON pages(organization_id, slug)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pages_version ON pages(current_version_id) WHERE current_version_id IS NOT NULL
        `);

        console.log('✅ pages table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Add current_version_id column to existing pages table (if running migration on existing DB)
 */
async function addVersionIdToPages(pool) {
    const client = await pool.connect();
    try {
        // Check if column exists
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'pages' AND column_name = 'current_version_id'
        `);

        if (columnCheck.rows.length === 0) {
            await client.query(`
                ALTER TABLE pages ADD COLUMN current_version_id INTEGER REFERENCES page_versions(id) ON DELETE SET NULL
            `);
            await client.query(`
                CREATE INDEX idx_pages_version ON pages(current_version_id) WHERE current_version_id IS NOT NULL
            `);
            console.log('✅ Added current_version_id to pages table');
        } else {
            console.log('✅ current_version_id column already exists');
        }
    } finally {
        client.release();
    }
}

/**
 * Create page_sections table
 * Stores individual sections/blocks for each page
 */
async function createPageSectionsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS page_sections (
                id SERIAL PRIMARY KEY,
                page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Section type
                section_type VARCHAR(50) NOT NULL CHECK (section_type IN (
                    'hero', 'text', 'image', 'video', 'form', 'cta', 
                    'testimonials', 'pricing', 'faq', 'features', 
                    'gallery', 'countdown', 'html', 'divider', 'social',
                    'header', 'footer', 'columns', 'spacer', 'button',
                    'logo_cloud', 'stats', 'team', 'contact', 'map'
                )),
                
                -- Section name/label for builder UI
                name VARCHAR(255),
                
                -- Content (section-specific data)
                content JSONB NOT NULL DEFAULT '{}'::jsonb,
                
                -- Settings (visibility, animation, styling)
                settings JSONB DEFAULT '{
                    "visible": true,
                    "animation": "none",
                    "paddingTop": 40,
                    "paddingBottom": 40,
                    "paddingLeft": 20,
                    "paddingRight": 20,
                    "backgroundColor": null,
                    "backgroundImage": null,
                    "backgroundOverlay": null,
                    "maxWidth": "1200px",
                    "fullWidth": false
                }'::jsonb,
                
                -- Order
                section_order INTEGER NOT NULL DEFAULT 0,
                
                -- Timestamps
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_sections_page ON page_sections(page_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_sections_order ON page_sections(page_id, section_order)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_sections_type ON page_sections(section_type)
        `);

        console.log('✅ page_sections table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create page_analytics table
 * Tracks page views and visitor data
 */
async function createPageAnalyticsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS page_analytics (
                id SERIAL PRIMARY KEY,
                page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Visitor identification
                visitor_id VARCHAR(100),
                session_id VARCHAR(100),
                
                -- Request info
                ip_address VARCHAR(50),
                user_agent TEXT,
                referrer VARCHAR(500),
                
                -- UTM parameters
                utm_source VARCHAR(100),
                utm_medium VARCHAR(100),
                utm_campaign VARCHAR(100),
                utm_term VARCHAR(100),
                utm_content VARCHAR(100),
                
                -- Device info
                device_type VARCHAR(20) CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
                browser VARCHAR(50),
                os VARCHAR(50),
                
                -- Location (from IP)
                country VARCHAR(100),
                region VARCHAR(100),
                city VARCHAR(100),
                
                -- Engagement
                time_on_page INTEGER DEFAULT 0,
                scroll_depth INTEGER DEFAULT 0,
                
                -- Conversion
                converted BOOLEAN DEFAULT FALSE,
                conversion_type VARCHAR(50),
                conversion_value DECIMAL(10,2),
                
                -- Timestamps
                viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                left_at TIMESTAMP WITH TIME ZONE
            )
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_analytics_page ON page_analytics(page_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_analytics_org ON page_analytics(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_analytics_viewed ON page_analytics(viewed_at)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_analytics_visitor ON page_analytics(visitor_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_analytics_session ON page_analytics(session_id)
        `);

        console.log('✅ page_analytics table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create page_versions table
 * Stores version history for staging and rollback
 */
async function createPageVersionsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS page_versions (
                id SERIAL PRIMARY KEY,
                page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,

                -- Version number (incrementing)
                version_number INTEGER NOT NULL,

                -- Page content snapshot
                content JSONB NOT NULL,

                -- Version metadata
                description TEXT,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

                -- Publishing info
                published_at TIMESTAMP WITH TIME ZONE,
                is_current BOOLEAN DEFAULT FALSE,

                -- Timestamps
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

                UNIQUE(page_id, version_number)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_versions_page ON page_versions(page_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_versions_version ON page_versions(page_id, version_number)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_versions_created ON page_versions(created_at)
        `);

        console.log('✅ page_versions table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create page_templates table
 * Stores reusable page templates
 */
async function createPageTemplatesTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS page_templates (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Template info
                name VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(50) DEFAULT 'general',
                thumbnail_url VARCHAR(500),
                
                -- Template content
                sections JSONB NOT NULL DEFAULT '[]'::jsonb,
                theme JSONB,
                settings JSONB,
                
                -- Access
                is_public BOOLEAN DEFAULT FALSE,
                is_system BOOLEAN DEFAULT FALSE,
                
                -- Stats
                use_count INTEGER DEFAULT 0,
                
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_templates_org ON page_templates(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_templates_public ON page_templates(is_public) WHERE is_public = TRUE
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_templates_category ON page_templates(category)
        `);

        console.log('✅ page_templates table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Run all page migrations
 */
async function runAllPagesMigrations(pool) {
    console.log('Running landing page migrations...');

    await createPagesTable(pool);
    await createPageSectionsTable(pool);
    await createPageAnalyticsTable(pool);
    await createPageTemplatesTable(pool);
    await createPageVersionsTable(pool);

    // Add columns to existing tables
    await addVersionIdToPages(pool);

    console.log('✅ All landing page migrations completed');
}

module.exports = {
    runAllPagesMigrations,
    createPagesTable,
    createPageSectionsTable,
    createPageAnalyticsTable,
    createPageTemplatesTable,
    createPageVersionsTable,
    addVersionIdToPages
};
