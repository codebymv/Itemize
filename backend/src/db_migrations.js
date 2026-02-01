const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database migrations for canvas feature
const runCanvasMigration = async (pool) => {
  console.log('Running canvas feature migration...');
  
  try {
    // Add position columns to lists table
    await pool.query(`
      ALTER TABLE lists 
      ADD COLUMN IF NOT EXISTS position_x FLOAT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS position_y FLOAT DEFAULT 0;
    `);
    
    // Update existing lists to have a grid-like layout
    await pool.query(`
      UPDATE lists 
      SET position_x = (id % 3) * 350,  -- 3 columns, each 350px wide
          position_y = (id / 3)::int * 250  -- Each row is 250px tall
      WHERE position_x = 0 AND position_y = 0;
    `);
    
    console.log('✅ Canvas feature migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Canvas feature migration failed:', error.message);
    return false;
  }
};

// Migration to add width and height columns to lists table for resizing functionality
const runListResizeMigration = async (pool) => {
  console.log('Running list resize feature migration...');
  
  try {
    // Add width and height columns to lists table
    await pool.query(`
      ALTER TABLE lists 
      ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 340,
      ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 265;
    `);
    console.log('✅ width and height columns added to lists table');
    
    console.log('✅ List resize feature migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ List resize feature migration failed:', error.message);
    return false;
  }
};

// New migration for creating the 'notes' table
const runCreateNotesTableMigration = async (pool) => {
  console.log('Running create notes table migration...');
  try {
    // Create the notes table (with all columns including sharing)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT DEFAULT 'Untitled Note',
          content TEXT DEFAULT '',
          category TEXT DEFAULT 'General',
          color_value TEXT DEFAULT '#FFFFE0',
          position_x FLOAT8 NOT NULL DEFAULT 0,
          position_y FLOAT8 NOT NULL DEFAULT 0,
          width INTEGER DEFAULT 200,
          height INTEGER DEFAULT 200,
          z_index INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          share_token VARCHAR(255),
          is_public BOOLEAN DEFAULT FALSE,
          shared_at TIMESTAMP WITH TIME ZONE,
          category_id INTEGER
      );
    `);
    console.log('✅ notes table created (if not exists)');

    // Create index on user_id for notes table
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
    `);
    console.log('✅ index idx_notes_user_id on notes table created (if not exists)');

    // Create or replace function to update updated_at timestamp
    // This function can be shared if it already exists for other tables like 'lists'
    // If it's specific to 'notes' or you want to ensure it's present:
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ update_updated_at_column function created/replaced');

    // Create trigger for notes table to automatically update updated_at
    // Drop trigger first if it exists to avoid errors on re-runs, then create.
    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_notes_updated_at ON notes;
    `);
    await pool.query(`
      CREATE TRIGGER trigger_notes_updated_at
      BEFORE UPDATE ON notes
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ trigger_notes_updated_at on notes table created');

    console.log('✅ Create notes table migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Create notes table migration failed:', error.message);
    // Consider more specific error handling or re-throwing if needed
    return false;
  }
};

// Migration to add title and category columns to existing notes table
const runAddTitleAndCategoryToNotesMigration = async (pool) => {
  console.log('Running add title and category to notes migration...');
  try {
    // Add title column if it doesn't exist
    await pool.query(`
      ALTER TABLE notes 
      ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'Untitled Note';
    `);
    console.log('✅ title column added to notes table (if not exists)');

    // Add category column if it doesn't exist
    await pool.query(`
      ALTER TABLE notes 
      ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
    `);
    console.log('✅ category column added to notes table (if not exists)');

    // Migrate existing notes: extract first line of content as title
    await pool.query(`
      UPDATE notes 
      SET title = CASE 
        WHEN content IS NULL OR content = '' THEN 'Untitled Note'
        ELSE LEFT(TRIM(SPLIT_PART(content, E'\n', 1)), 100)
      END
      WHERE title IS NULL OR title = 'Untitled Note';
    `);
    console.log('✅ Migrated existing notes content to populate title field');

    console.log('✅ Add title and category to notes migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Add title and category to notes migration failed:', error.message);
    return false;
  }
};

