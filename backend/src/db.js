const { Pool } = require('pg');

// Import database migrations
const { runCanvasMigration, runListResizeMigration, runCreateNotesTableMigration, runAddTitleAndCategoryToNotesMigration, runCategoriesTableMigration, runCategoriesDataMigration, runCleanupDefaultCategories, runSharingMigration, runWireframesMigration, runWireframesDimensionsMigration } = require('./db_migrations');

// Import CRM migrations
const { runAllCRMMigrations } = require('./db_crm_migrations');

// Import Automation migrations
const { runAllAutomationMigrations } = require('./db_automation_migrations');

// Import Calendar migrations
const { runAllCalendarMigrations } = require('./db_calendar_migrations');

// Import Forms migrations
const { runAllFormsMigrations } = require('./db_forms_migrations');

// Import Inbox migrations
const { runAllInboxMigrations } = require('./db_inbox_migrations');

// Import SMS migrations
const { runAllSmsMigrations } = require('./db_sms_migrations');

// Import Chat Widget migrations
const { runAllChatWidgetMigrations } = require('./db_chat_widget_migrations');

// Import Email Campaign migrations
const { runAllCampaignMigrations } = require('./db_campaign_migrations');

// Import Segments migrations
const { runAllSegmentMigrations } = require('./db_segments_migrations');

// Import Invoicing migrations
const { runAllInvoicingMigrations } = require('./db_invoicing_migrations');

// Import Estimates and Recurring migrations
const { runEstimatesRecurringMigrations } = require('./db_estimates_recurring_migrations');

// Import Reputation migrations
const { runAllReputationMigrations } = require('./db_reputation_migrations');

// Import Social migrations
const { runAllSocialMigrations } = require('./db_social_migrations');

// Import Pages migrations
const { runAllPagesMigrations } = require('./db_pages_migrations');

// Import Index migrations (performance optimization)
const { runAllIndexMigrations } = require('./db_indexes_migrations');

// Import Normalization migrations (schema improvements)
const { runAllNormalizationMigrations } = require('./db_normalization_migrations');

// Import Subscription migrations (feature gating and billing)
const { runAllSubscriptionMigrations } = require('./db_subscription_migrations');

// Import Vault migrations (encrypted storage)
const { runVaultMigrations } = require('./db_vault_migrations');

// In-memory storage fallbacks if database fails
const inMemoryUsers = [];
const inMemoryLists = [];
let useInMemory = false;

// Connection configuration with better error handling
const createDbConnection = () => {
  try {
    // Check if DATABASE_URL is provided
    const dbUrl = process.env.DATABASE_URL;
    console.log('Starting database connection with URL:', dbUrl ? 'URL provided' : 'No URL found');

    if (!dbUrl) {
      console.warn('DATABASE_URL not found in environment. Using in-memory storage.');
      useInMemory = true;
      return null;
    }

    // For Railway deployments, we need to parse the connection info more granularly
    let connectionConfig;

    try {
      // Try to extract host from connection string to log it for debugging
      const matches = dbUrl.match(/postgresql:\/\/.*?@([^:]+)(:[0-9]+)?/);
      if (matches && matches[1]) {
        const host = matches[1];
        console.log(`Attempting to connect to host: ${host}`);

        // Try to resolve the host to its IP addresses for debugging
        require('dns').lookup(host, { all: true }, (err, addresses) => {
          if (err) {
            console.error('DNS lookup error:', err.message);
          } else {
            console.log('Host resolves to:', addresses.map(a => `${a.address} (${a.family === 4 ? 'IPv4' : 'IPv6'})`).join(', '));
          }
        });
      }
    } catch (err) {
      console.log('Could not parse host from connection string:', err.message);
    }

    // Create a connection pool with more robust timeout settings
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: {
        rejectUnauthorized: false // Required for Supabase connections
      },
      // More robust connection settings to handle network latency
      max: 5,                     // Increase max connections slightly
      min: 1,                     // Keep at least 1 connection alive
      idleTimeoutMillis: 30000,   // 30 seconds idle timeout (increased)
      connectionTimeoutMillis: 30000, // 30 seconds connection timeout (increased from 10s)
      statement_timeout: 30000,   // 30 seconds statement timeout (increased)
      query_timeout: 30000,      // 30 seconds query timeout (increased)
      acquireTimeoutMillis: 30000, // 30 seconds to acquire connection from pool
    });

    // Set up event handlers
    pool.on('connect', (client) => {
      console.log('✅ Connected to PostgreSQL database successfully');
      console.log(`📊 Pool stats: Total=${pool.totalCount}, Idle=${pool.idleCount}, Waiting=${pool.waitingCount}`);
      useInMemory = false;
    });

    pool.on('error', (err, client) => {
      console.error('❌ Database pool error:', err.message);
      console.error('📊 Pool stats at error:', `Total=${pool.totalCount}, Idle=${pool.idleCount}, Waiting=${pool.waitingCount}`);

      // Don't crash the application on pool errors
      if (err.code === 'ENETUNREACH' || err.code === 'ENOTFOUND') {
        console.warn('🌐 Network unreachable or host not found. Switching to in-memory storage.');
        useInMemory = true;
      } else if (err.message && err.message.includes('timeout')) {
        console.warn('⏰ Database connection timeout detected. Pool may be exhausted.');
      }
    });

    pool.on('acquire', (client) => {
      console.log('🔗 Client acquired from pool');
    });

    pool.on('release', (client) => {
      console.log('🔓 Client released back to pool');
    });

    // Test the connection immediately
    console.log('Testing database connection...');
    pool.query('SELECT 1 as health_check')
      .then(() => {
        console.log('✅ Database connection test successful');
        useInMemory = false;
      })
      .catch((err) => {
        console.error('❌ Database connection test failed:', err.message, err.stack);
        console.warn('Switching to in-memory storage');
        useInMemory = true;
      });

    return pool;
  } catch (error) {
    console.error('Error setting up database connection:', error);
    return null;
  }
};

