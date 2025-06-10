// File: backend/scripts/execute-migration.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') }); // Load .env from backend directory
const { Pool } = require('pg');
const path = require('path');

// Dynamically import all migration functions from db_migrations.js
// Adjust the path if your db_migrations.js is located elsewhere relative to this script
const migrationsFilePath = path.resolve(__dirname, '../src/db_migrations.js');
const allMigrationFunctions = require(migrationsFilePath);

const migrationNameFromArg = process.argv[2]; // Get migration name from command line argument

const runMigration = async () => {
  if (!migrationNameFromArg) {
    console.error('❌ Please provide a migration function name to run as a command line argument.');
    console.log('Example: node backend/scripts/execute-migration.js runCreateNotesTableMigration');
    console.log('\nAvailable migration functions found in db_migrations.js:');
    Object.keys(allMigrationFunctions).forEach(name => console.log(`  - ${name}`));
    process.exit(1);
  }

  const selectedMigrationFunction = allMigrationFunctions[migrationNameFromArg];

  if (typeof selectedMigrationFunction !== 'function') {
    console.error(`❌ Migration function "${migrationNameFromArg}" not found or is not a function in db_migrations.js.`);
    console.log('\nAvailable migration functions:');
    Object.keys(allMigrationFunctions).forEach(name => console.log(`  - ${name}`));
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not defined in your .env file.');
    process.exit(1);
  }
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase typically requires SSL. If you have issues, you might need:
    // ssl: { rejectUnauthorized: false } 
    // Or, for more security, provide the CA certificate if Supabase offers one.
  });

  try {
    const dbHost = new URL(process.env.DATABASE_URL).hostname;
    console.log(`Attempting to connect to database host: ${dbHost}`);
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Successfully connected to the database.');
    client.release(); // Release client immediately after connection test

    console.log(`🚀 Executing migration function: ${migrationNameFromArg}`);
    const success = await selectedMigrationFunction(pool); // Pass the pool to the migration function

    if (success) {
      console.log(`✅ Migration function "${migrationNameFromArg}" completed successfully.`);
    } else {
      console.error(`❌ Migration function "${migrationNameFromArg}" reported failure. Check previous logs for details.`);
    }
  } catch (error) {
    console.error('❌ An error occurred during the migration process:', error.message);
    if (error.stack) {
        console.error(error.stack);
    }
  } finally {
    await pool.end();
    console.log('🔚 Database connection closed.');
  }
};

runMigration();
