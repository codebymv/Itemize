# Database Migrations

## Running Migrations

This project uses a migration system where migration functions are defined in `src/db_*_migrations.js` files and executed using the `execute-migration.js` script.

### Email/Password Authentication Migration

To add email/password authentication support to the database, run:

```bash
cd backend
node scripts/execute-migration.js runEmailPasswordAuthMigration
```

This will add:
- `password_hash` - Stores bcrypt hashed passwords
- `email_verified` - Boolean flag for email verification status
- `verification_token` - Token for email verification
- `verification_token_expires` - Expiry timestamp for verification token
- `password_reset_token` - Token for password reset
- `password_reset_expires` - Expiry timestamp for reset token
- `role` - User role (default: 'USER')
- Makes `provider` and `provider_id` nullable (for non-OAuth users)
- Creates indexes for fast token lookups
- Marks existing Google OAuth users as verified

### Alternative: SQL File

You can also run the migration directly via SQL:

```bash
psql $DATABASE_URL -f migrations/auth_migration.sql
```

## Other Migrations

To see all available migrations:

```bash
node scripts/execute-migration.js
```

This will list all available migration functions from the various `db_*_migrations.js` files.