// New migration for creating categories table and linking it to lists/notes
const runCategoriesTableMigration = async (pool) => {
  console.log('Running categories table migration...');
  try {
    // Create categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(100) NOT NULL,
          color_value VARCHAR(7) DEFAULT '#3B82F6',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, name)
      );
    `);
    console.log('✅ categories table created (if not exists)');

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
    `);
    console.log('✅ categories table indexes created');

    // Add category_id foreign key to lists table
    try {
      await pool.query(`
        ALTER TABLE lists ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
      `);
      console.log('✅ category_id column added to lists table');
    } catch (error) {
      if (error.code === '42701') { // Column already exists
        console.log('✅ category_id column already exists in lists table');
      } else {
        throw error;
      }
    }

    // Add category_id foreign key to notes table
    try {
      await pool.query(`
        ALTER TABLE notes ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
      `);
      console.log('✅ category_id column added to notes table');
    } catch (error) {
      if (error.code === '42701') { // Column already exists
        console.log('✅ category_id column already exists in notes table');
      } else {
        throw error;
      }
    }

    // Create indexes for the foreign keys
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lists_category_id ON lists(category_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_category_id ON notes(category_id);
    `);
    console.log('✅ Foreign key indexes created');

    // Create trigger function for categories updated_at
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_categories_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger for categories table
    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_categories_updated_at ON categories;
    `);
    await pool.query(`
      CREATE TRIGGER trigger_categories_updated_at
      BEFORE UPDATE ON categories
      FOR EACH ROW
      EXECUTE FUNCTION update_categories_updated_at();
    `);
    console.log('✅ categories table trigger created');

    console.log('✅ Categories table migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Categories table migration failed:', error.message);
    console.log('⚠️ Continuing without categories migration - app will still work with legacy categories');
    return false; // Don't crash the app, just continue without categories
  }
};

// Migration to populate categories table from existing data and link records
const runCategoriesDataMigration = async (pool) => {
  console.log('Running categories data migration...');
  try {
    // Check if categories table exists first
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'categories'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ Categories table does not exist, skipping data migration');
      return false;
    }

    // Get all users to process their categories
    const usersResult = await pool.query('SELECT DISTINCT id FROM users');
    const users = usersResult.rows;

    console.log(`Processing categories for ${users.length} users...`);

    for (const user of users) {
      const userId = user.id;
      
      try {
        // Create "General" category for each user
        await pool.query(`
          INSERT INTO categories (user_id, name, color_value)
          VALUES ($1, 'General', '#6B7280')
          ON CONFLICT (user_id, name) DO NOTHING;
        `, [userId]);

        // Create categories from existing list categories
        await pool.query(`
          INSERT INTO categories (user_id, name, color_value)
          SELECT DISTINCT $1, category, '#3B82F6'
          FROM lists 
          WHERE user_id = $1 
          AND category IS NOT NULL 
          AND category != '' 
          AND category != 'General'
          ON CONFLICT (user_id, name) DO NOTHING;
        `, [userId]);

        // Create categories from existing note categories  
        await pool.query(`
          INSERT INTO categories (user_id, name, color_value)
          SELECT DISTINCT $1, category, '#10B981'
          FROM notes 
          WHERE user_id = $1 
          AND category IS NOT NULL 
          AND category != '' 
          AND category != 'General'
          ON CONFLICT (user_id, name) DO NOTHING;
        `, [userId]);

        // Link lists to their categories
        await pool.query(`
          UPDATE lists 
          SET category_id = c.id
          FROM categories c
          WHERE lists.user_id = $1 
          AND lists.category = c.name 
          AND c.user_id = $1
          AND lists.category_id IS NULL;
        `, [userId]);

        // Link notes to their categories
        await pool.query(`
          UPDATE notes 
          SET category_id = c.id
          FROM categories c
          WHERE notes.user_id = $1 
          AND notes.category = c.name 
          AND c.user_id = $1
          AND notes.category_id IS NULL;
        `, [userId]);

        // Set remaining lists without category to General
        const generalCategoryResult = await pool.query(`
          SELECT id FROM categories WHERE user_id = $1 AND name = 'General';
        `, [userId]);
        
        if (generalCategoryResult.rows.length > 0) {
          const generalCategoryId = generalCategoryResult.rows[0].id;
          await pool.query(`
            UPDATE lists 
            SET category_id = $1
            WHERE user_id = $2 AND category_id IS NULL;
          `, [generalCategoryId, userId]);

          await pool.query(`
            UPDATE notes 
            SET category_id = $1
            WHERE user_id = $2 AND category_id IS NULL;
          `, [generalCategoryId, userId]);
        }

        console.log(`✅ Processed categories for user ${userId}`);
      } catch (userError) {
        console.error(`⚠️ Error processing categories for user ${userId}:`, userError.message);
        // Continue with other users
      }
    }

    // Only General category is created by default (already handled above)
    console.log('✅ Default categories setup completed (General only)');

    console.log('✅ Categories data migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Categories data migration failed:', error.message);
    console.log('⚠️ Continuing without categories data migration - app will still work with legacy categories');
    return false; // Don't crash the app, just continue without categories
  }
};

// Migration to clean up unwanted default categories
const runCleanupDefaultCategories = async (pool) => {
  console.log('Running cleanup of default categories migration...');
  try {
    // Check if categories table exists first
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'categories'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ Categories table does not exist, skipping cleanup');
      return false;
    }

    // Get all users to process
    const usersResult = await pool.query('SELECT DISTINCT id FROM users');
    const users = usersResult.rows;

    console.log(`Cleaning up default categories for ${users.length} users...`);

    for (const user of users) {
      const userId = user.id;

      try {
        // Get General category ID for this user
        const generalCategoryResult = await pool.query(`
          SELECT id FROM categories WHERE user_id = $1 AND name = 'General';
        `, [userId]);

        if (generalCategoryResult.rows.length === 0) {
          console.log(`⚠️ No General category found for user ${userId}, skipping cleanup`);
          continue;
        }

        const generalCategoryId = generalCategoryResult.rows[0].id;

        // Move lists from Work, Personal, Shopping back to General
        await pool.query(`
          UPDATE lists
          SET category_id = $1
          FROM categories c
          WHERE lists.category_id = c.id
          AND c.user_id = $2
          AND c.name IN ('Work', 'Personal', 'Shopping');
        `, [generalCategoryId, userId]);

        // Move notes from Work, Personal, Shopping back to General
        await pool.query(`
          UPDATE notes
          SET category_id = $1
          FROM categories c
          WHERE notes.category_id = c.id
          AND c.user_id = $2
          AND c.name IN ('Work', 'Personal', 'Shopping');
        `, [generalCategoryId, userId]);

        // Delete the unwanted default categories
        await pool.query(`
          DELETE FROM categories
          WHERE user_id = $1
          AND name IN ('Work', 'Personal', 'Shopping');
        `, [userId]);

        console.log(`✅ Cleaned up default categories for user ${userId}`);
      } catch (userError) {
        console.error(`⚠️ Error cleaning up categories for user ${userId}:`, userError.message);
        // Continue with other users
      }
    }

    console.log('✅ Default categories cleanup completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Default categories cleanup failed:', error.message);
    console.log('⚠️ Continuing without cleanup - existing categories will remain');
    return false;
  }
};

