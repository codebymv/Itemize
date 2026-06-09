const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'listify',
    password: process.env.PGPASSWORD || 'postgres',
    port: process.env.PGPORT || 5432,
});

async function runBenchmark() {
    const client = await pool.connect();
    try {
        // Create a dummy org
        const orgRes = await client.query(`INSERT INTO organizations (name, slug) VALUES ('Test Org', 'test-org-' || gen_random_uuid()) RETURNING id`);
        const orgId = orgRes.rows[0].id;

        // Create a dummy user
        const userRes = await client.query(`INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role) VALUES ($1, 'test-' || gen_random_uuid() || '@test.com', 'hash', 'Test', 'User', 'admin') RETURNING id`, [orgId]);
        const userId = userRes.rows[0].id;

        // Create a dummy page
        const pageRes = await client.query(`INSERT INTO pages (organization_id, name, slug, author_id) VALUES ($1, 'Test Page', 'test-page-' || gen_random_uuid(), $2) RETURNING id`, [orgId, userId]);
        const pageId = pageRes.rows[0].id;

        const numSections = 100; // Simulate 100 sections
        const sections = [];
        for (let i = 0; i < numSections; i++) {
            sections.push({
                section_type: 'text',
                name: `Section ${i}`,
                content: { text: `Content ${i}` },
                settings: { visibility: true },
                section_order: i
            });
        }

        console.log(`Starting benchmark for ${numSections} sections...`);
        const start = performance.now();

        // Simulate duplicate logic using current sequential approach
        for (const section of sections) {
            await client.query(`
                INSERT INTO page_sections (
                    page_id, organization_id, section_type, name, content, settings, section_order
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                pageId,
                orgId,
                section.section_type,
                section.name,
                JSON.stringify(section.content),
                JSON.stringify(section.settings),
                section.section_order
            ]);
        }

        const end = performance.now();
        console.log(`Sequential inserts took: ${end - start} ms`);

        // Delete sections to reset
        await client.query('DELETE FROM page_sections WHERE page_id = $1', [pageId]);

        // Simulate duplicate logic using proposed UNNEST approach
        const startUnnest = performance.now();

        if (sections.length > 0) {
            await client.query(`
                INSERT INTO page_sections (
                    page_id, organization_id, section_type, name, content, settings, section_order
                )
                SELECT * FROM UNNEST (
                    $1::int[], $2::int[], $3::varchar[], $4::varchar[], $5::jsonb[], $6::jsonb[], $7::int[]
                )
            `, [
                sections.map(() => pageId),
                sections.map(() => orgId),
                sections.map(s => s.section_type),
                sections.map(s => s.name),
                sections.map(s => JSON.stringify(s.content)),
                sections.map(s => JSON.stringify(s.settings)),
                sections.map(s => s.section_order)
            ]);
        }

        const endUnnest = performance.now();
        console.log(`UNNEST batch insert took: ${endUnnest - startUnnest} ms`);

        // Cleanup
        await client.query('DELETE FROM pages WHERE id = $1', [pageId]);
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
        await client.query('DELETE FROM organizations WHERE id = $1', [orgId]);

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

runBenchmark();
