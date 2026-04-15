const express = require('express');
const request = require('supertest');
const canvasRoutes = require('../backend/src/routes/canvas.routes');

async function benchmark() {
  const mockPool = {
    connect: async () => ({
      query: async (text, params) => {
        // simulate a small db latency
        await new Promise(r => setTimeout(r, 2));

        if (text.includes('UPDATE vaults AS t')) {
            // Mocking UNNEST update
            const result = [];
            if (params && params.length >= 6) {
                const ids = params[0];
                for(let i = 0; i < ids.length; i++) {
                    result.push({ id: ids[i] });
                }
            }
            return { rows: result };
        } else if (text.includes('UPDATE vaults SET')) {
            // Mocking N+1 update
            return { rows: [{ id: params[4] }] };
        }
        return { rows: [] };
      },
      release: () => {}
    })
  };

  const app = express();
  app.use(express.json());

  const authenticateJWT = (req, res, next) => { req.user = { id: 1 }; next(); };
  app.use('/api', canvasRoutes(mockPool, authenticateJWT, {}));

  const vaultCount = 200;
  const updates = Array.from({ length: vaultCount }, (_, i) => ({
    type: 'vault',
    id: i + 1,
    position_x: Math.random() * 1000,
    position_y: Math.random() * 1000,
    width: 200,
    height: 200
  }));

  // Warm-up
  await request(app).put('/api/canvas/positions').send({ updates: updates.slice(0, 1) });

  const start = process.hrtime.bigint();
  const response = await request(app).put('/api/canvas/positions').send({ updates });
  const end = process.hrtime.bigint();

  if (response.status !== 200) {
    console.error("Failed to update:", response.body);
  } else {
    const durationMs = Number(end - start) / 1e6;
    console.log(`Mock Benchmark completed in ${durationMs.toFixed(2)} ms for ${vaultCount} vault updates`);
  }
}

benchmark();
