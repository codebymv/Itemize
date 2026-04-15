const { Pool } = require('pg');
const canvasRoutes = require('../backend/src/routes/canvas.routes');
const express = require('express');

async function benchmark() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/listify'
  });

  try {
    const client = await pool.connect();

    // Seed
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vaults (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        position_x FLOAT,
        position_y FLOAT,
        width FLOAT,
        height FLOAT,
        updated_at TIMESTAMP
      )
    `);
    await client.query('TRUNCATE TABLE vaults RESTART IDENTITY');

    let query = 'INSERT INTO vaults (user_id, position_x, position_y, width, height) VALUES ';
    const vaultCount = 200;
    for (let i = 1; i <= vaultCount; i++) {
        query += `(1, 0, 0, 100, 100)${i === vaultCount ? '' : ','}`;
    }
    await client.query(query);
    await client.query('COMMIT');
    client.release();

    const authenticateJWT = (req, res, next) => { req.user = { id: 1 }; next(); };
    const app = express();
    app.use(express.json());
    app.use('/api', canvasRoutes(pool, authenticateJWT, {}));

    const request = require('supertest');
    const updates = Array.from({ length: vaultCount }, (_, i) => ({
      type: 'vault',
      id: i + 1,
      position_x: Math.random() * 1000,
      position_y: Math.random() * 1000,
      width: 200,
      height: 200
    }));

    // warm up
    await request(app).put('/api/canvas/positions').send({ updates: updates.slice(0, 1) });

    const start = process.hrtime.bigint();
    const response = await request(app)
      .put('/api/canvas/positions')
      .send({ updates });
    const end = process.hrtime.bigint();

    if (response.status !== 200) {
        console.error("Failed to update:", response.body);
    } else {
        const durationMs = Number(end - start) / 1e6;
        console.log(`Benchmark completed in ${durationMs.toFixed(2)} ms for ${vaultCount} vault updates`);
    }

  } catch (error) {
    console.error("Benchmark failed:", error);
  } finally {
    const client = await pool.connect();
    await client.query('DROP TABLE IF EXISTS vaults');
    client.release();
    await pool.end();
  }
}

benchmark();
