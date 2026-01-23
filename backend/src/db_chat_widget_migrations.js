/**
 * Chat Widget Database Migrations
 * Tables for live chat widget configuration and sessions
 */

/**
 * Create chat_widgets table
 * Stores widget configuration for each organization
 */
async function createChatWidgetsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_widgets (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Widget identification
                widget_key VARCHAR(64) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL DEFAULT 'Chat Widget',
                
                -- Appearance
                primary_color VARCHAR(7) DEFAULT '#3B82F6',
                text_color VARCHAR(7) DEFAULT '#FFFFFF',
                position VARCHAR(20) DEFAULT 'bottom-right',
                icon_style VARCHAR(20) DEFAULT 'chat',
                custom_icon_url VARCHAR(500),
                
                -- Welcome message
                welcome_title VARCHAR(255) DEFAULT 'Hi there! 👋',
                welcome_message TEXT DEFAULT 'How can we help you today?',
                placeholder_text VARCHAR(255) DEFAULT 'Type your message...',
                
                -- Pre-chat form settings
                require_email BOOLEAN DEFAULT TRUE,
                require_name BOOLEAN DEFAULT TRUE,
                require_phone BOOLEAN DEFAULT FALSE,
                custom_fields JSONB DEFAULT '[]',
                
                -- Behavior
                is_active BOOLEAN DEFAULT TRUE,
                auto_open_delay INTEGER DEFAULT 0,
                show_branding BOOLEAN DEFAULT TRUE,
                notification_sound BOOLEAN DEFAULT TRUE,
                
                -- Business hours (null = always available)
                business_hours JSONB,
                offline_message TEXT DEFAULT 'We are currently offline. Please leave a message and we will get back to you.',
                
                -- Routing
                default_assigned_to INTEGER REFERENCES users(id),
                auto_assign_available BOOLEAN DEFAULT FALSE,
                
                -- Stats
                total_conversations INTEGER DEFAULT 0,
                total_messages INTEGER DEFAULT 0,
                
                -- Allowed domains (empty = allow all)
                allowed_domains TEXT[] DEFAULT '{}',
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create index for widget key lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_widgets_widget_key ON chat_widgets(widget_key)
        `);
        
        // Create index for organization
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_widgets_organization ON chat_widgets(organization_id)
        `);
        
        console.log('✅ chat_widgets table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create chat_sessions table
 * Stores anonymous visitor sessions for the chat widget
 */
async function createChatSessionsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                widget_id INTEGER NOT NULL REFERENCES chat_widgets(id) ON DELETE CASCADE,
                
                -- Session identification
                session_token VARCHAR(64) UNIQUE NOT NULL,
                
                -- Visitor info (from pre-chat form or detected)
                visitor_name VARCHAR(255),
                visitor_email VARCHAR(255),
                visitor_phone VARCHAR(50),
                custom_data JSONB DEFAULT '{}',
                
                -- Visitor metadata
                ip_address VARCHAR(45),
                user_agent TEXT,
                referrer_url TEXT,
                current_page_url TEXT,
                
                -- Geo data (if available)
                country VARCHAR(100),
                city VARCHAR(100),
                timezone VARCHAR(100),
                
                -- Link to contact (if converted)
                contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
                conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
                
                -- Status
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'ended', 'converted')),
                is_online BOOLEAN DEFAULT TRUE,
                last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- Timestamps
                started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMP WITH TIME ZONE,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_token ON chat_sessions(session_token)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_widget ON chat_sessions(widget_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_org ON chat_sessions(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_email ON chat_sessions(visitor_email)
        `);
        
        console.log('✅ chat_sessions table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create chat_messages table
 * Stores messages in widget chat sessions
 */
async function createChatMessagesTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Sender (either visitor or agent)
                sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('visitor', 'agent', 'system')),
                sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                
                -- Content
                content TEXT NOT NULL,
                content_type VARCHAR(20) DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'file', 'system')),
                
                -- File attachment (if any)
                attachment_url VARCHAR(500),
                attachment_name VARCHAR(255),
                attachment_size INTEGER,
                
                -- Status
                is_read BOOLEAN DEFAULT FALSE,
                read_at TIMESTAMP WITH TIME ZONE,
                
                -- Timestamps
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_messages_org ON chat_messages(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at)
        `);
        
        console.log('✅ chat_messages table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Add chat channel to conversations if not exists
 */
async function addChatChannelToConversations(pool) {
    const client = await pool.connect();
    try {
        // Check if 'chat' is already in the channel constraint
        const result = await client.query(`
            SELECT constraint_name 
            FROM information_schema.constraint_column_usage 
            WHERE table_name = 'conversations' AND constraint_name LIKE '%channel%'
        `);
        
        // Try to add 'chat' to the allowed channels
        // This is a safe operation that will fail silently if the constraint doesn't exist or already includes 'chat'
        try {
            await client.query(`
                ALTER TABLE conversations 
                DROP CONSTRAINT IF EXISTS conversations_channel_check
            `);
            await client.query(`
                ALTER TABLE conversations 
                ADD CONSTRAINT conversations_channel_check 
                CHECK (channel IN ('email', 'sms', 'internal', 'chat', 'whatsapp', 'facebook', 'instagram'))
            `);
            console.log('✅ Added chat channel to conversations');
        } catch (e) {
            // Constraint might not exist or different structure - that's okay
            console.log('ℹ️ Channel constraint update skipped (may already be flexible)');
        }
    } finally {
        client.release();
    }
}

/**
 * Run all chat widget migrations
 */
async function runAllChatWidgetMigrations(pool) {
    console.log('Running chat widget migrations...');
    
    await createChatWidgetsTable(pool);
    await createChatSessionsTable(pool);
    await createChatMessagesTable(pool);
    await addChatChannelToConversations(pool);
    
    console.log('✅ All chat widget migrations completed');
}

module.exports = {
    runAllChatWidgetMigrations,
    createChatWidgetsTable,
    createChatSessionsTable,
    createChatMessagesTable,
    addChatChannelToConversations
};
