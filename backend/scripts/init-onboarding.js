/**
 * Onboarding Management Script
 * Utility for viewing and managing user onboarding progress
 * 
 * Usage:
 *   node scripts/init-onboarding.js view user@example.com
 *   node scripts/init-onboarding.js reset user@example.com
 *   node scripts/init-onboarding.js reset user@example.com canvas
 *   node scripts/init-onboarding.js mark-seen user@example.com lists
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('pg');

const command = process.argv[2];
const userEmail = process.argv[3];
const featureKey = process.argv[4];

async function viewOnboardingProgress(pool, email) {
    console.log(`\n📊 Onboarding Progress for: ${email}`);
    console.log('='.repeat(60));
    
    const result = await pool.query(
        'SELECT id, email, name, onboarding_progress FROM users WHERE email = $1',
        [email]
    );
    
    if (result.rows.length === 0) {
        console.error(`❌ User not found: ${email}`);
        return false;
    }
    
    const user = result.rows[0];
    const progress = user.onboarding_progress || {};
    
    console.log(`\nUser: ${user.name || user.email}`);
    console.log(`User ID: ${user.id}\n`);
    
    if (Object.keys(progress).length === 0) {
        console.log('📭 No onboarding progress recorded yet.\n');
        return true;
    }
    
    console.log('Feature Progress:');
    console.log('-'.repeat(60));
    
    Object.entries(progress).forEach(([feature, data]) => {
        console.log(`\n🎯 ${feature.toUpperCase()}`);
        console.log(`   Seen: ${data.seen ? '✓' : '✗'}`);
        if (data.timestamp) {
            console.log(`   Timestamp: ${new Date(data.timestamp).toLocaleString()}`);
        }
        if (data.version) {
            console.log(`   Version: ${data.version}`);
        }
        if (data.dismissed !== undefined) {
            console.log(`   Dismissed: ${data.dismissed ? 'Yes' : 'No'}`);
        }
        if (data.step_completed !== undefined) {
            console.log(`   Steps Completed: ${data.step_completed}`);
        }
    });
    
    console.log('\n' + '='.repeat(60) + '\n');
    return true;
}

async function resetOnboarding(pool, email, feature = null) {
    console.log(`\n🔄 Reset Onboarding for: ${email}`);
    console.log('='.repeat(60) + '\n');
    
    const findResult = await pool.query(
        'SELECT id, email, name FROM users WHERE email = $1',
        [email]
    );
    
    if (findResult.rows.length === 0) {
        console.error(`❌ User not found: ${email}`);
        return false;
    }
    
    const user = findResult.rows[0];
    
    if (feature) {
        // Reset specific feature
        console.log(`Resetting onboarding for feature: ${feature}`);
        
        await pool.query(
            `UPDATE users 
             SET onboarding_progress = onboarding_progress - $1,
                 updated_at = NOW()
             WHERE email = $2`,
            [feature, email]
        );
        
        console.log(`✅ Reset onboarding for "${feature}" feature`);
    } else {
        // Reset all onboarding
        console.log('Resetting ALL onboarding progress...');
        
        await pool.query(
            `UPDATE users 
             SET onboarding_progress = '{}'::jsonb,
                 updated_at = NOW()
             WHERE email = $1`,
            [email]
        );
        
        console.log('✅ Reset all onboarding progress');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('Done! User will see onboarding tutorials again.');
    console.log('='.repeat(60) + '\n');
    return true;
}

async function markFeatureSeen(pool, email, feature) {
    console.log(`\n✓ Mark Feature Seen: ${feature} for ${email}`);
    console.log('='.repeat(60) + '\n');
    
    const findResult = await pool.query(
        'SELECT id, email FROM users WHERE email = $1',
        [email]
    );
    
    if (findResult.rows.length === 0) {
        console.error(`❌ User not found: ${email}`);
        return false;
    }
    
    const timestamp = new Date().toISOString();
    const progressUpdate = {
        seen: true,
        timestamp: timestamp,
        version: '1.0'
    };
    
    await pool.query(
        `UPDATE users 
         SET onboarding_progress = jsonb_set(
             COALESCE(onboarding_progress, '{}'::jsonb),
             $1::text[],
             $2::jsonb,
             true
         ),
         updated_at = NOW()
         WHERE email = $3`,
        [`{${feature}}`, JSON.stringify(progressUpdate), email]
    );
    
    console.log(`✅ Marked "${feature}" as seen`);
    console.log(`   Timestamp: ${new Date(timestamp).toLocaleString()}`);
    console.log('\n' + '='.repeat(60) + '\n');
    return true;
}

async function showUsage() {
    console.log('\n📚 Onboarding Management Script');
    console.log('='.repeat(60));
    console.log('\nUsage:');
    console.log('  node scripts/init-onboarding.js <command> <email> [feature]');
    console.log('\nCommands:');
    console.log('  view <email>                 - View onboarding progress');
    console.log('  reset <email>                - Reset all onboarding');
    console.log('  reset <email> <feature>      - Reset specific feature');
    console.log('  mark-seen <email> <feature>  - Mark feature as seen');
    console.log('\nExamples:');
    console.log('  node scripts/init-onboarding.js view user@example.com');
    console.log('  node scripts/init-onboarding.js reset user@example.com');
    console.log('  node scripts/init-onboarding.js reset user@example.com canvas');
    console.log('  node scripts/init-onboarding.js mark-seen user@example.com lists');
    console.log('\nCommon Features:');
    console.log('  canvas, lists, notes, whiteboards, contacts, pipelines,');
    console.log('  invoices, automations, calendars, estimates, forms');
    console.log('\n' + '='.repeat(60) + '\n');
}

async function main() {
    if (!command || !userEmail) {
        await showUsage();
        process.exit(1);
    }
    
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is not defined in your .env file.');
        process.exit(1);
    }
    
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });
    
    try {
        let success = false;
        
        switch(command.toLowerCase()) {
            case 'view':
                success = await viewOnboardingProgress(pool, userEmail);
                break;
                
            case 'reset':
                success = await resetOnboarding(pool, userEmail, featureKey);
                break;
                
            case 'mark-seen':
            case 'markseen':
                if (!featureKey) {
                    console.error('❌ Feature key required for mark-seen command');
                    await showUsage();
                    process.exit(1);
                }
                success = await markFeatureSeen(pool, userEmail, featureKey);
                break;
                
            default:
                console.error(`❌ Unknown command: ${command}`);
                await showUsage();
                process.exit(1);
        }
        
        if (!success) {
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
