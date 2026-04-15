/**
 * Canvas Routes - Batch canvas position updates
 */
const express = require('express');
const router = express.Router();
const { withDbClient } = require('../utils/db');
const { sendBadRequest, sendError, sendSuccess } = require('../utils/response');

module.exports = (pool, authenticateJWT, broadcast) => {
  router.put('/canvas/positions', authenticateJWT, async (req, res) => {
    try {
      const updates = req.body?.updates;

      if (!Array.isArray(updates) || updates.length === 0) {
        return sendBadRequest(res, 'updates array is required');
      }

      const updated = [];
      const failed = [];

      const validTypes = ['list', 'note', 'whiteboard', 'wireframe', 'vault'];
      const updatesByType = {};
      validTypes.forEach(type => updatesByType[type] = []);

      await withDbClient(pool, async (client) => {
        // Group updates by type and filter invalid
        for (const update of updates) {
          const { type, id, position_x, position_y, width, height } = update || {};

          if (!type || id === undefined || id === null || typeof position_x !== 'number' || typeof position_y !== 'number') {
            failed.push({ type, id, error: 'Invalid update payload' });
            continue;
          }

          if (!validTypes.includes(type)) {
            failed.push({ type, id, error: 'Unknown update type' });
            continue;
          }

          updatesByType[type].push(update);
        }

        // Process lists
        if (updatesByType['list'].length > 0) {
          const items = updatesByType['list'];
          const ids = items.map(i => i.id);
          const xs = items.map(i => i.position_x);
          const ys = items.map(i => i.position_y);
          const widths = items.map(i => i.width ?? null);

          const result = await client.query(`
            UPDATE lists AS t
            SET
              position_x = u.position_x,
              position_y = u.position_y,
              width = COALESCE(u.width, t.width)
            FROM UNNEST($1::int[], $2::float[], $3::float[], $4::float[])
              AS u(id, position_x, position_y, width)
            WHERE t.id = u.id AND t.user_id = $5
            RETURNING t.*
          `, [ids, xs, ys, widths, req.user.id]);

          const updatedIds = new Set(result.rows.map(r => r.id));

          for (const item of items) {
            if (!updatedIds.has(item.id)) {
              failed.push({ type: 'list', id: item.id, error: 'List not found' });
            }
          }

          for (const row of result.rows) {
            if (row.is_public && row.share_token && broadcast?.listUpdate) {
              broadcast.listUpdate(row.share_token, 'POSITION_UPDATE', {
                id: row.id,
                position_x: row.position_x,
                position_y: row.position_y
              });
            }
            updated.push({ type: 'list', id: row.id, position_x: row.position_x, position_y: row.position_y, width: row.width });
          }
        }

        // Process notes
        if (updatesByType['note'].length > 0) {
          const items = updatesByType['note'];
          const ids = items.map(i => i.id);
          const xs = items.map(i => i.position_x);
          const ys = items.map(i => i.position_y);
          const widths = items.map(i => i.width ?? null);
          const heights = items.map(i => i.height ?? null);

          const result = await client.query(`
            UPDATE notes AS t
            SET
              position_x = u.position_x,
              position_y = u.position_y,
              width = COALESCE(u.width, t.width),
              height = COALESCE(u.height, t.height)
            FROM UNNEST($1::int[], $2::float[], $3::float[], $4::float[], $5::float[])
              AS u(id, position_x, position_y, width, height)
            WHERE t.id = u.id AND t.user_id = $6
            RETURNING t.*
          `, [ids, xs, ys, widths, heights, req.user.id]);

          const updatedIds = new Set(result.rows.map(r => r.id));

          for (const item of items) {
            if (!updatedIds.has(item.id)) {
              failed.push({ type: 'note', id: item.id, error: 'Note not found' });
            }
          }

          for (const row of result.rows) {
            updated.push({ type: 'note', id: row.id, position_x: row.position_x, position_y: row.position_y, width: row.width, height: row.height });
          }
        }

        // Process whiteboards
        if (updatesByType['whiteboard'].length > 0) {
          const items = updatesByType['whiteboard'];
          const ids = items.map(i => i.id);
          const xs = items.map(i => i.position_x);
          const ys = items.map(i => i.position_y);

          const result = await client.query(`
            UPDATE whiteboards AS t
            SET
              position_x = u.position_x,
              position_y = u.position_y
            FROM UNNEST($1::int[], $2::float[], $3::float[])
              AS u(id, position_x, position_y)
            WHERE t.id = u.id AND t.user_id = $4
            RETURNING t.*
          `, [ids, xs, ys, req.user.id]);

          const updatedIds = new Set(result.rows.map(r => r.id));

          for (const item of items) {
            if (!updatedIds.has(item.id)) {
              failed.push({ type: 'whiteboard', id: item.id, error: 'Whiteboard not found' });
            }
          }

          for (const row of result.rows) {
            if (row.is_public && row.share_token && broadcast?.whiteboardUpdate) {
              broadcast.whiteboardUpdate(row.share_token, 'POSITION_UPDATE', {
                id: row.id,
                position_x: row.position_x,
                position_y: row.position_y
              });
            }
            updated.push({ type: 'whiteboard', id: row.id, position_x: row.position_x, position_y: row.position_y });
          }
        }

        // Process wireframes
        if (updatesByType['wireframe'].length > 0) {
          const items = updatesByType['wireframe'];
          const ids = items.map(i => i.id);
          const xs = items.map(i => Math.round(i.position_x));
          const ys = items.map(i => Math.round(i.position_y));

          const result = await client.query(`
            UPDATE wireframes AS t
            SET
              position_x = u.position_x,
              position_y = u.position_y,
              updated_at = NOW()
            FROM UNNEST($1::int[], $2::float[], $3::float[])
              AS u(id, position_x, position_y)
            WHERE t.id = u.id AND t.user_id = $4
            RETURNING t.*
          `, [ids, xs, ys, req.user.id]);

          const updatedIds = new Set(result.rows.map(r => r.id));

          for (const item of items) {
            if (!updatedIds.has(item.id)) {
              failed.push({ type: 'wireframe', id: item.id, error: 'Wireframe not found' });
            }
          }

          for (const row of result.rows) {
            if (row.is_public && row.share_token && broadcast?.wireframeUpdate) {
              broadcast.wireframeUpdate(row.share_token, 'POSITION_UPDATE', {
                id: row.id,
                position_x: row.position_x,
                position_y: row.position_y
              });
            }
            if (broadcast?.userWireframeUpdate) {
              broadcast.userWireframeUpdate(req.user.id, 'POSITION_UPDATE', {
                id: row.id,
                position_x: row.position_x,
                position_y: row.position_y
              });
            }
            updated.push({ type: 'wireframe', id: row.id, position_x: row.position_x, position_y: row.position_y });
          }
        }

        // Process vaults
        if (updatesByType['vault'].length > 0) {
          const items = updatesByType['vault'];
          const ids = items.map(i => i.id);
          const xs = items.map(i => i.position_x);
          const ys = items.map(i => i.position_y);
          const widths = items.map(i => i.width ?? null);
          const heights = items.map(i => i.height ?? null);

          const result = await client.query(`
            UPDATE vaults AS t
            SET
              position_x = u.position_x,
              position_y = u.position_y,
              width = COALESCE(u.width, t.width),
              height = COALESCE(u.height, t.height),
              updated_at = CURRENT_TIMESTAMP
            FROM UNNEST($1::int[], $2::float[], $3::float[], $4::float[], $5::float[])
              AS u(id, position_x, position_y, width, height)
            WHERE t.id = u.id AND t.user_id = $6
            RETURNING t.*
          `, [ids, xs, ys, widths, heights, req.user.id]);

          const updatedIds = new Set(result.rows.map(r => r.id));

          for (const item of items) {
            if (!updatedIds.has(item.id)) {
              failed.push({ type: 'vault', id: item.id, error: 'Vault not found' });
            }
          }

          for (const row of result.rows) {
            updated.push({ type: 'vault', id: row.id, position_x: row.position_x, position_y: row.position_y, width: row.width, height: row.height });
          }
        }

      });

      return sendSuccess(res, { updated, failed });
    } catch (error) {
      console.error('Error updating canvas positions:', error);
      return sendError(res, 'Internal server error');
    }
  });

  return router;
};
