/**
 * Seed System Email Templates
 * Run with: node scripts/seed-system-templates.js
 * 
 * This script seeds system email templates that are available globally
 * (not tied to a specific organization).
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// System templates with their file-based HTML content
const systemTemplates = [
    {
        name: 'Welcome Email',
        slug: 'welcome',
        category: 'system',
        subject: 'Welcome to Itemize',
        filePath: 'system/welcome.html',
    },
    {
        name: 'Email Verification',
        slug: 'verify-email',
        category: 'system',
        subject: 'Verify your Itemize email',
        filePath: 'system/verify-email.html',
    },
    {
        name: 'Password Reset',
        slug: 'reset-password',
        category: 'system',
        subject: 'Reset your Itemize password',
        filePath: 'system/reset-password.html',
    },
    {
        name: 'Password Changed',
        slug: 'password-changed',
        category: 'system',
        subject: 'Your Itemize password was changed',
        filePath: 'system/password-changed.html',
    },
    {
        name: 'Upgrade to Starter',
        slug: 'upgrade-starter',
        category: 'system',
        subject: 'Welcome to Itemize Starter',
        filePath: 'notifications/upgrade-starter.html',
    },
    {
        name: 'Upgrade to Growth',
        slug: 'upgrade-growth',
        category: 'system',
        subject: 'Welcome to Itemize Growth',
        filePath: 'notifications/upgrade-growth.html',
    },
    {
        name: 'Upgrade to Enterprise',
        slug: 'upgrade-enterprise',
        category: 'system',
        subject: 'Welcome to Itemize Enterprise',
        filePath: 'notifications/upgrade-enterprise.html',
    },
    {
        name: 'Subscription Cancelled',
        slug: 'subscription-cancelled',
        category: 'system',
        subject: 'Your Itemize subscription has been cancelled',
        filePath: 'notifications/subscription-cancelled.html',
    },
];

async function seedSystemTemplates() {
    console.log('\n========================================');
    console.log('Seeding System Email Templates');
    console.log('========================================\n');

    const emailsDir = path.join(__dirname, '../emails');

    try {
        // First, ensure organization_id can be null for system templates
        console.log('Ensuring organization_id allows NULL...');
        await pool.query(`
            ALTER TABLE email_templates 
            ALTER COLUMN organization_id DROP NOT NULL;
        `).catch(() => {
            console.log('Column already allows NULL or table structure is correct');
        });

        // Find an admin user to be the creator
        const adminResult = await pool.query(`
            SELECT id, email FROM users WHERE role = 'ADMIN' LIMIT 1
        `);

        let createdBy = null;
        if (adminResult.rows.length > 0) {
            createdBy = adminResult.rows[0].id;
            console.log(`Using admin user: ${adminResult.rows[0].email}\n`);
        } else {
            console.log('No admin user found, templates will have null created_by\n');
        }

        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const template of systemTemplates) {
            const filePath = path.join(emailsDir, template.filePath);

            // Read HTML from file
            let bodyHtml;
            try {
                bodyHtml = fs.readFileSync(filePath, 'utf-8');
            } catch (err) {
                console.log(`⚠ File not found: ${template.filePath}, skipping...`);
                skipped++;
                continue;
            }

            // Extract variables from template
            const variables = bodyHtml.match(/\{\{(\w+)\}\}/g) || [];
            const uniqueVars = [...new Set(variables.map(v => v.replace(/\{\{|\}\}/g, '')))];

            // Check if template already exists by name and category
            const existing = await pool.query(
                'SELECT id FROM email_templates WHERE name = $1 AND category = $2',
                [template.name, template.category]
            );

            if (existing.rows.length > 0) {
                console.log(`📝 Updating "${template.name}"...`);
                await pool.query(`
                    UPDATE email_templates
                    SET subject = $1,
                        body_html = $2,
                        variables = $3,
                        updated_at = NOW()
                    WHERE name = $4 AND category = $5
                `, [template.subject, bodyHtml, JSON.stringify(uniqueVars), template.name, template.category]);
                updated++;
            } else {
                // Insert new template with NULL organization_id
                await pool.query(`
                    INSERT INTO email_templates 
                    (organization_id, name, subject, body_html, variables, category, is_active, created_by)
                    VALUES (NULL, $1, $2, $3, $4, $5, true, $6)
                `, [template.name, template.subject, bodyHtml, JSON.stringify(uniqueVars), template.category, createdBy]);

                console.log(`✓ Created "${template.name}" (${template.category})`);
                created++;
            }
        }

        console.log('\n========================================');
        console.log('System templates seeding complete!');
        console.log(`Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
        console.log('========================================\n');

    } catch (error) {
        console.error('Seeding failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

seedSystemTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
