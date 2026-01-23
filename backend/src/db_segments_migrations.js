/**
 * Segments Database Migrations
 * Tables for saved contact segments with dynamic filtering
 */

/**
 * Create segments table
 * Stores saved segment definitions with filter rules
 */
async function createSegmentsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS segments (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Segment info
                name VARCHAR(255) NOT NULL,
                description TEXT,
                color VARCHAR(7) DEFAULT '#6366F1',
                icon VARCHAR(50) DEFAULT 'users',
                
                -- Filter configuration
                filter_type VARCHAR(20) DEFAULT 'and' CHECK (filter_type IN ('and', 'or')),
                filters JSONB NOT NULL DEFAULT '[]',
                
                -- Segment type
                segment_type VARCHAR(20) DEFAULT 'dynamic' CHECK (segment_type IN ('dynamic', 'static')),
                
                -- For static segments, store contact IDs
                static_contact_ids INTEGER[] DEFAULT '{}',
                
                -- Computed stats (updated periodically)
                contact_count INTEGER DEFAULT 0,
                last_calculated_at TIMESTAMP WITH TIME ZONE,
                
                -- Usage tracking
                is_active BOOLEAN DEFAULT TRUE,
                used_in_campaigns INTEGER DEFAULT 0,
                used_in_automations INTEGER DEFAULT 0,
                
                -- Metadata
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_segments_org ON segments(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_segments_active ON segments(is_active) WHERE is_active = TRUE
        `);

        console.log('✅ segments table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create segment_history table
 * Tracks changes in segment membership over time
 */
async function createSegmentHistoryTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS segment_history (
                id SERIAL PRIMARY KEY,
                segment_id INTEGER NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Snapshot
                contact_count INTEGER NOT NULL,
                calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- Changes from previous
                contacts_added INTEGER DEFAULT 0,
                contacts_removed INTEGER DEFAULT 0,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_segment_history_segment ON segment_history(segment_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_segment_history_date ON segment_history(calculated_at)
        `);

        console.log('✅ segment_history table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Run all segment migrations
 */
async function runAllSegmentMigrations(pool) {
    console.log('Running segment migrations...');
    
    await createSegmentsTable(pool);
    await createSegmentHistoryTable(pool);
    
    console.log('✅ All segment migrations completed');
}

module.exports = {
    runAllSegmentMigrations,
    createSegmentsTable,
    createSegmentHistoryTable
};
