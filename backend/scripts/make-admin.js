/**
 * Make Admin Script
 * Promotes a user to admin role
 * 
 * Usage: node scripts/make-admin.js user@example.com
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('pg');

const emailToMakeAdmin = process.argv[2];

async function makeAdmin() {
    console.log('\n========================================');
    console.log('Make User Admin');
    console.log('========================================\n');

    if (!emailToMakeAdmin) {
        console.error('Usage: node scripts/make-admin.js <email>');
        console.error('Example: node scripts/make-admin.js admin@example.com');
        process.exit(1);
    }

    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is not defined in your .env file.');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        console.log(`Looking up user: ${emailToMakeAdmin}`);

        // Find the user
        const findResult = await pool.query(
            'SELECT id, email, name, role FROM users WHERE email = $1',
            [emailToMakeAdmin]
        );

        if (findResult.rows.length === 0) {
            console.error(`User not found: ${emailToMakeAdmin}`);
            process.exit(1);
        }

        const user = findResult.rows[0];
        console.log(`Found user: ${user.name || user.email}`);
        console.log(`Current role: ${user.role || 'USER (not set)'}`);

        if (user.role === 'ADMIN') {
            console.log('\n✓ User is already an admin!');
            return;
        }

        console.log('\nUpdating role to ADMIN...');
        
        await pool.query(
            "UPDATE users SET role = 'ADMIN', updated_at = NOW() WHERE email = $1",
            [emailToMakeAdmin]
        );

        console.log('✓ User is now an admin!');
        console.log('\n========================================');
        console.log('Done! User will have admin access on next login.');
        console.log('========================================\n');
    } catch (error) {
        console.error('Failed to make user admin:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

makeAdmin().catch(error => {
    console.error(error);
    process.exit(1);
});
