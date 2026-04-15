const { Pool } = require('pg');

async function runBenchmark() {
    const pool = new Pool({
        user: 'postgres',
        host: 'localhost',
        database: 'listify',
        password: 'postgres',
        port: 5432,
    });

    try {
        const res = await pool.query('SELECT NOW()');
        console.log('Connected to DB:', res.rows[0]);
    } catch (err) {
        console.error('Failed to connect to DB', err);
        process.exit(1);
    }

    // Create an organization and a user
    const orgRes = await pool.query('INSERT INTO organizations (name) VALUES ($1) RETURNING id', ['Test Org Bench']);
    const orgId = orgRes.rows[0].id;

    const userRes = await pool.query('INSERT INTO users (email, password_hash, name, organization_id) VALUES ($1, $2, $3, $4) RETURNING id', ['bench@test.com', 'hash', 'Bench User', orgId]);
    const userId = userRes.rows[0].id;

    // Set up a base page to duplicate
    const pageRes = await pool.query(`
        INSERT INTO pages (
            organization_id, name, description, slug, theme, settings,
            seo_title, seo_description, seo_keywords, og_image, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
    `, [
        orgId, 'Base Page', 'Desc', 'base-page-slug-bench', '{}', '{}', '', '', '', '', userId
    ]);
    const pageId = pageRes.rows[0].id;

    // Insert 100 sections into this base page to see N+1 cost clearly
    const numSections = 100;
    for (let i = 0; i < numSections; i++) {
        await pool.query(`
            INSERT INTO page_sections (
                page_id, organization_id, section_type, name, content, settings, section_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            pageId, orgId, 'hero', `Section ${i}`, '{}', '{}', i
        ]);
    }

    const sectionsResult = await pool.query(
        'SELECT * FROM page_sections WHERE page_id = $1 ORDER BY section_order',
        [pageId]
    );

    console.log('Starting benchmark: N+1 ...');

    const startTimeN1 = process.hrtime.bigint();

    const newPageResN1 = await pool.query(`
        INSERT INTO pages (
            organization_id, name, description, slug, theme, settings,
            seo_title, seo_description, seo_keywords, og_image, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
    `, [
        orgId, 'Base Page Copy', 'Desc', 'base-page-slug-bench-copy-1', '{}', '{}', '', '', '', '', userId
    ]);
    const newPageIdN1 = newPageResN1.rows[0].id;

    for (const section of sectionsResult.rows) {
        await pool.query(`
            INSERT INTO page_sections (
                page_id, organization_id, section_type, name, content, settings, section_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            newPageIdN1,
            orgId,
            section.section_type,
            section.name,
            JSON.stringify(section.content),
            JSON.stringify(section.settings),
            section.section_order
        ]);
    }

    const endTimeN1 = process.hrtime.bigint();
    const durationMsN1 = Number(endTimeN1 - startTimeN1) / 1e6;
    console.log(`Original N+1 duration for 100 sections: ${durationMsN1.toFixed(2)} ms`);


    console.log('Starting benchmark: UNNEST ...');

    const startTimeUnnest = process.hrtime.bigint();

    const newPageResUnnest = await pool.query(`
        INSERT INTO pages (
            organization_id, name, description, slug, theme, settings,
            seo_title, seo_description, seo_keywords, og_image, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
    `, [
        orgId, 'Base Page Copy 2', 'Desc', 'base-page-slug-bench-copy-2', '{}', '{}', '', '', '', '', userId
    ]);
    const newPageIdUnnest = newPageResUnnest.rows[0].id;

    const u_page_ids = [];
    const u_organization_ids = [];
    const u_section_types = [];
    const u_names = [];
    const u_contents = [];
    const u_settings = [];
    const u_section_orders = [];

    for (const section of sectionsResult.rows) {
        u_page_ids.push(newPageIdUnnest);
        u_organization_ids.push(orgId);
        u_section_types.push(section.section_type);
        u_names.push(section.name);
        u_contents.push(JSON.stringify(section.content));
        u_settings.push(JSON.stringify(section.settings));
        u_section_orders.push(section.section_order);
    }

    if (u_page_ids.length > 0) {
        await pool.query(`
            INSERT INTO page_sections (
                page_id, organization_id, section_type, name, content, settings, section_order
            ) SELECT * FROM UNNEST(
                $1::int[], $2::int[], $3::varchar[], $4::varchar[], $5::jsonb[], $6::jsonb[], $7::int[]
            )
        `, [
            u_page_ids, u_organization_ids, u_section_types, u_names,
            u_contents, u_settings, u_section_orders
        ]);
    }

    const endTimeUnnest = process.hrtime.bigint();
    const durationMsUnnest = Number(endTimeUnnest - startTimeUnnest) / 1e6;
    console.log(`Optimized UNNEST duration for 100 sections: ${durationMsUnnest.toFixed(2)} ms`);

    // Cleanup
    await pool.query('DELETE FROM page_sections WHERE organization_id = $1', [orgId]);
    await pool.query('DELETE FROM pages WHERE organization_id = $1', [orgId]);
    await pool.query('DELETE FROM users WHERE organization_id = $1', [orgId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);

    await pool.end();
}

runBenchmark();
