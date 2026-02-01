# Onboarding System - Quick Start Guide

## 🚀 Step 1: Run Database Migration

Execute the onboarding migration to add the necessary database columns and tables:

```bash
cd /workspaces/Itemize/backend
node scripts/execute-migration.js runOnboardingMigration
```

**What this does:**
- Adds `onboarding_progress` JSONB column to `users` table
- Creates GIN index for efficient JSONB queries
- Creates `onboarding_events` table for analytics (optional tracking)
- Creates indexes for fast event lookups

## 📊 Step 2: Manage User Onboarding (Utility Script)

### View User's Onboarding Progress
```bash
cd /workspaces/Itemize/backend
node scripts/init-onboarding.js view user@example.com
```

### Reset All Onboarding for a User
```bash
node scripts/init-onboarding.js reset user@example.com
```

### Reset Specific Feature Onboarding
```bash
node scripts/init-onboarding.js reset user@example.com canvas
```

### Manually Mark Feature as Seen (Testing)
```bash
node scripts/init-onboarding.js mark-seen user@example.com lists
```

## 🗂️ Database Schema

### Users Table - New Column
```sql
onboarding_progress JSONB DEFAULT '{}'::jsonb
```

**Example Data Structure:**
```json
{
  "canvas": {
    "seen": true,
    "timestamp": "2026-02-01T10:30:00.000Z",
    "version": "1.0",
    "dismissed": false,
    "step_completed": 3
  },
  "lists": {
    "seen": true,
    "timestamp": "2026-02-01T11:00:00.000Z",
    "version": "1.0",
    "dismissed": false
  },
  "notes": {
    "seen": false
  }
}
```

### Onboarding Events Table (Analytics)
```sql
CREATE TABLE onboarding_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  feature_key VARCHAR(50) NOT NULL,
  event_type VARCHAR(20) NOT NULL,  -- 'viewed', 'dismissed', 'completed', 'skipped'
  version VARCHAR(10) DEFAULT '1.0',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🔍 Useful SQL Queries

### Check Onboarding Progress for a User
```sql
SELECT 
  email, 
  name, 
  onboarding_progress 
FROM users 
WHERE email = 'user@example.com';
```

### Find Users Who Haven't Seen Canvas
```sql
SELECT email, name
FROM users
WHERE onboarding_progress->>'canvas' IS NULL
   OR (onboarding_progress->'canvas'->>'seen')::boolean = false;
```

### Count Users Who Completed Feature Onboarding
```sql
SELECT 
  feature_key,
  COUNT(*) as users_count
FROM (
  SELECT 
    email,
    jsonb_object_keys(onboarding_progress) as feature_key
  FROM users
  WHERE (onboarding_progress->>jsonb_object_keys(onboarding_progress))::jsonb->>'seen' = 'true'
) as feature_stats
GROUP BY feature_key
ORDER BY users_count DESC;
```

### Get Onboarding Events for Analytics
```sql
SELECT 
  u.email,
  oe.feature_key,
  oe.event_type,
  oe.created_at
FROM onboarding_events oe
JOIN users u ON u.id = oe.user_id
WHERE u.email = 'user@example.com'
ORDER BY oe.created_at DESC;
```

### Feature Dismissal Rate
```sql
SELECT 
  feature_key,
  COUNT(*) FILTER (WHERE event_type = 'dismissed') * 100.0 / COUNT(*) as dismissal_rate
FROM onboarding_events
WHERE event_type IN ('viewed', 'dismissed')
GROUP BY feature_key
ORDER BY dismissal_rate DESC;
```

## 📝 Next Steps

After running the migration, you can proceed with:

1. **Backend API Development** - Create onboarding routes and controllers
2. **Frontend Context** - Set up OnboardingContext for state management
3. **UI Components** - Build the OnboardingModal component
4. **Content Creation** - Define onboarding content for each feature
5. **Integration** - Add onboarding triggers to existing pages

See `ONBOARDING_IMPLEMENTATION_PLAN.md` for the complete implementation roadmap.

## 🧪 Testing the Migration

### Verify Column was Added
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name = 'onboarding_progress';
```

### Verify Index was Created
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'users' 
  AND indexname = 'idx_users_onboarding_progress';
```

### Verify Events Table was Created
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'onboarding_events';
```

## 🔄 Rollback (if needed)

If you need to rollback the migration:

```sql
-- Remove onboarding_progress column
ALTER TABLE users DROP COLUMN IF EXISTS onboarding_progress;

-- Drop index
DROP INDEX IF EXISTS idx_users_onboarding_progress;

-- Drop events table
DROP TABLE IF EXISTS onboarding_events;
```

## 💡 Tips

- The utility script is safe to run multiple times
- Use `view` command frequently during development to check progress
- Reset individual features during testing instead of full resets
- The `mark-seen` command is useful for simulating user progression in tests
- Check the `onboarding_events` table for analytics insights

---

**Created:** February 2026  
**Version:** 1.0
