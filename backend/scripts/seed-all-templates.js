/**
 * Seed All Email Templates
 * Run with: node scripts/seed-all-templates.js
 * 
 * This script seeds both system and broadcast email templates.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// System templates with file-based HTML
const systemTemplates = [
    { name: 'Welcome Email', slug: 'welcome', category: 'system', subject: 'Welcome to Itemize', filePath: 'system/welcome.html' },
    { name: 'Email Verification', slug: 'verify-email', category: 'system', subject: 'Verify your Itemize email', filePath: 'system/verify-email.html' },
    { name: 'Password Reset', slug: 'reset-password', category: 'system', subject: 'Reset your Itemize password', filePath: 'system/reset-password.html' },
    { name: 'Password Changed', slug: 'password-changed', category: 'system', subject: 'Your Itemize password was changed', filePath: 'system/password-changed.html' },
    { name: 'Upgrade to Starter', slug: 'upgrade-starter', category: 'system', subject: 'Welcome to Itemize Starter', filePath: 'notifications/upgrade-starter.html' },
    { name: 'Upgrade to Growth', slug: 'upgrade-growth', category: 'system', subject: 'Welcome to Itemize Growth', filePath: 'notifications/upgrade-growth.html' },
    { name: 'Upgrade to Enterprise', slug: 'upgrade-enterprise', category: 'system', subject: 'Welcome to Itemize Enterprise', filePath: 'notifications/upgrade-enterprise.html' },
    { name: 'Subscription Cancelled', slug: 'subscription-cancelled', category: 'system', subject: 'Your Itemize subscription has been cancelled', filePath: 'notifications/subscription-cancelled.html' },
];

// Broadcast templates with inline HTML
const broadcastTemplates = [
    {
        name: 'Welcome Newsletter',
        category: 'broadcast',
        subject: 'Welcome to Itemize',
        bodyHtml: `<p style="color: #334155; font-size: 16px; line-height: 1.6;">We're thrilled to have you join our community of organized professionals and teams!</p><p style="color: #334155; font-size: 16px; line-height: 1.6;">Here's what you can do with Itemize:</p><ul style="color: #334155; font-size: 16px; line-height: 1.8; padding-left: 20px;"><li><strong>Create Lists & Notes</strong> - Organize your thoughts and tasks efficiently</li><li><strong>Manage Contacts</strong> - Keep track of your professional network</li><li><strong>Send Invoices</strong> - Bill clients professionally and track payments</li><li><strong>Automate Workflows</strong> - Save time with smart automation</li></ul><p style="color: #64748b; font-size: 14px; margin-top: 32px;">Best regards,<br>The Itemize Team</p>`,
    },
    {
        name: 'Product Update',
        category: 'broadcast',
        subject: 'New Features in Itemize',
        bodyHtml: `<p style="color: #334155; font-size: 16px; line-height: 1.6;">We've been busy building new features to help you stay even more organized.</p><h2 style="color: #0f172a; font-size: 18px; margin-top: 24px; margin-bottom: 12px;">What's New</h2><ul style="color: #334155; font-size: 16px; line-height: 1.8; padding-left: 20px;"><li><strong>Feature 1</strong> - Description of the feature</li><li><strong>Feature 2</strong> - Description of the feature</li></ul><p style="color: #64748b; font-size: 14px; margin-top: 32px;">Happy organizing,<br>The Itemize Team</p>`,
    },
    {
        name: 'Tips & Best Practices',
        category: 'broadcast',
        subject: 'Get More Out of Itemize',
        bodyHtml: `<h1 style="color: #0f172a; font-size: 24px; margin-bottom: 16px;">Pro Tips for Staying Organized</h1><p style="color: #334155; font-size: 16px; line-height: 1.6;">Want to get the most out of Itemize? Here are some tips from our power users.</p><h2 style="color: #0f172a; font-size: 18px; margin-top: 24px;">1. Use Categories</h2><p style="color: #334155; font-size: 16px; line-height: 1.6;">Organize your lists and notes with categories to find things quickly.</p><h2 style="color: #0f172a; font-size: 18px; margin-top: 24px;">2. Set Up Templates</h2><p style="color: #334155; font-size: 16px; line-height: 1.6;">Create templates for recurring tasks to save time.</p><p style="color: #64748b; font-size: 14px; margin-top: 32px;">Questions? Just reply to this email!<br>The Itemize Team</p>`,
    },
    {
        name: 'Subscription Reminder',
        category: 'broadcast',
        subject: 'Your Subscription is Expiring Soon',
        bodyHtml: `<h1 style="color: #0f172a; font-size: 24px; margin-bottom: 16px;">Your Subscription is Expiring</h1><p style="color: #334155; font-size: 16px; line-height: 1.6;">Just a quick heads up - your Itemize subscription is expiring soon.</p><p style="color: #334155; font-size: 16px; line-height: 1.6;">To ensure uninterrupted access to all your organized lists, notes, and workflows, please renew your subscription.</p><p style="text-align: center; margin-top: 24px;"><a href="{{billingUrl}}" class="button-primary">Manage Subscription</a></p><p style="color: #64748b; font-size: 14px; margin-top: 32px;">Keep staying organized,<br>The Itemize Team</p>`,
    },
    {
        name: 'Feedback Request',
        category: 'broadcast',
        subject: "We'd Love Your Feedback",
        bodyHtml: `<h1 style="color: #0f172a; font-size: 24px; margin-bottom: 16px;">How's Your Experience So Far?</h1><p style="color: #334155; font-size: 16px; line-height: 1.6;">You've been using Itemize for a while now, and we'd love to hear your thoughts!</p><ul style="color: #334155; font-size: 16px; line-height: 1.8; padding-left: 20px;"><li>What's working well for you?</li><li>What could be better?</li><li>What features would you like to see?</li></ul><p style="color: #334155; font-size: 16px; line-height: 1.6; margin-top: 24px;">Just reply to this email with your thoughts - we read every response!</p><p style="color: #64748b; font-size: 14px; margin-top: 32px;">Thanks for being part of our journey,<br>The Itemize Team</p>`,
    },
];

function extractVariables(html) {
    const variables = html.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(variables.map(v => v.replace(/\{\{|\}\}/g, '')))];
}

async function seedAllTemplates() {
    console.log('\n========================================');
    console.log('Seeding All Email Templates');
    console.log('========================================\n');

    const emailsDir = path.join(__dirname, '../emails');

    try {
        // Ensure organization_id allows NULL for global templates
        console.log('Ensuring organization_id allows NULL for global templates...');
        await pool.query(`
            ALTER TABLE email_templates 
            ALTER COLUMN organization_id DROP NOT NULL;
        `).catch(() => {
            console.log('✓ Column already allows NULL\n');
        });

        // Find admin user
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

        let systemCreated = 0, systemUpdated = 0, systemSkipped = 0;
        let broadcastCreated = 0, broadcastUpdated = 0;

        // Seed system templates
        console.log('--- System Templates ---');
        for (const template of systemTemplates) {
            const filePath = path.join(emailsDir, template.filePath);

            let bodyHtml;
            try {
                bodyHtml = fs.readFileSync(filePath, 'utf-8');
            } catch (err) {
                console.log(`⚠ File not found: ${template.filePath}, skipping...`);
                systemSkipped++;
                continue;
            }

            const variables = extractVariables(bodyHtml);

            const existing = await pool.query(
                'SELECT id FROM email_templates WHERE name = $1 AND category = $2',
                [template.name, template.category]
            );

            if (existing.rows.length > 0) {
                await pool.query(`
                    UPDATE email_templates
                    SET subject = $1, body_html = $2, variables = $3, updated_at = NOW()
                    WHERE name = $4 AND category = $5
                `, [template.subject, bodyHtml, JSON.stringify(variables), template.name, template.category]);
                console.log(`📝 Updated "${template.name}"`);
                systemUpdated++;
            } else {
                await pool.query(`
                    INSERT INTO email_templates 
                    (organization_id, name, subject, body_html, variables, category, is_active, created_by)
                    VALUES (NULL, $1, $2, $3, $4, $5, true, $6)
                `, [template.name, template.subject, bodyHtml, JSON.stringify(variables), template.category, createdBy]);
                console.log(`✓ Created "${template.name}"`);
                systemCreated++;
            }
        }

        // Seed broadcast templates
        console.log('\n--- Broadcast Templates ---');
        for (const template of broadcastTemplates) {
            const variables = extractVariables(template.bodyHtml);

            const existing = await pool.query(
                'SELECT id FROM email_templates WHERE name = $1 AND category = $2',
                [template.name, template.category]
            );

            if (existing.rows.length > 0) {
                await pool.query(`
                    UPDATE email_templates
                    SET subject = $1, body_html = $2, variables = $3, updated_at = NOW()
                    WHERE name = $4 AND category = $5
                `, [template.subject, template.bodyHtml, JSON.stringify(variables), template.name, template.category]);
                console.log(`📝 Updated "${template.name}"`);
                broadcastUpdated++;
            } else {
                await pool.query(`
                    INSERT INTO email_templates 
                    (organization_id, name, subject, body_html, variables, category, is_active, created_by)
                    VALUES (NULL, $1, $2, $3, $4, $5, true, $6)
                `, [template.name, template.subject, template.bodyHtml, JSON.stringify(variables), template.category, createdBy]);
                console.log(`✓ Created "${template.name}"`);
                broadcastCreated++;
            }
        }

        console.log('\n========================================');
        console.log('Email Template Seeding Complete!');
        console.log('----------------------------------------');
        console.log(`System:    Created: ${systemCreated}, Updated: ${systemUpdated}, Skipped: ${systemSkipped}`);
        console.log(`Broadcast: Created: ${broadcastCreated}, Updated: ${broadcastUpdated}`);
        console.log(`Total:     ${systemCreated + broadcastCreated} created, ${systemUpdated + broadcastUpdated} updated`);
        console.log('========================================\n');

    } catch (error) {
        console.error('Seeding failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

seedAllTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
