/**
 * Seed Broadcast Email Templates
 * Run with: node scripts/seed-broadcast-templates.js
 * 
 * This script seeds broadcast/marketing email templates that are available globally.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Broadcast templates with inline HTML content
const broadcastTemplates = [
    {
        name: 'Welcome Newsletter',
        category: 'broadcast',
        subject: 'Welcome to Itemize',
        bodyHtml: `
<p style="color: #334155; font-size: 16px; line-height: 1.6;">
  We're thrilled to have you join our community of organized professionals and teams!
</p>
<p style="color: #334155; font-size: 16px; line-height: 1.6;">
  Here's what you can do with Itemize:
</p>
<ul style="color: #334155; font-size: 16px; line-height: 1.8; padding-left: 20px;">
  <li><strong>Create Lists & Notes</strong> - Organize your thoughts and tasks efficiently</li>
  <li><strong>Manage Contacts</strong> - Keep track of your professional network</li>
  <li><strong>Send Invoices</strong> - Bill clients professionally and track payments</li>
  <li><strong>Automate Workflows</strong> - Save time with smart automation</li>
</ul>
<p style="color: #64748b; font-size: 14px; margin-top: 32px;">
  Best regards,<br>The Itemize Team
</p>
        `.trim(),
    },
    {
        name: 'Product Update',
        category: 'broadcast',
        subject: 'New Features in Itemize',
        bodyHtml: `
<p style="color: #334155; font-size: 16px; line-height: 1.6;">
  We've been busy building new features to help you stay even more organized.
</p>
<h2 style="color: #0f172a; font-size: 18px; margin-top: 24px; margin-bottom: 12px;">What's New</h2>
<ul style="color: #334155; font-size: 16px; line-height: 1.8; padding-left: 20px;">
  <li><strong>Feature 1</strong> - Description of the feature</li>
  <li><strong>Feature 2</strong> - Description of the feature</li>
</ul>
<p style="color: #64748b; font-size: 14px; margin-top: 32px;">
  Happy organizing,<br>The Itemize Team
</p>
        `.trim(),
    },
    {
        name: 'Tips & Best Practices',
        category: 'broadcast',
        subject: 'Get More Out of Itemize',
        bodyHtml: `
<h1 style="color: #0f172a; font-size: 24px; margin-bottom: 16px;">Pro Tips for Staying Organized</h1>
<p style="color: #334155; font-size: 16px; line-height: 1.6;">
  Want to get the most out of Itemize? Here are some tips from our power users.
</p>
<h2 style="color: #0f172a; font-size: 18px; margin-top: 24px;">1. Use Categories</h2>
<p style="color: #334155; font-size: 16px; line-height: 1.6;">
  Organize your lists and notes with categories to find things quickly.
</p>
<h2 style="color: #0f172a; font-size: 18px; margin-top: 24px;">2. Set Up Templates</h2>
<p style="color: #334155; font-size: 16px; line-height: 1.6;">
  Create templates for recurring tasks to save time.
</p>
<h2 style="color: #0f172a; font-size: 18px; margin-top: 24px;">3. Enable Automations</h2>
<p style="color: #334155; font-size: 16px; line-height: 1.6;">
  Let Itemize handle repetitive tasks automatically.
</p>
<p style="color: #64748b; font-size: 14px; margin-top: 32px;">
  Questions? Just reply to this email!<br>The Itemize Team
</p>
        `.trim(),
    },
    {
        name: 'Subscription Reminder',
        category: 'broadcast',
        subject: 'Your Subscription is Expiring Soon',
        bodyHtml: `
<h1 style="color: #0f172a; font-size: 24px; margin-bottom: 16px;">Your Subscription is Expiring</h1>
<p style="color: #334155; font-size: 16px; line-height: 1.6;">
  Just a quick heads up - your Itemize subscription is expiring soon.
</p>
<p style="color: #334155; font-size: 16px; line-height: 1.6;">
  To ensure uninterrupted access to all your organized lists, notes, and workflows, please renew your subscription.
</p>
<p style="text-align: center; margin-top: 24px;">
  <a href="{{billingUrl}}" class="button-primary">Manage Subscription</a>
</p>
<p style="color: #64748b; font-size: 14px; margin-top: 32px;">
  Keep staying organized,<br>The Itemize Team
</p>
        `.trim(),
    },
    {
        name: 'Feedback Request',
        category: 'broadcast',
        subject: "We'd Love Your Feedback",
        bodyHtml: `
<h1 style="color: #0f172a; font-size: 24px; margin-bottom: 16px;">How's Your Experience So Far?</h1>
<p style="color: #334155; font-size: 16px; line-height: 1.6;">
  You've been using Itemize for a while now, and we'd love to hear your thoughts!
</p>
<ul style="color: #334155; font-size: 16px; line-height: 1.8; padding-left: 20px;">
  <li>What's working well for you?</li>
  <li>What could be better?</li>
  <li>What features would you like to see?</li>
</ul>
<p style="color: #334155; font-size: 16px; line-height: 1.6; margin-top: 24px;">
  Just reply to this email with your thoughts - we read every response!
</p>
<p style="color: #64748b; font-size: 14px; margin-top: 32px;">
  Thanks for being part of our journey,<br>The Itemize Team
</p>
        `.trim(),
    },
];

async function seedBroadcastTemplates() {
    console.log('\n========================================');
    console.log('Seeding Broadcast Email Templates');
    console.log('========================================\n');

    try {
        // Ensure organization_id allows NULL
        await pool.query(`
            ALTER TABLE email_templates 
            ALTER COLUMN organization_id DROP NOT NULL;
        `).catch(() => {
            console.log('Column already allows NULL');
        });

        // Find an admin user
        const adminResult = await pool.query(`
            SELECT id, email FROM users WHERE role = 'ADMIN' LIMIT 1
        `);

        let createdBy = null;
        if (adminResult.rows.length > 0) {
            createdBy = adminResult.rows[0].id;
            console.log(`Using admin user: ${adminResult.rows[0].email}\n`);
        }

        let created = 0;
        let updated = 0;

        for (const template of broadcastTemplates) {
            // Extract variables
            const variables = template.bodyHtml.match(/\{\{(\w+)\}\}/g) || [];
            const uniqueVars = [...new Set(variables.map(v => v.replace(/\{\{|\}\}/g, '')))];

            // Check if exists
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
                `, [template.subject, template.bodyHtml, JSON.stringify(uniqueVars), template.name, template.category]);
                updated++;
            } else {
                await pool.query(`
                    INSERT INTO email_templates 
                    (organization_id, name, subject, body_html, variables, category, is_active, created_by)
                    VALUES (NULL, $1, $2, $3, $4, $5, true, $6)
                `, [template.name, template.subject, template.bodyHtml, JSON.stringify(uniqueVars), template.category, createdBy]);

                console.log(`✓ Created "${template.name}" (${template.category})`);
                created++;
            }
        }

        console.log('\n========================================');
        console.log('Broadcast templates seeding complete!');
        console.log(`Created: ${created}, Updated: ${updated}`);
        console.log('========================================\n');

    } catch (error) {
        console.error('Seeding failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

seedBroadcastTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
