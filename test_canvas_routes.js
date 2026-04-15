const { Pool } = require('pg');
const express = require('express');
const request = require('supertest');
const canvasRoutes = require('./backend/src/routes/canvas.routes.js');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/listify'
});

const app = express();
app.use(express.json({ limit: '50mb' }));

// Mock auth middleware
const authMock = (req, res, next) => {
  req.user = { id: 1 };
  next();
};

// Mock broadcast
const broadcastMock = {
  listUpdate: () => {},
  whiteboardUpdate: () => {},
  wireframeUpdate: () => {},
  userWireframeUpdate: () => {}
};

app.use('/api', canvasRoutes(pool, authMock, broadcastMock));

async function setupDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS lists (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            position_x FLOAT,
            position_y FLOAT,
            width FLOAT,
            is_public BOOLEAN,
            share_token TEXT
        );
        TRUNCATE lists;
    `);

    // Insert mock data
    for (let i = 1; i <= 1000; i++) {
        await pool.query(`INSERT INTO lists (id, user_id, position_x, position_y, width) VALUES ($1, 1, 0, 0, 100)`, [i]);
    }
}

async function runBenchmark() {
    await setupDB();

    const updates = [];
    for (let i = 1; i <= 1000; i++) {
        updates.push({
            type: 'list',
            id: i,
            position_x: i * 10,
            position_y: i * 20,
            width: 200
        });
    }

    const start = process.hrtime();

    const res = await request(app)
        .put('/api/canvas/positions')
        .send({ updates });

    const end = process.hrtime(start);
    const timeInMs = (end[0] * 1000) + (end[1] / 1000000);

    console.log("Processed 1000 lists in " + timeInMs.toFixed(2) + "ms");
    console.log("Response status: " + res.status);
    if (res.status !== 200) console.log(res.body);

    pool.end();
}

runBenchmark().catch(console.error);
