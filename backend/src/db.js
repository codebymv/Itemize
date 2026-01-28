const { Pool } = require('pg');

// Import migration tracker for fast startup (skips already-run migrations)
const { runMigrationOnce } = require('./utils/migrationTracker');

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
      // More robust connection settings to handle network latency and concurrent requests
      max: 20,                    // Increased from 5 to handle more concurrent OAuth requests
      min: 2,                     // Keep at least 2 connections alive for faster response
      idleTimeoutMillis: 60000,   // 60 seconds idle timeout (increased for better connection reuse)
      connectionTimeoutMillis: 10000, // 10 seconds connection timeout (reduced - fail fast if DB is down)
      statement_timeout: 30000,   // 30 seconds statement timeout
      query_timeout: 30000,       // 30 seconds query timeout
      acquireTimeoutMillis: 10000, // 10 seconds to acquire connection from pool (fail fast if pool exhausted)
      allowExitOnIdle: false,     // Keep pool alive even when idle
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
      console.error('Error code:', err.code);
      console.error('Error stack:', err.stack);

      // Don't crash the application on pool errors
      if (err.code === 'ENETUNREACH' || err.code === 'ENOTFOUND') {
        console.warn('🌐 Network unreachable or host not found. Switching to in-memory storage.');
        useInMemory = true;
      } else if (err.message && err.message.includes('timeout')) {
        console.warn('⏰ Database connection timeout detected. Pool may be exhausted.');
        console.warn('Consider checking database connectivity and pool configuration.');
      }
      
      // If client is provided and it's an error on a specific client, remove it from the pool
      if (client && err.code !== 'ENETUNREACH' && err.code !== 'ENOTFOUND') {
        console.warn('Removing errored client from pool');
        client.end();
      }
    });

    pool.on('acquire', (client) => {
      // Only log in development to reduce noise in production
      if (process.env.NODE_ENV === 'development') {
        console.log('🔗 Client acquired from pool');
      }
    });

    pool.on('release', (client) => {
      // Only log in development to reduce noise in production
      if (process.env.NODE_ENV === 'development') {
        console.log('🔓 Client released back to pool');
      }
    });

    // Monitor pool health periodically (every 5 minutes)
    const healthCheckInterval = setInterval(() => {
      const stats = {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: pool.options.max
      };
      
      // Log warning if pool is getting exhausted
      if (stats.total >= stats.max * 0.8) {
        console.warn('⚠️ Database pool usage high:', stats);
      }
      
      // Log warning if there are waiting clients
      if (stats.waiting > 0) {
        console.warn('⚠️ Clients waiting for database connections:', stats);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    // Clean up interval on process exit
    process.on('SIGINT', () => {
      clearInterval(healthCheckInterval);
    });
    process.on('SIGTERM', () => {
      clearInterval(healthCheckInterval);
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

  const startTime = Date.now();
  console.log('🚀 Starting database initialization...');

  try {
    // Core tables - always run (fast, idempotent)
    await runMigrationOnce(pool, 'core_users_table', async () => {
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
      return true;
    });









    // Core tables - lists and whiteboards (run once)
    await runMigrationOnce(pool, 'core_lists_table', async () => {
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
      return true;
    });

    await runMigrationOnce(pool, 'core_whiteboards_table', async () => {
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
      return true;
    });

    // User column migrations
    await runMigrationOnce(pool, 'users_google_id_column', async () => {
      await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);`);
      return true;
    });

    await runMigrationOnce(pool, 'users_updated_at_column', async () => {
      await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);
      return true;
    });

    // Feature migrations (tracked individually)
    await runMigrationOnce(pool, 'feature_canvas', runCanvasMigration);
    await runMigrationOnce(pool, 'feature_list_resize', runListResizeMigration);
    await runMigrationOnce(pool, 'feature_notes_table', runCreateNotesTableMigration);
    await runMigrationOnce(pool, 'feature_notes_title_category', runAddTitleAndCategoryToNotesMigration);
    await runMigrationOnce(pool, 'feature_categories_table', runCategoriesTableMigration);
    await runMigrationOnce(pool, 'feature_categories_data', runCategoriesDataMigration);
    await runMigrationOnce(pool, 'feature_categories_cleanup', runCleanupDefaultCategories);
    await runMigrationOnce(pool, 'feature_sharing', runSharingMigration);
    await runMigrationOnce(pool, 'feature_wireframes', runWireframesMigration);
    await runMigrationOnce(pool, 'feature_wireframes_dimensions', runWireframesDimensionsMigration);

    // Module migrations (each module handles its own tables)
    await runMigrationOnce(pool, 'module_crm', runAllCRMMigrations);
    await runMigrationOnce(pool, 'module_automation', runAllAutomationMigrations);
    await runMigrationOnce(pool, 'module_calendar', runAllCalendarMigrations);
    await runMigrationOnce(pool, 'module_forms', runAllFormsMigrations);
    await runMigrationOnce(pool, 'module_inbox', runAllInboxMigrations);
    await runMigrationOnce(pool, 'module_sms', runAllSmsMigrations);
    await runMigrationOnce(pool, 'module_chat_widget', runAllChatWidgetMigrations);
    await runMigrationOnce(pool, 'module_campaigns', runAllCampaignMigrations);
    await runMigrationOnce(pool, 'module_segments', runAllSegmentMigrations);
    await runMigrationOnce(pool, 'module_invoicing', runAllInvoicingMigrations);
    await runMigrationOnce(pool, 'module_estimates_recurring', runEstimatesRecurringMigrations);
    
    // Non-destructive recurring invoice columns (source_invoice_id, is_recurring_source)
    await runMigrationOnce(pool, 'recurring_source_invoice_columns', async (p) => {
      // Add source_invoice_id to recurring_invoice_templates
      await p.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'recurring_invoice_templates' AND column_name = 'source_invoice_id'
          ) THEN
            ALTER TABLE recurring_invoice_templates ADD COLUMN source_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);
      // Add is_recurring_source to invoices
      await p.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'invoices' AND column_name = 'is_recurring_source'
          ) THEN
            ALTER TABLE invoices ADD COLUMN is_recurring_source BOOLEAN DEFAULT FALSE;
          END IF;
        END $$;
      `);
      // Add indexes
      await p.query(`
        CREATE INDEX IF NOT EXISTS idx_recurring_templates_source_invoice ON recurring_invoice_templates(source_invoice_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_recurring_source ON invoices(is_recurring_source) WHERE is_recurring_source = true;
      `);
      return true;
    });
    
    await runMigrationOnce(pool, 'module_reputation', runAllReputationMigrations);
    
    // Social migrations + oauth_states table
    await runMigrationOnce(pool, 'module_social', async (p) => {
      await runAllSocialMigrations(p);
      await p.query(`
        CREATE TABLE IF NOT EXISTS oauth_states (
          state VARCHAR(100) PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          provider VARCHAR(50) NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      return true;
    });
    
    await runMigrationOnce(pool, 'module_pages', runAllPagesMigrations);
    
    // Performance and schema optimization (run last)
    await runMigrationOnce(pool, 'optimization_indexes', runAllIndexMigrations);
    await runMigrationOnce(pool, 'optimization_normalization', runAllNormalizationMigrations);
    
    // Billing and features
    await runMigrationOnce(pool, 'module_subscriptions', runAllSubscriptionMigrations);
    await runMigrationOnce(pool, 'module_vault', runVaultMigrations);
    
    // Admin email communications - extend email_logs for admin use
    await runMigrationOnce(pool, 'admin_email_logs_columns', async (p) => {
      // Make organization_id nullable for system-wide admin emails
      await p.query(`
        DO $$ 
        BEGIN 
          -- Make organization_id nullable if it's currently NOT NULL
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'email_logs' AND column_name = 'organization_id'
            AND is_nullable = 'NO'
          ) THEN
            ALTER TABLE email_logs ALTER COLUMN organization_id DROP NOT NULL;
          END IF;
        END $$;
      `);
      
      // Add recipient_name column
      await p.query(`
        ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255);
      `);
      
      // Add recipient_id column for user ID (different from contact_id)
      await p.query(`
        ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      `);
      
      // Add sent_by column for admin user who sent the email
      await p.query(`
        ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
      `);
      
      // Add created_at column if missing (some older schemas use only queued_at)
      await p.query(`
        ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      `);
      
      // Ensure recipient_email column exists (maps to to_email in existing schema)
      await p.query(`
        ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(255);
      `);
      
      // Create indexes for admin queries
      await p.query(`
        CREATE INDEX IF NOT EXISTS idx_email_logs_sent_by ON email_logs(sent_by);
        CREATE INDEX IF NOT EXISTS idx_email_logs_recipient_id ON email_logs(recipient_id);
        CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);
      `);
      
      console.log('✅ Admin email logs columns migration complete');
      return true;
    });

    const elapsed = Date.now() - startTime;
    console.log(`✅ Database initialized successfully in ${elapsed}ms`);
    return true;
  } catch (error) {
    console.error('Error initializing database schema:', error);
    return false;
  }
};

// Retry helper for database operations
const retryDbOperation = async (operation, maxRetries = 3, delayMs = 1000) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isTimeout = error.message && (
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT') ||
        error.code === 'ETIMEDOUT'
      );
      
      // Only retry on timeout errors or connection errors
      if (isTimeout || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        if (attempt < maxRetries) {
          console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`, error.message);
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt)); // Exponential backoff
          continue;
        }
      }
      // For non-retryable errors, throw immediately
      throw error;
    }
  }
  throw lastError;
};

// User operations
const userOperations = {
  // Find a user by ID
  findById: async (pool, id) => {
    if (!pool) {
      throw new Error('Database pool not available');
    }

    return retryDbOperation(async () => {
      const result = await pool.query(
        'SELECT * FROM public.users WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    });
  },

  // Find a user by email
  findByEmail: async (pool, email) => {
    if (!pool) {
      throw new Error('Database pool not available');
    }

    console.log('Looking up user by email:', email);
    return retryDbOperation(async () => {
      const result = await pool.query(
        'SELECT * FROM public.users WHERE email = $1',
        [email]
      );
      return result.rows[0] || null;
    });
  },

  // Find or create a user (for OAuth)
  findOrCreate: async (pool, userData) => {
    if (!pool) {
      throw new Error('Database pool not available');
    }

    return retryDbOperation(async () => {
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
    });
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
