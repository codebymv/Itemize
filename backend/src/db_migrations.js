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

module.exports = {
  runCanvasMigration,
  runCreateNotesTableMigration // Add the new migration function here
};
