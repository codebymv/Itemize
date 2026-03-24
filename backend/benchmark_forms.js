const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/itemize'
});

async function runBenchmark() {
  const client = await pool.connect();
  try {
    // Create a dummy org
    const orgRes = await client.query(`
      INSERT INTO organizations (name) VALUES ('Benchmark Org') RETURNING id
    `);
    const orgId = orgRes.rows[0].id;

    // Create a dummy user
    const userRes = await client.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, organization_id, role)
      VALUES ('bench@test.com', 'hash', 'Bench', 'User', $1, 'admin')
      RETURNING id
    `, [orgId]);
    const userId = userRes.rows[0].id;

    const numFields = 100;
    const iterations = 10;

    // Simulate the exact logic in POST /api/forms for field insertion
    console.log(`Running baseline benchmark with ${numFields} fields over ${iterations} iterations...`);

    let totalTime = 0;

    for (let iter = 0; iter < iterations; iter++) {
      const formId = crypto.randomUUID();
      // Insert dummy form to satisfy FK (assuming uuid)
      await client.query(`
        INSERT INTO forms (id, organization_id, name, slug, type, created_by)
        VALUES ($1, $2, 'Test Form', $3, 'form', $4)
      `, [formId, orgId, `test-form-${iter}-${Date.now()}`, userId]);

      const fields = Array.from({ length: numFields }).map((_, i) => ({
        field_type: 'text',
        label: `Field ${i}`,
        placeholder: `Placeholder ${i}`,
        help_text: `Help ${i}`,
        is_required: i % 2 === 0,
        validation: {},
        options: [],
        width: 'full',
        conditions: [],
        map_to_contact_field: null
      }));

      const start = performance.now();

      // The current N+1 way
      for (let i = 0; i < fields.length; i++) {
          const field = fields[i];
          await client.query(`
            INSERT INTO form_fields (
              form_id, field_type, label, placeholder, help_text,
              is_required, validation, options, field_order, width,
              conditions, map_to_contact_field
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
              formId,
              field.field_type,
              field.label,
              field.placeholder || null,
              field.help_text || null,
              field.is_required || false,
              JSON.stringify(field.validation || {}),
              JSON.stringify(field.options || []),
              i,
              field.width || 'full',
              JSON.stringify(field.conditions || []),
              field.map_to_contact_field || null
          ]);
      }

      const end = performance.now();
      totalTime += (end - start);
    }

    console.log(`Baseline Average Time per form (${numFields} fields): ${(totalTime / iterations).toFixed(2)} ms`);

    // Clean up
    await client.query('DELETE FROM forms WHERE organization_id = $1', [orgId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('DELETE FROM organizations WHERE id = $1', [orgId]);

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    pool.end();
  }
}

runBenchmark();
