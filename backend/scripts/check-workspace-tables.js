require('dotenv').config();
const { Pool } = require('pg');

async function checkWorkspaceTables() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const tables = ['canvas_items', 'lists', 'notes', 'workspace_items', 'workspace'];
    
    for (const tableName of tables) {
      try {
        const result = await pool.query(`
          SELECT 1
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name = $1
        `, [tableName]);
        
        if (result.rows.length > 0) {
          console.log(`✅ ${tableName} exists`);
        } else {
          console.log(`❌ ${tableName} does NOT exist`);
        }
      } catch (error) {
        console.error(`Error checking ${tableName}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkWorkspaceTables();