-- ============================================
-- Authentication Migration
-- Adds email/password auth support to users table
-- ============================================

-- Add password hash column for email/password authentication
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add email verification columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP WITH TIME ZONE;

-- Add password reset columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP WITH TIME ZONE;

-- Add role column for future admin functionality
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'USER';

-- Make provider columns nullable (for email/password users who don't use OAuth)
ALTER TABLE users ALTER COLUMN provider DROP NOT NULL;
ALTER TABLE users ALTER COLUMN provider_id DROP NOT NULL;

-- Set existing Google OAuth users as email_verified (they're verified by Google)
UPDATE users SET email_verified = true WHERE provider = 'google' AND email_verified IS NULL;

-- Add indexes for token lookups
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

-- Add unique constraint on email if not exists (should already be there but ensure it)
-- This is idempotent
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
    END IF;
END $$;
