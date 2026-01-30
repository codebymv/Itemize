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
        for (const update of updates) {
          const { type, id, position_x, position_y, width, height } = update || {};

          if (!type || id === undefined || id === null || typeof position_x !== 'number' || typeof position_y !== 'number') {
            failed.push({ type, id, error: 'Invalid update payload' });
            continue;
          }

          if (type === 'list') {
            const result = await client.query(
              'UPDATE lists SET position_x = $1, position_y = $2, width = COALESCE($3, width) WHERE id = $4 AND user_id = $5 RETURNING *',
              [position_x, position_y, width ?? null, id, req.user.id]
            );

            if (result.rows.length === 0) {
              failed.push({ type, id, error: 'List not found' });
              continue;
            }

            const row = result.rows[0];
            if (row.is_public && row.share_token && broadcast?.listUpdate) {
              broadcast.listUpdate(row.share_token, 'POSITION_UPDATE', {
                id: row.id,
                position_x: row.position_x,
                position_y: row.position_y
              });
            }

            updated.push({ type, id: row.id, position_x: row.position_x, position_y: row.position_y, width: row.width });
            continue;
          }

          if (type === 'note') {
            const result = await client.query(
              'UPDATE notes SET position_x = $1, position_y = $2, width = COALESCE($3, width), height = COALESCE($4, height) WHERE id = $5 AND user_id = $6 RETURNING *',
              [position_x, position_y, width ?? null, height ?? null, id, req.user.id]
            );

            if (result.rows.length === 0) {
              failed.push({ type, id, error: 'Note not found' });
              continue;
            }

            const row = result.rows[0];
            updated.push({ type, id: row.id, position_x: row.position_x, position_y: row.position_y, width: row.width, height: row.height });
            continue;
          }

          if (type === 'whiteboard') {
            const result = await client.query(
              'UPDATE whiteboards SET position_x = $1, position_y = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
              [position_x, position_y, id, req.user.id]
            );

            if (result.rows.length === 0) {
              failed.push({ type, id, error: 'Whiteboard not found' });
              continue;
            }

            const row = result.rows[0];
            if (row.is_public && row.share_token && broadcast?.whiteboardUpdate) {
              broadcast.whiteboardUpdate(row.share_token, 'POSITION_UPDATE', {
                id: row.id,
                position_x: row.position_x,
                position_y: row.position_y
              });
            }

            updated.push({ type, id: row.id, position_x: row.position_x, position_y: row.position_y });
            continue;
          }

          if (type === 'wireframe') {
            const result = await client.query(
              'UPDATE wireframes SET position_x = $1, position_y = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *',
              [Math.round(position_x), Math.round(position_y), id, req.user.id]
            );

            if (result.rows.length === 0) {
              failed.push({ type, id, error: 'Wireframe not found' });
              continue;
            }

            const row = result.rows[0];
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

            updated.push({ type, id: row.id, position_x: row.position_x, position_y: row.position_y });
            continue;
          }

          if (type === 'vault') {
            const result = await client.query(
              'UPDATE vaults SET position_x = $1, position_y = $2, width = COALESCE($3, width), height = COALESCE($4, height), updated_at = CURRENT_TIMESTAMP WHERE id = $5 AND user_id = $6 RETURNING *',
              [position_x, position_y, width ?? null, height ?? null, id, req.user.id]
            );

            if (result.rows.length === 0) {
              failed.push({ type, id, error: 'Vault not found' });
              continue;
            }

            const row = result.rows[0];
            updated.push({ type, id: row.id, position_x: row.position_x, position_y: row.position_y, width: row.width, height: row.height });
            continue;
          }

          failed.push({ type, id, error: 'Unknown update type' });
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
