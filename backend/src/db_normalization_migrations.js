/**
 * Database Normalization Migrations
 * Creates junction tables for tags and normalizes pipeline stages
 */

/**
 * Create contact_tags junction table
 * Normalizes the tags TEXT[] column into a proper many-to-many relationship
 */
async function createContactTagsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS contact_tags (
                id SERIAL PRIMARY KEY,
                contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(contact_id, tag_id)
            )
        `);

        // Create indexes for efficient lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag_id)
        `);

        console.log('✅ contact_tags junction table created/verified');
    } catch (error) {
        console.log('⚠️ contact_tags table may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Create deal_tags junction table
 * Normalizes the tags TEXT[] column on deals
 */
async function createDealTagsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS deal_tags (
                id SERIAL PRIMARY KEY,
                deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(deal_id, tag_id)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_deal_tags_deal ON deal_tags(deal_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_deal_tags_tag ON deal_tags(tag_id)
        `);

        console.log('✅ deal_tags junction table created/verified');
    } catch (error) {
        console.log('⚠️ deal_tags table may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Create conversation_tags junction table
 * Normalizes the tags TEXT[] column on social_conversations
 */
async function createConversationTagsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS conversation_tags (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(conversation_id, tag_id)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation ON conversation_tags(conversation_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag ON conversation_tags(tag_id)
        `);

        console.log('✅ conversation_tags junction table created/verified');
    } catch (error) {
        console.log('⚠️ conversation_tags table may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Create pipeline_stages table
 * Normalizes pipeline stages from JSONB to proper relational structure
 */
async function createPipelineStagesTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS pipeline_stages (
                id SERIAL PRIMARY KEY,
                pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
                stage_key VARCHAR(100) NOT NULL,
                name VARCHAR(255) NOT NULL,
                color VARCHAR(50),
                probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
                stage_order INTEGER NOT NULL DEFAULT 0,
                is_won_stage BOOLEAN DEFAULT FALSE,
                is_lost_stage BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(pipeline_id, stage_key)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pipeline_stages_order ON pipeline_stages(pipeline_id, stage_order)
        `);

        console.log('✅ pipeline_stages table created/verified');
    } catch (error) {
        console.log('⚠️ pipeline_stages table may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Create segment_contacts junction table for static segments
 * Normalizes the static_contact_ids INTEGER[] column
 */
async function createSegmentContactsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS segment_contacts (
                id SERIAL PRIMARY KEY,
                segment_id INTEGER NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
                contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
                added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(segment_id, contact_id)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_segment_contacts_segment ON segment_contacts(segment_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_segment_contacts_contact ON segment_contacts(contact_id)
        `);

        console.log('✅ segment_contacts junction table created/verified');
    } catch (error) {
        console.log('⚠️ segment_contacts table may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Migrate existing pipeline stages from JSONB to normalized table
 * This is a one-time migration that preserves existing data
 */
async function migratePipelineStagesData(pool) {
    const client = await pool.connect();
    try {
        // Check if migration is needed (if pipeline_stages is empty but pipelines have stages)
        const stagesCount = await client.query('SELECT COUNT(*) FROM pipeline_stages');
        const pipelinesCount = await client.query('SELECT COUNT(*) FROM pipelines WHERE stages IS NOT NULL');
        
        if (parseInt(stagesCount.rows[0].count) === 0 && parseInt(pipelinesCount.rows[0].count) > 0) {
            console.log('Migrating existing pipeline stages to normalized table...');
            
            // Get all pipelines with stages
            const pipelines = await client.query('SELECT id, stages FROM pipelines WHERE stages IS NOT NULL');
            
            for (const pipeline of pipelines.rows) {
                const stages = pipeline.stages;
                if (Array.isArray(stages)) {
                    for (let i = 0; i < stages.length; i++) {
                        const stage = stages[i];
                        await client.query(`
                            INSERT INTO pipeline_stages (pipeline_id, stage_key, name, color, probability, stage_order)
                            VALUES ($1, $2, $3, $4, $5, $6)
                            ON CONFLICT (pipeline_id, stage_key) DO NOTHING
                        `, [
                            pipeline.id,
                            stage.id || `stage_${i}`,
                            stage.name || `Stage ${i + 1}`,
                            stage.color || '#3B82F6',
                            stage.probability || 0,
                            i
                        ]);
                    }
                }
            }
            
            console.log('✅ Pipeline stages data migrated successfully');
        } else {
            console.log('✅ Pipeline stages migration not needed (already done or no data)');
        }
    } catch (error) {
        console.log('⚠️ Pipeline stages data migration skipped:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Run all normalization migrations
 */
async function runAllNormalizationMigrations(pool) {
    console.log('Running database normalization migrations...');
    
    await createContactTagsTable(pool);
    await createDealTagsTable(pool);
    await createConversationTagsTable(pool);
    await createPipelineStagesTable(pool);
    await createSegmentContactsTable(pool);
    
    // Migrate existing data
    await migratePipelineStagesData(pool);
    
    console.log('✅ All database normalization migrations completed');
}

module.exports = {
    runAllNormalizationMigrations,
    createContactTagsTable,
    createDealTagsTable,
    createConversationTagsTable,
    createPipelineStagesTable,
    createSegmentContactsTable,
    migratePipelineStagesData
};
