/**
 * Social Media Integration Database Migrations
 * Tables for Facebook/Instagram messaging and connections
 */

/**
 * Create social_channels table
 * Stores connected Facebook Pages and Instagram accounts
 */
async function createSocialChannelsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS social_channels (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Channel type
                channel_type VARCHAR(20) NOT NULL CHECK (channel_type IN ('facebook', 'instagram', 'whatsapp', 'twitter')),
                
                -- Account info
                external_id VARCHAR(100) NOT NULL,
                name VARCHAR(255) NOT NULL,
                username VARCHAR(100),
                profile_picture_url VARCHAR(500),
                
                -- Facebook Page specific
                page_id VARCHAR(100),
                page_access_token TEXT,
                
                -- Instagram specific
                instagram_business_account_id VARCHAR(100),
                
                -- User token (for refreshing)
                user_id VARCHAR(100),
                user_access_token TEXT,
                token_expires_at TIMESTAMP WITH TIME ZONE,
                
                -- Permissions
                permissions TEXT[],
                
                -- Status
                is_active BOOLEAN DEFAULT TRUE,
                is_connected BOOLEAN DEFAULT TRUE,
                connection_error TEXT,
                last_synced_at TIMESTAMP WITH TIME ZONE,
                
                -- Webhook
                webhook_verified BOOLEAN DEFAULT FALSE,
                
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(organization_id, channel_type, external_id)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_channels_org ON social_channels(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_channels_type ON social_channels(channel_type)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_channels_external ON social_channels(external_id)
        `);

        console.log('✅ social_channels table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create social_conversations table
 * Stores conversations from social media
 */
async function createSocialConversationsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS social_conversations (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                channel_id INTEGER NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
                
                -- External IDs
                thread_id VARCHAR(100),
                
                -- Participant info
                participant_id VARCHAR(100) NOT NULL,
                participant_name VARCHAR(255),
                participant_username VARCHAR(100),
                participant_profile_pic VARCHAR(500),
                
                -- Contact linking
                contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
                
                -- Status
                status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending', 'spam')),
                
                -- Assignment
                assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
                
                -- Counts
                unread_count INTEGER DEFAULT 0,
                message_count INTEGER DEFAULT 0,
                
                -- Last message
                last_message_text TEXT,
                last_message_at TIMESTAMP WITH TIME ZONE,
                last_message_from VARCHAR(20),
                
                -- Tags
                tags TEXT[],
                
                -- Timestamps
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(channel_id, participant_id)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_conversations_org ON social_conversations(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_conversations_channel ON social_conversations(channel_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_conversations_status ON social_conversations(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_conversations_assigned ON social_conversations(assigned_to)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_conversations_contact ON social_conversations(contact_id)
        `);

        console.log('✅ social_conversations table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create social_messages table
 * Stores messages from social media conversations
 */
async function createSocialMessagesTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS social_messages (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                conversation_id INTEGER NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
                channel_id INTEGER NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
                
                -- External ID
                external_message_id VARCHAR(100),
                
                -- Message content
                message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'sticker', 'story_mention', 'story_reply', 'reaction')),
                text_content TEXT,
                
                -- Media
                media_url VARCHAR(500),
                media_type VARCHAR(50),
                media_filename VARCHAR(255),
                
                -- Direction
                direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
                
                -- Sender info
                sender_id VARCHAR(100),
                sender_name VARCHAR(255),
                
                -- For outbound
                sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                
                -- Status
                status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
                error_message TEXT,
                
                -- Timestamps
                message_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                read_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_messages_conversation ON social_messages(conversation_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_messages_channel ON social_messages(channel_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_messages_external ON social_messages(external_message_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_messages_timestamp ON social_messages(message_timestamp)
        `);

        console.log('✅ social_messages table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Run all social migrations
 */
async function runAllSocialMigrations(pool) {
    console.log('Running social media migrations...');
    
    await createSocialChannelsTable(pool);
    await createSocialConversationsTable(pool);
    await createSocialMessagesTable(pool);
    
    console.log('✅ All social media migrations completed');
}

module.exports = {
    runAllSocialMigrations,
    createSocialChannelsTable,
    createSocialConversationsTable,
    createSocialMessagesTable
};
