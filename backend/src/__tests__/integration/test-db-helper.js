const { Pool } = require('pg');
const path = require('path');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Integration test database helper.
 *
 * Uses the real DATABASE_URL (no schema isolation), tracking every row created
 * so afterAll can delete them cleanly.  No migration run needed — the schema
 * already exists in the shared dev/test DB.
 *
 * Safe because:
 *  - itemize.cloud has no active users (greenfield)
 *  - All seeded rows use obviously-fake test emails
 *  - teardown() always deletes created rows in FK-safe order
 */
class TestDbHelper {
    constructor() {
        this.pool = null;
        this._orgIds = [];   // orgs to delete in teardown
        this._userIds = [];  // users to delete in teardown
    }

    async setup() {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) throw new Error('DATABASE_URL not set. Check backend/.env');

        this.pool = new Pool({
            connectionString: dbUrl,
            ssl: { rejectUnauthorized: false },
            max: 5,
        });

        // Smoke-test the connection
        await this.pool.query('SELECT 1');
    }

    async teardown() {
        if (!this.pool) return;

        try {
            // Delete in reverse FK order.
            // CASCADE on organizations will clean up contacts, org_members, etc.
            if (this._orgIds.length) {
                await this.pool.query(
                    'DELETE FROM organizations WHERE id = ANY($1::int[])',
                    [this._orgIds]
                );
            }
            // Remove users after their orgs are gone
            if (this._userIds.length) {
                await this.pool.query(
                    'DELETE FROM users WHERE id = ANY($1::int[])',
                    [this._userIds]
                );
            }
        } finally {
            await this.pool.end();
            this.pool = null;
        }
    }

    /**
     * Create a verified user + personal organisation.
     * Returns { user, org, token }.
     */
    async seedUser(email, name, password = 'testpassword') {
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(password, 4);

        // Insert user
        const userRes = await this.pool.query(
            `INSERT INTO users (email, name, password_hash, provider, email_verified)
             VALUES ($1, $2, $3, 'email', true) RETURNING *`,
            [email, name, hash]
        );
        const user = userRes.rows[0];
        this._userIds.push(user.id);

        // Create personal org via the shared helper (it also sets default_org on user)
        const { createPersonalOrganization } = require('../../auth/helpers');
        const org = await createPersonalOrganization(this.pool, user.id, user.name);
        this._orgIds.push(org.id);

        // Re-fetch user to pick up default_organization_id
        const fullUser = (await this.pool.query(
            'SELECT * FROM users WHERE id = $1', [user.id]
        )).rows[0];

        const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        return { user: fullUser, org, token };
    }

    /** Upsert a user→org membership */
    async seedOrganizationMember(orgId, userId, role = 'member') {
        await this.pool.query(
            `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
            [orgId, userId, role]
        );
    }

    /** Create a standalone (non-personal) org, optionally adding ownerId as owner */
    async seedOrganization(name, ownerId = null) {
        const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
        const orgRes = await this.pool.query(
            `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING *`,
            [name, slug]
        );
        const org = orgRes.rows[0];
        this._orgIds.push(org.id);
        if (ownerId) await this.seedOrganizationMember(org.id, ownerId, 'owner');
        return org;
    }
}

module.exports = TestDbHelper;
