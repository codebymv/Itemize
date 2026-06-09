// ============================================
// Email/Password Authentication Migrations
// Run with: node backend/scripts/execute-migration.js runEmailPasswordAuthMigration
// ============================================

/**
 * Main migration to add email/password authentication support
 * Adds all necessary columns and constraints for:
 * - Email/password authentication
 * - Email verification
 * - Password reset
 * - User roles
 */
const runEmailPasswordAuthMigration = async (pool) => {
  console.log('Running email/password authentication migration...');
  
  try {
    const client = await pool.connect();
    
    try {
      console.log('📋 Adding authentication columns to users table...');
      
      // Add password hash column
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
      `);
      console.log('✅ Added password_hash column');
      
      // Add email verification columns
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
      `);
      console.log('✅ Added email_verified column');
      
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
      `);
      console.log('✅ Added verification_token column');
      
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP WITH TIME ZONE;
      `);
      console.log('✅ Added verification_token_expires column');
      
      // Add password reset columns
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
      `);
      console.log('✅ Added password_reset_token column');
      
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP WITH TIME ZONE;
      `);
      console.log('✅ Added password_reset_expires column');
      
      // Add role column
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'USER';
      `);
      console.log('✅ Added role column');
      
      // Make provider columns nullable (for email/password users)
      console.log('📋 Making provider columns nullable...');
      await client.query(`
        ALTER TABLE users 
        ALTER COLUMN provider DROP NOT NULL;
      `);
      console.log('✅ Made provider column nullable');
      
      await client.query(`
        ALTER TABLE users 
        ALTER COLUMN provider_id DROP NOT NULL;
      `);
      console.log('✅ Made provider_id column nullable');
      
      // Set existing Google OAuth users as email verified
      console.log('📋 Marking existing Google users as verified...');
      const result = await client.query(`
        UPDATE users 
        SET email_verified = true 
        WHERE provider = 'google' AND email_verified = false;
      `);
      console.log(`✅ Marked ${result.rowCount} Google users as email verified`);
      
      // Add indexes for token lookups
      console.log('📋 Creating indexes for performance...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_verification_token 
        ON users(verification_token) 
        WHERE verification_token IS NOT NULL;
      `);
      console.log('✅ Created index on verification_token');
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_password_reset_token 
        ON users(password_reset_token) 
        WHERE password_reset_token IS NOT NULL;
      `);
      console.log('✅ Created index on password_reset_token');
      
      await client.query(`
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
      console.log('   • Made provider columns nullable for email/password users');
      console.log('   • Created indexes for fast token lookups');
      console.log('   • Marked existing Google users as verified');
      
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Email/password authentication migration failed:', error.message);
    console.error('Full error:', error);
    return false;
  }
};

/**
 * Export all auth-related migration functions
 */
module.exports = {
  runEmailPasswordAuthMigration,
};
