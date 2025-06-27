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

// New migration for creating the 'notes' table
const runCreateNotesTableMigration = async (pool) => {
  console.log('Running create notes table migration...');
  try {
    // Create the notes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT DEFAULT '',
          color_value TEXT DEFAULT '#FFFFE0', -- Default light yellow
          position_x FLOAT8 NOT NULL DEFAULT 0,
          position_y FLOAT8 NOT NULL DEFAULT 0,
          width INTEGER DEFAULT 200,
          height INTEGER DEFAULT 200,
          z_index INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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

// Migration for creating whiteboards table with proper constraints for infinite canvas
const runCreateWhiteboardsTableMigration = async (pool) => {
  console.log('Running create whiteboards table migration...');
  try {
    // Create the whiteboards table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whiteboards (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT DEFAULT 'Untitled Whiteboard',
          category TEXT DEFAULT 'General',
          canvas_data JSONB DEFAULT '{"paths": [], "shapes": []}',
          canvas_width INTEGER DEFAULT 700 CHECK (canvas_width >= 300 AND canvas_width <= 2400),
          canvas_height INTEGER DEFAULT 400 CHECK (canvas_height >= 250 AND canvas_height <= 2400),
          background_color TEXT DEFAULT '#FFFFFF',
          position_x FLOAT8 NOT NULL DEFAULT 0,
          position_y FLOAT8 NOT NULL DEFAULT 0,
          z_index INTEGER DEFAULT 0,
          color_value TEXT DEFAULT '#3B82F6',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ whiteboards table created (if not exists)');

    // Create index on user_id for whiteboards table
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_whiteboards_user_id ON whiteboards(user_id);
    `);
    console.log('✅ index idx_whiteboards_user_id on whiteboards table created (if not exists)');

    // Create trigger for whiteboards table to automatically update updated_at
    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_whiteboards_updated_at ON whiteboards;
    `);
    await pool.query(`
      CREATE TRIGGER trigger_whiteboards_updated_at
      BEFORE UPDATE ON whiteboards
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ trigger_whiteboards_updated_at on whiteboards table created');

    console.log('✅ Create whiteboards table migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Create whiteboards table migration failed:', error.message);
    return false;
  }
};

// Migration to update canvas dimension constraints for existing whiteboards table
const runUpdateCanvasDimensionConstraints = async (pool) => {
  console.log('Running update canvas dimension constraints migration...');
  try {
    // Check if whiteboards table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whiteboards'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ Whiteboards table does not exist, skipping constraint update');
      return false;
    }

    // Drop existing check constraint if it exists
    await pool.query(`
      ALTER TABLE whiteboards DROP CONSTRAINT IF EXISTS check_canvas_dimensions;
    `);
    console.log('✅ Dropped existing check_canvas_dimensions constraint');

    // Add new check constraints with higher limits for infinite canvas
    await pool.query(`
      ALTER TABLE whiteboards 
      ADD CONSTRAINT check_canvas_width CHECK (canvas_width >= 300 AND canvas_width <= 2400);
    `);
    console.log('✅ Added new canvas_width constraint (300-2400px)');

    await pool.query(`
      ALTER TABLE whiteboards 
      ADD CONSTRAINT check_canvas_height CHECK (canvas_height >= 250 AND canvas_height <= 2400);
    `);
    console.log('✅ Added new canvas_height constraint (250-2400px)');

    console.log('✅ Canvas dimension constraints updated successfully');
    return true;
  } catch (error) {
    console.error('❌ Canvas dimension constraints update failed:', error.message);
    return false;
  }
};

module.exports = {
  runCanvasMigration,
  runCreateNotesTableMigration,
  runAddTitleAndCategoryToNotesMigration,
  runCategoriesTableMigration,
  runCategoriesDataMigration,
  runCleanupDefaultCategories,
  runCreateWhiteboardsTableMigration,
  runUpdateCanvasDimensionConstraints
};
