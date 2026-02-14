require('dotenv').config();
const { Pool } = require('pg');

async function checkWorkflowTriggersTable() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'workflow_triggers' 
      ORDER BY ordinal_position
    `);
    
    if (result.rows.length > 0) {
      console.log('workflow_triggers table columns:');
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });
    } else {
      console.log('workflow_triggers table does NOT exist - needs to be created');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkWorkflowTriggersTable();