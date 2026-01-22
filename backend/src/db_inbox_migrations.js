/**
 * Inbox Database Migrations
 * Schema for conversations and messages
 */

/**
 * Create conversations table
 */
const runConversationsMigration = async (pool) => {
    console.log('Running conversations table migration...');

    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        
        -- Assignment
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        -- Status
        status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'snoozed')),
        snoozed_until TIMESTAMP WITH TIME ZONE,
        
        -- Metadata
        channel VARCHAR(50) DEFAULT 'internal',
        subject VARCHAR(500),
        last_message_at TIMESTAMP WITH TIME ZONE,
        last_message_preview TEXT,
        unread_count INTEGER DEFAULT 0,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Conversations table created');

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON conversations(organization_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON conversations(assigned_to);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);`);
        console.log('✅ Conversations indexes created');

        return true;
    } catch (error) {
        console.error('❌ Conversations migration failed:', error.message);
        return false;
    }
};

/**
 * Create messages table
 */
const runMessagesMigration = async (pool) => {
    console.log('Running messages table migration...');

    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        
        -- Sender
        sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('user', 'contact', 'system')),
        sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        sender_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        
        -- Content
        channel VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        content_html TEXT,
        
        -- Metadata
        metadata JSONB DEFAULT '{}'::jsonb,
        is_read BOOLEAN DEFAULT FALSE,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Messages table created');

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_org_id ON messages(organization_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);`);
        console.log('✅ Messages indexes created');

        return true;
    } catch (error) {
        console.error('❌ Messages migration failed:', error.message);
        return false;
    }
};

/**
 * Run all inbox migrations
 */
const runAllInboxMigrations = async (pool) => {
    console.log('=== Starting Inbox Migrations ===');

    await runConversationsMigration(pool);
    await runMessagesMigration(pool);

    console.log('=== Inbox Migrations Complete ===');
    return true;
};

module.exports = {
    runConversationsMigration,
    runMessagesMigration,
    runAllInboxMigrations,
};
