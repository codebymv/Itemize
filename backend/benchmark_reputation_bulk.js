const { Pool } = require('pg');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/listify'
});

async function runBenchmark() {
  const client = await pool.connect();
  try {
    // Setup
    const orgRes = await client.query(`INSERT INTO organizations (name) VALUES ('Benchmark Org') RETURNING id`);
    const orgId = orgRes.rows[0].id;

    // Create 100 contacts
    const contacts = [];
    for(let i=0; i<100; i++) {
        contacts.push({
            id: i + 1000,
            email: `test${i}@benchmark.com`,
            phone: `555123${i.toString().padStart(4, '0')}`,
            first_name: `Test${i}`,
            last_name: `User${i}`
        });
    }

    const custom_message = 'Please leave a review!';
    const preferred_platform = 'google';
    const activeChannel = 'both';

    console.log("Starting original method benchmark...");
    const start1 = Date.now();

    for (const contact of contacts) {
        const uniqueToken = crypto.randomBytes(32).toString('hex');
        const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        const emailSent = true;
        const smsSent = true;

        await client.query(`
            INSERT INTO review_requests (
                organization_id, contact_id, contact_email, contact_phone, contact_name,
                channel, custom_message, preferred_platform, unique_token, status,
                email_sent, email_sent_at, sms_sent, sms_sent_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sent', $10, $11, $12, $13)
            RETURNING id
        `, [
            orgId,
            null, // just avoid foreign key constraint for benchmark
            contact.email,
            contact.phone,
            contactName,
            activeChannel,
            custom_message || null,
            preferred_platform || null,
            uniqueToken,
            emailSent,
            emailSent ? new Date() : null,
            smsSent,
            smsSent ? new Date() : null
        ]);
    }
    const end1 = Date.now();
    console.log(`Original method took: ${end1 - start1} ms for 100 inserts`);

    console.log("Starting optimized method benchmark...");
    const start2 = Date.now();

    const arr_orgId = [];
    const arr_contactId = [];
    const arr_contactEmail = [];
    const arr_contactPhone = [];
    const arr_contactName = [];
    const arr_channel = [];
    const arr_customMessage = [];
    const arr_preferredPlatform = [];
    const arr_uniqueToken = [];
    const arr_emailSent = [];
    const arr_emailSentAt = [];
    const arr_smsSent = [];
    const arr_smsSentAt = [];

    for (const contact of contacts) {
        const uniqueToken = crypto.randomBytes(32).toString('hex');
        const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        const emailSent = true;
        const smsSent = true;

        arr_orgId.push(orgId);
        arr_contactId.push(null);
        arr_contactEmail.push(contact.email);
        arr_contactPhone.push(contact.phone);
        arr_contactName.push(contactName);
        arr_channel.push(activeChannel);
        arr_customMessage.push(custom_message || null);
        arr_preferredPlatform.push(preferred_platform || null);
        arr_uniqueToken.push(uniqueToken);
        arr_emailSent.push(emailSent);
        arr_emailSentAt.push(emailSent ? new Date() : null);
        arr_smsSent.push(smsSent);
        arr_smsSentAt.push(smsSent ? new Date() : null);
    }

    await client.query(`
        INSERT INTO review_requests (
            organization_id, contact_id, contact_email, contact_phone, contact_name,
            channel, custom_message, preferred_platform, unique_token, status,
            email_sent, email_sent_at, sms_sent, sms_sent_at
        )
        SELECT
            org_id, c_id, c_email, c_phone, c_name,
            c_channel, c_msg, c_plat, c_token, 'sent',
            c_email_sent, c_email_sent_at, c_sms_sent, c_sms_sent_at
        FROM UNNEST(
            $1::int[],
            $2::int[],
            $3::varchar[],
            $4::varchar[],
            $5::varchar[],
            $6::varchar[],
            $7::text[],
            $8::varchar[],
            $9::varchar[],
            $10::boolean[],
            $11::timestamptz[],
            $12::boolean[],
            $13::timestamptz[]
        ) AS t(org_id, c_id, c_email, c_phone, c_name, c_channel, c_msg, c_plat, c_token, c_email_sent, c_email_sent_at, c_sms_sent, c_sms_sent_at)
        RETURNING id
    `, [
        arr_orgId, arr_contactId, arr_contactEmail, arr_contactPhone, arr_contactName,
        arr_channel, arr_customMessage, arr_preferredPlatform, arr_uniqueToken,
        arr_emailSent, arr_emailSentAt, arr_smsSent, arr_smsSentAt
    ]);

    const end2 = Date.now();
    console.log(`Optimized method took: ${end2 - start2} ms for 100 inserts`);

  } catch(err) {
    console.error(err);
  } finally {
    client.release();
    pool.end();
  }
}

runBenchmark();
