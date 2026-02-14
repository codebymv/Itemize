require('dotenv').config();
const { Pool } = require('pg');

async function checkSignaturesSchema() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const tables = ['signature_documents', 'signatures', 'signature_recipients'];
    
    for (const tableName of tables) {
      try {
        const result = await pool.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = $1 
          ORDER BY ordinal_position
        `, [tableName]);
        
        if (result.rows.length > 0) {
          console.log(`\n${tableName} table columns:`);
          result.rows.forEach(row => {
            console.log(`  - ${row.column_name} (${row.data_type})`);
          });
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

checkSignaturesSchema();