require('dotenv').config();
const { Pool } = require('pg');

async function checkSchema() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'invoices' 
      ORDER BY ordinal_position
    `);
    
    console.log('Invoices table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_type = 'BASE TABLE' 
        AND table_schema = 'public'
        AND (table_name LIKE '%invoice%' OR table_name LIKE '%signature%' OR table_name LIKE '%workflow%')
      ORDER BY table_name
    `);
    
    console.log('\nRelated tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();