// Migration to add sharing functionality to lists, notes, and whiteboards
const runSharingMigration = async (pool) => {
  console.log('Running sharing feature migration...');

  try {
    // Add sharing columns to lists table
    await pool.query(`
      ALTER TABLE lists
      ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS share_token UUID,
      ADD COLUMN IF NOT EXISTS shared_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('✅ Sharing columns added to lists table');

    // Add sharing columns to notes table
    await pool.query(`
      ALTER TABLE notes
      ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS share_token UUID,
      ADD COLUMN IF NOT EXISTS shared_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('✅ Sharing columns added to notes table');

    // Add sharing columns to whiteboards table
    await pool.query(`
      ALTER TABLE whiteboards
      ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS share_token UUID,
      ADD COLUMN IF NOT EXISTS shared_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('✅ Sharing columns added to whiteboards table');

    // Create indexes for better performance on share tokens
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lists_share_token ON lists(share_token) WHERE share_token IS NOT NULL;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_share_token ON notes(share_token) WHERE share_token IS NOT NULL;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_whiteboards_share_token ON whiteboards(share_token) WHERE share_token IS NOT NULL;
    `);
    console.log('✅ Share token indexes created');

    // Create indexes for public content queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lists_is_public ON lists(is_public) WHERE is_public = TRUE;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_is_public ON notes(is_public) WHERE is_public = TRUE;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_whiteboards_is_public ON whiteboards(is_public) WHERE is_public = TRUE;
    `);
    console.log('✅ Public content indexes created');

    console.log('✅ Sharing feature migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Sharing feature migration failed:', error.message);
    return false;
  }
};

// Email/Password Authentication Migration
const runEmailPasswordAuthMigration = async (pool) => {
  console.log('Running email/password authentication migration...');
  
  try {
    // First, check what columns exist in the users table
    console.log('📋 Checking existing table structure...');
    const columnsResult = await pool.query(`
      SELECT column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
    
    const existingColumns = columnsResult.rows.map(r => r.column_name);
    console.log('✅ Found existing columns:', existingColumns.join(', '));
    
    console.log('\n📋 Adding authentication columns to users table...');
    
    // Add password hash column
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
    `);
    console.log('✅ Added password_hash column');
    
    // Add email verification columns
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
    `);
    console.log('✅ Added email_verified column');
    
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
    `);
    console.log('✅ Added verification_token column');
    
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP WITH TIME ZONE;
    `);
    console.log('✅ Added verification_token_expires column');
    
    // Add password reset columns
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
    `);
    console.log('✅ Added password_reset_token column');
    
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP WITH TIME ZONE;
    `);
    console.log('✅ Added password_reset_expires column');
    
    // Add role column
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'USER';
    `);
    console.log('✅ Added role column');
    
    // Add provider columns if they don't exist
    if (!existingColumns.includes('provider')) {
      console.log('📋 Adding provider column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
      `);
      console.log('✅ Added provider column');
    }
    
    if (!existingColumns.includes('provider_id')) {
      console.log('📋 Adding provider_id column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);
      `);
      console.log('✅ Added provider_id column');
    }
    
    // Make provider columns nullable if they exist and have NOT NULL constraint
    if (existingColumns.includes('provider')) {
      console.log('📋 Making provider column nullable...');
      try {
        await pool.query(`
          ALTER TABLE users 
          ALTER COLUMN provider DROP NOT NULL;
        `);
        console.log('✅ Made provider column nullable');
      } catch (err) {
        if (err.code === '42703') {
          console.log('ℹ️  Provider column already nullable');
        } else {
          throw err;
        }
      }
    }
    
    if (existingColumns.includes('provider_id')) {
      console.log('📋 Making provider_id column nullable...');
      try {
        await pool.query(`
          ALTER TABLE users 
          ALTER COLUMN provider_id DROP NOT NULL;
        `);
        console.log('✅ Made provider_id column nullable');
      } catch (err) {
        if (err.code === '42703') {
          console.log('ℹ️  Provider_id column already nullable');
        } else {
          throw err;
        }
      }
    }
    
    // Set existing Google OAuth users as email verified
    if (existingColumns.includes('provider')) {
      console.log('📋 Marking existing Google users as verified...');
      const result = await pool.query(`
        UPDATE users 
        SET email_verified = true 
        WHERE provider = 'google' AND (email_verified IS NULL OR email_verified = false);
      `);
      console.log(`✅ Marked ${result.rowCount} Google users as email verified`);
    }
    
    // Add indexes for token lookups
    console.log('📋 Creating indexes for performance...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_verification_token 
      ON users(verification_token) 
      WHERE verification_token IS NOT NULL;
    `);
    console.log('✅ Created index on verification_token');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_password_reset_token 
      ON users(password_reset_token) 
      WHERE password_reset_token IS NOT NULL;
    `);
    console.log('✅ Created index on password_reset_token');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_verified 
      ON users(email_verified);
    `);
    console.log('✅ Created index on email_verified');
    
    console.log('\n✅ Email/password authentication migration completed successfully!');
    console.log('\n📋 Summary of changes:');
    console.log('   • Added password_hash column for storing hashed passwords');
    console.log('   • Added email_verified flag and verification token columns');
    console.log('   • Added password reset token columns');
    console.log('   • Added role column for future permissions');
    console.log('   • Added/ensured provider columns exist and are nullable');
    console.log('   • Created indexes for fast token lookups');
    console.log('   • Marked existing Google users as verified (if applicable)');
    
    return true;
  } catch (error) {
    console.error('❌ Email/password authentication migration failed:', error.message);
    console.error('Full error:', error);
    return false;
  }
};

// Migration to create wireframes table for React Flow diagrams
const runWireframesMigration = async (pool) => {
  console.log('Running wireframes table migration...');

  try {
    // Create wireframes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wireframes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'General',
        flow_data JSONB DEFAULT '{"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}',
        position_x INTEGER NOT NULL DEFAULT 0,
        position_y INTEGER NOT NULL DEFAULT 0,
        z_index INTEGER DEFAULT 0,
        color_value VARCHAR(7) DEFAULT '#3B82F6',
        share_token UUID,
        is_public BOOLEAN DEFAULT FALSE,
        shared_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ wireframes table created (if not exists)');

    // Create index on user_id for wireframes table
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wireframes_user_id ON wireframes(user_id);
    `);
    console.log('✅ index idx_wireframes_user_id created');

    // Create index on category for wireframes table
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wireframes_category ON wireframes(category);
    `);
    console.log('✅ index idx_wireframes_category created');

    // Create index on share_token for wireframes table
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wireframes_share_token ON wireframes(share_token) WHERE share_token IS NOT NULL;
    `);
    console.log('✅ index idx_wireframes_share_token created');

    // Create index on is_public for wireframes table
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wireframes_is_public ON wireframes(is_public) WHERE is_public = TRUE;
    `);
    console.log('✅ index idx_wireframes_is_public created');

    // Create trigger for wireframes table to automatically update updated_at
    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_wireframes_updated_at ON wireframes;
    `);
    await pool.query(`
      CREATE TRIGGER trigger_wireframes_updated_at
      BEFORE UPDATE ON wireframes
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ trigger_wireframes_updated_at created');

    console.log('✅ Wireframes table migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Wireframes table migration failed:', error.message);
    return false;
  }
};

// Migration to add width and height columns to wireframes table
const runWireframesDimensionsMigration = async (pool) => {
  console.log('Running wireframes dimensions migration...');

  try {
    // Add width column if it doesn't exist
    await pool.query(`
      ALTER TABLE wireframes ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 600;
    `);
    console.log('✅ width column added to wireframes (if not exists)');

    // Add height column if it doesn't exist
    await pool.query(`
      ALTER TABLE wireframes ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 600;
    `);
    console.log('✅ height column added to wireframes (if not exists)');

    console.log('✅ Wireframes dimensions migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Wireframes dimensions migration failed:', error.message);
    return false;
  }
};

// Migration to add onboarding progress tracking to users table
const runOnboardingMigration = async (pool) => {
  console.log('Running onboarding progress migration...');
  
  try {
    // Add onboarding_progress JSONB column to users table
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS onboarding_progress JSONB DEFAULT '{}'::jsonb;
    `);
    console.log('✅ onboarding_progress column added to users table');
    
    // Create GIN index for efficient JSONB queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_onboarding_progress 
      ON users USING gin(onboarding_progress);
    `);
    console.log('✅ GIN index created on onboarding_progress');
    
    // Optional: Create analytics/events table for detailed tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS onboarding_events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        feature_key VARCHAR(50) NOT NULL,
        event_type VARCHAR(20) NOT NULL,
        version VARCHAR(10) DEFAULT '1.0',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ onboarding_events table created (if not exists)');
    
    // Create index for efficient event queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_onboarding_events_user_feature 
      ON onboarding_events(user_id, feature_key);
    `);
    console.log('✅ index created on onboarding_events(user_id, feature_key)');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_onboarding_events_created_at 
      ON onboarding_events(created_at);
    `);
    console.log('✅ index created on onboarding_events(created_at)');
    
    console.log('✅ Onboarding migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Onboarding migration failed:', error.message);
    return false;
  }
};

module.exports = {
  runCanvasMigration,
  runListResizeMigration,
  runCreateNotesTableMigration,
  runAddTitleAndCategoryToNotesMigration,
  runCategoriesTableMigration,
  runCategoriesDataMigration,
  runCleanupDefaultCategories,
  runSharingMigration,
  runEmailPasswordAuthMigration,
  runWireframesMigration,
  runWireframesDimensionsMigration,
  runOnboardingMigration
};