// Create database tables if they don't exist
const initializeDatabase = async (pool) => {
  if (!pool) {
    console.log('No database connection, using in-memory storage');
    return false;
  }

  try {
    // Create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        google_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);









    // Add missing columns to users table if they don't exist
    try {
      // Run canvas feature migration
      await runCanvasMigration(pool);

      // Run list resize feature migration
      await runListResizeMigration(pool);

      // Run notes table migration
      await runCreateNotesTableMigration(pool);

      // Run notes name and category migration
      await runAddTitleAndCategoryToNotesMigration(pool);

      // Run categories table migration (safe)
      try {
        await runCategoriesTableMigration(pool);
      } catch (categoriesTableError) {
        console.error('⚠️ Categories table migration failed, continuing with legacy categories:', categoriesTableError.message);
      }

      // Run categories data migration (safe)
      try {
        await runCategoriesDataMigration(pool);
      } catch (categoriesDataError) {
        console.error('⚠️ Categories data migration failed, continuing with legacy categories:', categoriesDataError.message);
      }

      // Run cleanup of default categories (safe)
      try {
        await runCleanupDefaultCategories(pool);
      } catch (cleanupError) {
        console.error('⚠️ Categories cleanup failed, continuing with existing categories:', cleanupError.message);
      }

      // Run sharing feature migration (safe)
      try {
        await runSharingMigration(pool);
      } catch (sharingError) {
        console.error('⚠️ Sharing migration failed, continuing without sharing feature:', sharingError.message);
      }

      await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);`);
      // console.log('Ensured google_id column exists in public.users table.');
    } catch (e) {
      console.error('Error ensuring google_id column exists:', e);
      throw e; // Re-throw if altering the table fails for unexpected reasons
    }

    try {
      await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);
      // console.log('Ensured updated_at column exists in public.users table.');
    } catch (e) {
      console.error('Error ensuring updated_at column exists:', e);
      throw e; // Re-throw if altering the table fails for unexpected reasons
    }

    // Create lists table if it doesn't exist (with all columns including migration additions)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.lists (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(255) DEFAULT 'General',
        type VARCHAR(255) DEFAULT 'General',
        items JSONB DEFAULT '[]'::jsonb,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        color_value VARCHAR(50) DEFAULT '#3B82F6',
        position_x FLOAT DEFAULT 0,
        position_y FLOAT DEFAULT 0,
        width FLOAT DEFAULT 320,
        height FLOAT,
        z_index INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        share_token VARCHAR(255),
        is_public BOOLEAN DEFAULT FALSE,
        shared_at TIMESTAMP WITH TIME ZONE,
        category_id INTEGER
      );
    `);
    console.log('✅ Lists table created (if not exists)');

    // Create whiteboards table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.whiteboards (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) DEFAULT 'Untitled Whiteboard',
        category VARCHAR(255),
        canvas_data JSONB DEFAULT '[]'::jsonb,
        canvas_width INTEGER DEFAULT 750,
        canvas_height INTEGER DEFAULT 620,
        background_color VARCHAR(50) DEFAULT '#ffffff',
        position_x FLOAT DEFAULT 0,
        position_y FLOAT DEFAULT 0,
        z_index INTEGER DEFAULT 0,
        color_value VARCHAR(50) DEFAULT '#3B82F6',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        share_token VARCHAR(255),
        is_public BOOLEAN DEFAULT FALSE,
        shared_at TIMESTAMP WITH TIME ZONE
      );
    `);
    console.log('✅ Whiteboards table created (if not exists)');

    // Run wireframes migration
    try {
      await runWireframesMigration(pool);
    } catch (wireframesError) {
      console.error('⚠️ Wireframes migration failed, continuing without wireframes features:', wireframesError.message);
    }

    // Run wireframes dimensions migration (add width/height columns)
    try {
      await runWireframesDimensionsMigration(pool);
    } catch (wireframesDimensionsError) {
      console.error('⚠️ Wireframes dimensions migration failed:', wireframesDimensionsError.message);
    }

    // Diagnostic: Log actual columns for public.users table
    try {
      const { rows } = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'users'
        ORDER BY ordinal_position;
      `);
      console.log('Columns in public.users after initialization:', JSON.stringify(rows, null, 2));
    } catch (diagError) {
      console.error('Error during diagnostic query for public.users columns:', diagError);
    }

    // Run CRM migrations
    try {
      await runAllCRMMigrations(pool);
    } catch (crmError) {
      console.error('⚠️ CRM migrations failed, continuing without CRM features:', crmError.message);
    }

    // Run Automation migrations
    try {
      await runAllAutomationMigrations(pool);
    } catch (automationError) {
      console.error('⚠️ Automation migrations failed, continuing without automation features:', automationError.message);
    }

    // Run Calendar migrations
    try {
      await runAllCalendarMigrations(pool);
    } catch (calendarError) {
      console.error('⚠️ Calendar migrations failed, continuing without calendar features:', calendarError.message);
    }

    // Run Forms migrations
    try {
      await runAllFormsMigrations(pool);
    } catch (formsError) {
      console.error('⚠️ Forms migrations failed, continuing without forms features:', formsError.message);
    }

    // Run Inbox migrations
    try {
      await runAllInboxMigrations(pool);
    } catch (inboxError) {
      console.error('⚠️ Inbox migrations failed, continuing without inbox features:', inboxError.message);
    }

    // Run SMS migrations
    try {
      await runAllSmsMigrations(pool);
    } catch (smsError) {
      console.error('⚠️ SMS migrations failed, continuing without SMS features:', smsError.message);
    }

    // Run Chat Widget migrations
    try {
      await runAllChatWidgetMigrations(pool);
    } catch (chatError) {
      console.error('⚠️ Chat Widget migrations failed, continuing without chat widget features:', chatError.message);
    }

    // Run Email Campaign migrations
    try {
      await runAllCampaignMigrations(pool);
    } catch (campaignError) {
      console.error('⚠️ Email Campaign migrations failed, continuing without campaign features:', campaignError.message);
    }

    // Run Segments migrations
    try {
      await runAllSegmentMigrations(pool);
    } catch (segmentError) {
      console.error('⚠️ Segment migrations failed, continuing without segment features:', segmentError.message);
    }

    // Run Invoicing migrations
    try {
      await runAllInvoicingMigrations(pool);
    } catch (invoicingError) {
      console.error('⚠️ Invoicing migrations failed, continuing without invoicing features:', invoicingError.message);
    }

    // Run Estimates and Recurring migrations
    try {
      await runEstimatesRecurringMigrations(pool);
    } catch (estimatesError) {
      console.error('⚠️ Estimates/Recurring migrations failed, continuing without these features:', estimatesError.message);
    }

    // Run Reputation migrations
    try {
      await runAllReputationMigrations(pool);
    } catch (reputationError) {
      console.error('⚠️ Reputation migrations failed, continuing without reputation features:', reputationError.message);
    }

    // Run Social migrations
    try {
      await runAllSocialMigrations(pool);
      
      // Create oauth_states table for OAuth flow
      await pool.query(`
        CREATE TABLE IF NOT EXISTS oauth_states (
          state VARCHAR(100) PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          provider VARCHAR(50) NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (socialError) {
      console.error('⚠️ Social migrations failed, continuing without social features:', socialError.message);
    }

    // Run Pages migrations
    try {
      await runAllPagesMigrations(pool);
    } catch (pagesError) {
      console.error('⚠️ Pages migrations failed, continuing without pages features:', pagesError.message);
    }

    // Run Index migrations (performance optimization - run last after all tables exist)
    try {
      await runAllIndexMigrations(pool);
    } catch (indexError) {
      console.error('⚠️ Index migrations failed, performance may be degraded:', indexError.message);
    }

    // Run Normalization migrations (schema improvements)
    try {
      await runAllNormalizationMigrations(pool);
    } catch (normError) {
      console.error('⚠️ Normalization migrations failed:', normError.message);
    }

    // Run Subscription migrations (feature gating and billing)
    try {
      await runAllSubscriptionMigrations(pool);
    } catch (subscriptionError) {
      console.error('⚠️ Subscription migrations failed, continuing without subscription features:', subscriptionError.message);
    }

    // Run Vault migrations (encrypted storage)
    try {
      await runVaultMigrations(pool);
    } catch (vaultError) {
      console.error('⚠️ Vault migrations failed, continuing without vault features:', vaultError.message);
    }

    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing database schema:', error);
    return false;
  }
};

// User operations
const userOperations = {
  // Find a user by ID
  findById: async (pool, id) => {
    try {
      if (!pool) return null;

      const result = await pool.query(
        'SELECT * FROM public.users WHERE id = $1',
        [id]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      return null;
    }
  },

  // Find a user by email
  findByEmail: async (pool, email) => {
    try {
      if (!pool) return null;

      console.log('Looking up user by email:', email);
      const result = await pool.query(
        'SELECT * FROM public.users WHERE email = $1',
        [email]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by email:', error);
      return null;
    }
  },

  // Find or create a user (for OAuth)
  findOrCreate: async (pool, userData) => {
    try {
      // Try to find the user first
      let user = await userOperations.findByEmail(pool, userData.email);

      // If user exists, update their info
      if (user) {
        const updateResult = await pool.query(
          `UPDATE public.users SET 
            name = $1, 
            google_id = $2,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $3 RETURNING *`,
          [userData.name, userData.googleId, user.id]
        );
        return updateResult.rows[0];
      }

      // Otherwise create a new user
      const createResult = await pool.query(
        `INSERT INTO public.users (email, name, google_id, created_at, updated_at) 
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
         RETURNING *`,
        [userData.email, userData.name, userData.googleId]
      );

      return createResult.rows[0];
    } catch (error) {
      console.error('Error finding or creating user:', error);
      return null;
    }
  }
};

// List operations
const listOperations = {
  // Find all lists for a user
  findAllByUserId: async (pool, userId) => {
    try {
      const result = await pool.query(
        'SELECT * FROM public.lists WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding lists by user ID:', error);
      return [];
    }
  },

  // Find one list by ID (and optionally verify user ownership)
  findById: async (pool, listId, userId = null) => {
    try {
      let query = 'SELECT * FROM public.lists WHERE id = $1';
      let params = [listId];

      // If userId provided, verify ownership
      if (userId) {
        query += ' AND user_id = $2';
        params.push(userId);
      }

      const result = await pool.query(query, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding list by ID:', error);
      return null;
    }
  },

  // Create a new list
  create: async (pool, listData) => {
    try {
      const result = await pool.query(
        `INSERT INTO public.lists (title, category, items, user_id) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [
          listData.title,
          listData.category || 'General',
          JSON.stringify(listData.items || []),
          listData.userId
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating list:', error);
      return null;
    }
  },

  // Update an existing list
  update: async (pool, listId, userId, listData) => {
    try {
      const result = await pool.query(
        `UPDATE public.lists SET 
          title = $1, 
          category = $2, 
          items = $3,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND user_id = $5
         RETURNING *`,
        [
          listData.title,
          listData.category,
          JSON.stringify(listData.items),
          listId,
          userId
        ]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error updating list:', error);
      return null;
    }
  },

  // Delete a list
  delete: async (pool, listId, userId) => {
    try {
      const result = await pool.query(
        'DELETE FROM public.lists WHERE id = $1 AND user_id = $2 RETURNING id',
        [listId, userId]
      );
      return result.rows[0] ? true : false;
    } catch (error) {
      console.error('Error deleting list:', error);
      return false;
    }
  },

  // Update list position (for canvas view)
  updatePosition: async (pool, listId, userId, position) => {
    try {
      const result = await pool.query(
        `UPDATE public.lists SET 
          position_x = $1, 
          position_y = $2,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND user_id = $4
         RETURNING *`,
        [position.x, position.y, listId, userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error updating list position:', error);
      return null;
    }
  },

  // Get all lists for canvas view with positions
  findAllForCanvas: async (pool, userId) => {
    try {
      const result = await pool.query(
        'SELECT * FROM public.lists WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding lists for canvas:', error);
      return [];
    }
  }
};

module.exports = {
  createDbConnection,
  initializeDatabase,
  userOperations,
  listOperations
};
