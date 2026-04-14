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

      // Group updates by type
      const updatesByType = {
        list: [],
        note: [],
        whiteboard: [],
        wireframe: [],
        vault: []
      };

      for (const update of updates) {
        const { type, id, position_x, position_y, width, height } = update || {};

        if (!type || id === undefined || id === null || typeof position_x !== 'number' || typeof position_y !== 'number') {
          failed.push({ type, id, error: 'Invalid update payload' });
          continue;
        }

        if (updatesByType[type]) {
          updatesByType[type].push(update);
        } else {
          failed.push({ type, id, error: 'Unknown update type' });
        }
      }

      await withDbClient(pool, async (client) => {
        // Process lists
        if (updatesByType.list.length > 0) {
          const ids = [];
          const xs = [];
          const ys = [];
          const widths = [];

          for (const u of updatesByType.list) {
            ids.push(u.id);
            xs.push(u.position_x);
            ys.push(u.position_y);
            widths.push(u.width ?? null);
          }

          const result = await client.query(`
            UPDATE lists AS l
            SET position_x = u.position_x,
                position_y = u.position_y,
                width = COALESCE(u.width, l.width)
            FROM (SELECT * FROM UNNEST($1::int[], $2::float[], $3::float[], $4::float[])) AS u(id, position_x, position_y, width)
            WHERE l.id = u.id AND l.user_id = $5
            RETURNING l.*
          `, [ids, xs, ys, widths, req.user.id]);

          const returnedIds = new Set();
          for (const row of result.rows) {
            returnedIds.add(row.id);

            if (row.is_public && row.share_token && broadcast?.listUpdate) {
              broadcast.listUpdate(row.share_token, 'POSITION_UPDATE', {
                id: row.id,
                position_x: row.position_x,
                position_y: row.position_y
              });
            }

            updated.push({ type: 'list', id: row.id, position_x: row.position_x, position_y: row.position_y, width: row.width });
          }

          for (const id of ids) {
            if (!returnedIds.has(id)) {
              failed.push({ type: 'list', id, error: 'List not found' });
            }
          }
        }

        // Process notes
        if (updatesByType.note.length > 0) {
          const ids = [];
          const xs = [];
          const ys = [];
          const widths = [];
          const heights = [];

          for (const u of updatesByType.note) {
            ids.push(u.id);
            xs.push(u.position_x);
            ys.push(u.position_y);
            widths.push(u.width ?? null);
            heights.push(u.height ?? null);
          }

          const result = await client.query(`
            UPDATE notes AS n
            SET position_x = u.position_x,
                position_y = u.position_y,
                width = COALESCE(u.width, n.width),
                height = COALESCE(u.height, n.height)
            FROM (SELECT * FROM UNNEST($1::int[], $2::float[], $3::float[], $4::float[], $5::float[])) AS u(id, position_x, position_y, width, height)
            WHERE n.id = u.id AND n.user_id = $6
            RETURNING n.*
          `, [ids, xs, ys, widths, heights, req.user.id]);

          const returnedIds = new Set();
          for (const row of result.rows) {
            returnedIds.add(row.id);
            updated.push({ type: 'note', id: row.id, position_x: row.position_x, position_y: row.position_y, width: row.width, height: row.height });
          }

          for (const id of ids) {
            if (!returnedIds.has(id)) {
              failed.push({ type: 'note', id, error: 'Note not found' });
            }
          }
        }

        // Process whiteboards
        if (updatesByType.whiteboard.length > 0) {
          const ids = [];
          const xs = [];
          const ys = [];

          for (const u of updatesByType.whiteboard) {
            ids.push(u.id);
            xs.push(u.position_x);
            ys.push(u.position_y);
          }

          const result = await client.query(`
            UPDATE whiteboards AS w
            SET position_x = u.position_x,
                position_y = u.position_y
            FROM (SELECT * FROM UNNEST($1::int[], $2::float[], $3::float[])) AS u(id, position_x, position_y)
            WHERE w.id = u.id AND w.user_id = $4
            RETURNING w.*
          `, [ids, xs, ys, req.user.id]);

          const returnedIds = new Set();
          for (const row of result.rows) {
            returnedIds.add(row.id);

            if (row.is_public && row.share_token && broadcast?.whiteboardUpdate) {
              broadcast.whiteboardUpdate(row.share_token, 'POSITION_UPDATE', {
                id: row.id,
                position_x: row.position_x,
                position_y: row.position_y
              });
            }

            updated.push({ type: 'whiteboard', id: row.id, position_x: row.position_x, position_y: row.position_y });
          }

          for (const id of ids) {
            if (!returnedIds.has(id)) {
              failed.push({ type: 'whiteboard', id, error: 'Whiteboard not found' });
            }
          }
        }

        // Process wireframes
        if (updatesByType.wireframe.length > 0) {
          const ids = [];
          const xs = [];
          const ys = [];

          for (const u of updatesByType.wireframe) {
            ids.push(u.id);
            xs.push(Math.round(u.position_x));
            ys.push(Math.round(u.position_y));
          }

          const result = await client.query(`
            UPDATE wireframes AS w
            SET position_x = u.position_x,
                position_y = u.position_y,
                updated_at = NOW()
            FROM (SELECT * FROM UNNEST($1::int[], $2::float[], $3::float[])) AS u(id, position_x, position_y)
            WHERE w.id = u.id AND w.user_id = $4
            RETURNING w.*
          `, [ids, xs, ys, req.user.id]);

          const returnedIds = new Set();
          for (const row of result.rows) {
            returnedIds.add(row.id);

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

          for (const id of ids) {
            if (!returnedIds.has(id)) {
              failed.push({ type: 'wireframe', id, error: 'Wireframe not found' });
            }
          }
        }

        // Process vaults
        if (updatesByType.vault.length > 0) {
          const ids = [];
          const xs = [];
          const ys = [];
          const widths = [];
          const heights = [];

          for (const u of updatesByType.vault) {
            ids.push(u.id);
            xs.push(u.position_x);
            ys.push(u.position_y);
            widths.push(u.width ?? null);
            heights.push(u.height ?? null);
          }

          const result = await client.query(`
            UPDATE vaults AS v
            SET position_x = u.position_x,
                position_y = u.position_y,
                width = COALESCE(u.width, v.width),
                height = COALESCE(u.height, v.height),
                updated_at = CURRENT_TIMESTAMP
            FROM (SELECT * FROM UNNEST($1::int[], $2::float[], $3::float[], $4::float[], $5::float[])) AS u(id, position_x, position_y, width, height)
            WHERE v.id = u.id AND v.user_id = $6
            RETURNING v.*
          `, [ids, xs, ys, widths, heights, req.user.id]);

          const returnedIds = new Set();
          for (const row of result.rows) {
            returnedIds.add(row.id);
            updated.push({ type: 'vault', id: row.id, position_x: row.position_x, position_y: row.position_y, width: row.width, height: row.height });
          }

          for (const id of ids) {
            if (!returnedIds.has(id)) {
              failed.push({ type: 'vault', id, error: 'Vault not found' });
            }
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
