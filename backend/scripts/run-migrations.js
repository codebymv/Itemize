require('dotenv').config();
async function runAllMigrations() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('🚀 Starting Phase 2 Database Migrations...\n');
    
    for (const migration of MIGRATIONS) {
      try {
        const migrationPath = path.join(__dirname, migration.file);
        
        if (!fs.existsSync(migrationPath)) {
          console.log(`⚠️  Migration ${migration.id}: File not found, skipping`);
          continue;
        }
        
        console.log(`> Running Migration ${migration.id}: ${migration.name}`);
        const migrationModule = require(migrationPath);
        await migrationModule();
        
        await pool.query(`
          INSERT INTO schema_migrations (version, description, executed_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (version) DO NOTHING
        `, [migration.id, migration.name]);
        
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('already added')) {
          console.log(`  Already applied, skipping\n`);
          continue;
        }
        console.error(`  Failed: ${error.message}`);
        throw error;
      }
    }
    
    console.log('\n✅ All Phase 2 migrations completed successfully!');
    
    await verifyMigrations(pool);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function verifyMigrations(pool) {
  console.log('\n🔍 Verifying migrations...\n');
  
  const checks = [
    {
      name: 'Invoices contact_id column',
      query: `SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'contact_id'`
    },
    {
      name: 'Invoices contact_id FK constraint',
      query: `SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'invoices' AND constraint_name = 'fk_invoices_contact_id'`
    },
    {
      name: 'Signatures contact_id column',
      query: `SELECT 1 FROM information_schema.columns WHERE table_name = 'signatures' AND column_name = 'contact_id'`
    },
    {
      name: 'workflow_triggers table',
      query: `SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_triggers'`
    }
  ];
  
  for (const check of checks) {
    try {
      const result = await pool.query(check.query);
      if (result.rows.length > 0) {
        console.log(`✅ ${check.name}`);
      } else {
        console.log(`❌ ${check.name} - NOT FOUND`);
      }
    } catch (error) {
      console.log(`❌ ${check.name} - ERROR: ${error.message}`);
    }
  }
  
  console.log('\n📊 Checking indexes...\n');
  
  const indexChecks = [
    { name: 'idx_invoices_contact_id', table: 'invoices' },
    { name: 'idx_signatures_contact_id', table: 'signatures' },
    { name: 'idx_invoices_status', table: 'invoices' },
    { name: 'idx_signatures_status', table: 'signatures' }
  ];
  
  for (const idx of indexChecks) {
    try {
      const result = await pool.query(
        `SELECT 1 FROM pg_indexes WHERE tablename = $1 AND indexname = $2`,
        [idx.table, idx.name]
      );
      if (result.rows.length > 0) {
        console.log(`✅ Index: ${idx.name}`);
      } else {
        console.log(`❌ Index: ${idx.name} - NOT FOUND`);
      }
    } catch (error) {
      console.log(`⚠️  Index: ${idx.name} - ERROR: ${error.message}`);
    }
  }
}

async function ensureSchemaMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(10) PRIMARY KEY,
      description TEXT,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  ensureSchemaMigrationsTable(pool)
    .then(() => pool.end())
    .then(runAllMigrations)
    .catch(error => {
      console.error('Failed to run migrations:', error);
      process.exit(1);
    });
}

module.exports = { runAllMigrations };