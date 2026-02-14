require('dotenv').config();
const { Pool } = require('pg');

async function checkInvoiceStatusColumns() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'invoices' 
        AND column_name LIKE '%status%' OR column_name LIKE '%paid%'
      ORDER BY column_name
    `);
    
    console.log('Invoice status-related columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    const distinctResult = await pool.query(`
      SELECT DISTINCT status 
      FROM invoices 
      LIMIT 10
    `);
    
    console.log('\nDistinct status values in invoices:');
    distinctResult.rows.forEach(row => {
      console.log(`  - ${row.status}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkInvoiceStatusColumns();