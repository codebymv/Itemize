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

      await withDbClient(pool, async (client) => {
        const updatesByType = {
          list: [],
          note: [],
          whiteboard: [],
          wireframe: [],
          vault: []
        };

        for (const update of updates) {
          const { type, id, position_x, position_y } = update || {};

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

        if (updatesByType.list.length > 0) {
          const u_ids = [];
          const u_pos_xs = [];
          const u_pos_ys = [];
          const u_widths = [];

          for (const update of updatesByType.list) {
            u_ids.push(update.id);
            u_pos_xs.push(update.position_x);
            u_pos_ys.push(update.position_y);
            u_widths.push(update.width ?? null);
          }

          const result = await client.query(`
            UPDATE lists AS l
            SET
              position_x = u.position_x,
              position_y = u.position_y,
              width = COALESCE(u.width, l.width)
            FROM (
              SELECT * FROM UNNEST(
                $1::int[], $2::numeric[], $3::numeric[], $4::numeric[]
              ) AS t(id, position_x, position_y, width)
            ) AS u
            WHERE l.id = u.id AND l.user_id = $5
            RETURNING l.*
          `, [u_ids, u_pos_xs, u_pos_ys, u_widths, req.user.id]);

          const foundIds = new Set(result.rows.map(r => r.id));

          for (const update of updatesByType.list) {
            if (!foundIds.has(update.id)) {
              failed.push({ type: 'list', id: update.id, error: 'List not found' });
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

        if (updatesByType.note.length > 0) {
          const u_ids = [];
          const u_pos_xs = [];
          const u_pos_ys = [];
          const u_widths = [];
          const u_heights = [];

          for (const update of updatesByType.note) {
            u_ids.push(update.id);
            u_pos_xs.push(update.position_x);
            u_pos_ys.push(update.position_y);
            u_widths.push(update.width ?? null);
            u_heights.push(update.height ?? null);
          }

          const result = await client.query(`
            UPDATE notes AS n
            SET
              position_x = u.position_x,
              position_y = u.position_y,
              width = COALESCE(u.width, n.width),
              height = COALESCE(u.height, n.height)
            FROM (
              SELECT * FROM UNNEST(
                $1::int[], $2::numeric[], $3::numeric[], $4::numeric[], $5::numeric[]
              ) AS t(id, position_x, position_y, width, height)
            ) AS u
            WHERE n.id = u.id AND n.user_id = $6
            RETURNING n.*
          `, [u_ids, u_pos_xs, u_pos_ys, u_widths, u_heights, req.user.id]);

          const foundIds = new Set(result.rows.map(r => r.id));

          for (const update of updatesByType.note) {
            if (!foundIds.has(update.id)) {
              failed.push({ type: 'note', id: update.id, error: 'Note not found' });
            }
          }

          for (const row of result.rows) {
            updated.push({ type: 'note', id: row.id, position_x: row.position_x, position_y: row.position_y, width: row.width, height: row.height });
          }
        }

        if (updatesByType.whiteboard.length > 0) {
          const u_ids = [];
          const u_pos_xs = [];
          const u_pos_ys = [];

          for (const update of updatesByType.whiteboard) {
            u_ids.push(update.id);
            u_pos_xs.push(update.position_x);
            u_pos_ys.push(update.position_y);
          }

          const result = await client.query(`
            UPDATE whiteboards AS w
            SET
              position_x = u.position_x,
              position_y = u.position_y
            FROM (
              SELECT * FROM UNNEST(
                $1::int[], $2::numeric[], $3::numeric[]
              ) AS t(id, position_x, position_y)
            ) AS u
            WHERE w.id = u.id AND w.user_id = $4
            RETURNING w.*
          `, [u_ids, u_pos_xs, u_pos_ys, req.user.id]);

          const foundIds = new Set(result.rows.map(r => r.id));

          for (const update of updatesByType.whiteboard) {
            if (!foundIds.has(update.id)) {
              failed.push({ type: 'whiteboard', id: update.id, error: 'Whiteboard not found' });
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

        if (updatesByType.wireframe.length > 0) {
          const u_ids = [];
          const u_pos_xs = [];
          const u_pos_ys = [];

          for (const update of updatesByType.wireframe) {
            u_ids.push(update.id);
            u_pos_xs.push(Math.round(update.position_x));
            u_pos_ys.push(Math.round(update.position_y));
          }

          const result = await client.query(`
            UPDATE wireframes AS w
            SET
              position_x = u.position_x,
              position_y = u.position_y,
              updated_at = NOW()
            FROM (
              SELECT * FROM UNNEST(
                $1::int[], $2::numeric[], $3::numeric[]
              ) AS t(id, position_x, position_y)
            ) AS u
            WHERE w.id = u.id AND w.user_id = $4
            RETURNING w.*
          `, [u_ids, u_pos_xs, u_pos_ys, req.user.id]);

          const foundIds = new Set(result.rows.map(r => r.id));

          for (const update of updatesByType.wireframe) {
            if (!foundIds.has(update.id)) {
              failed.push({ type: 'wireframe', id: update.id, error: 'Wireframe not found' });
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

        if (updatesByType.vault.length > 0) {
          const u_ids = [];
          const u_pos_xs = [];
          const u_pos_ys = [];
          const u_widths = [];
          const u_heights = [];

          for (const update of updatesByType.vault) {
            u_ids.push(update.id);
            u_pos_xs.push(update.position_x);
            u_pos_ys.push(update.position_y);
            u_widths.push(update.width ?? null);
            u_heights.push(update.height ?? null);
          }

          const result = await client.query(`
            UPDATE vaults AS v
            SET
              position_x = u.position_x,
              position_y = u.position_y,
              width = COALESCE(u.width, v.width),
              height = COALESCE(u.height, v.height),
              updated_at = CURRENT_TIMESTAMP
            FROM (
              SELECT * FROM UNNEST(
                $1::int[], $2::numeric[], $3::numeric[], $4::numeric[], $5::numeric[]
              ) AS t(id, position_x, position_y, width, height)
            ) AS u
            WHERE v.id = u.id AND v.user_id = $6
            RETURNING v.*
          `, [u_ids, u_pos_xs, u_pos_ys, u_widths, u_heights, req.user.id]);

          const foundIds = new Set(result.rows.map(r => r.id));

          for (const update of updatesByType.vault) {
            if (!foundIds.has(update.id)) {
              failed.push({ type: 'vault', id: update.id, error: 'Vault not found' });
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
