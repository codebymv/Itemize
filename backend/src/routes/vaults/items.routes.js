const express = require('express');
const { encrypt, decrypt } = require('../../utils/encryption');
const { logger } = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../../utils/response');
const { vaultItemColumns } = require('./columns');

module.exports = (pool, authenticateJWT) => {
    const router = express.Router();

    // Reorder vault items (MUST come before :itemId routes to avoid matching 'reorder' as an itemId)
    router.put('/vaults/:vaultId/items/reorder', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;
            const { item_ids } = req.body; // Array of item IDs in new order

            if (!Array.isArray(item_ids)) {
                return sendBadRequest(res, 'item_ids array is required');
            }

            const result = await withDbClient(pool, async (client) => {
                const vaultCheck = await client.query(
                    'SELECT id FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }

                for (let i = 0; i < item_ids.length; i++) {
                    await client.query(
                        'UPDATE vault_items SET order_index = $1 WHERE id = $2 AND vault_id = $3',
                        [i, item_ids[i], vaultId]
                    );
                }

                await client.query(
                    'UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [vaultId]
                );

                return { status: 'ok' };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Vault');
            }

            sendSuccess(res, { message: 'Items reordered successfully' });
        } catch (error) {
            logger.error('Error reordering vault items:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    // Add item to vault
    router.post('/vaults/:vaultId/items', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;
            const { item_type, label, value } = req.body;

            if (!item_type || !['key_value', 'secure_note'].includes(item_type)) {
                return sendBadRequest(res, 'item_type must be "key_value" or "secure_note"');
            }

            if (!label || label.trim() === '') {
                return sendBadRequest(res, 'label is required');
            }

            if (value === undefined || value === null) {
                return sendBadRequest(res, 'value is required');
            }

            const result = await withDbClient(pool, async (client) => {
                const vaultCheck = await client.query(
                    'SELECT id FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const orderResult = await client.query(
                    'SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM vault_items WHERE vault_id = $1',
                    [vaultId]
                );
                const nextOrder = orderResult.rows[0].next_order;

                const { encrypted, iv } = encrypt(value);

                const insertResult = await client.query(
                    `INSERT INTO vault_items (vault_id, item_type, label, encrypted_value, iv, order_index)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${vaultItemColumns()}`,
                    [vaultId, item_type, label.trim(), encrypted, iv, nextOrder]
                );

                await client.query(
                    'UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [vaultId]
                );

                return { status: 'ok', item: insertResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Vault');
            }

            sendCreated(res, {
                id: result.item.id,
                vault_id: result.item.vault_id,
                item_type: result.item.item_type,
                label: result.item.label,
                value: value,
                order_index: result.item.order_index,
                created_at: result.item.created_at,
                updated_at: result.item.updated_at
            });
        } catch (error) {
            logger.error('Error adding vault item:', { error: error.message });
            return sendError(res, 'Internal server error while adding vault item');
        }
    }));

    // Bulk add items to vault (for .env import)
    router.post('/vaults/:vaultId/items/bulk', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;
            const { items } = req.body; // Array of { item_type, label, value }

            if (!Array.isArray(items) || items.length === 0) {
                return sendBadRequest(res, 'items array is required and must not be empty');
            }

            const result = await withDbClient(pool, async (client) => {
                const vaultCheck = await client.query(
                    'SELECT id FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const orderResult = await client.query(
                    'SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM vault_items WHERE vault_id = $1',
                    [vaultId]
                );
                let nextOrder = orderResult.rows[0].next_order;

                const createdItems = [];
                const itemTypes = [];
                const labels = [];
                const encrypteds = [];
                const ivs = [];
                const orderIndices = [];
                const plainValues = [];

                for (const item of items) {
                    const { item_type = 'key_value', label, value } = item;

                    if (!label || !value) {
                        continue;
                    }

                    const { encrypted, iv } = encrypt(value);

                    itemTypes.push(item_type);
                    labels.push(label.trim());
                    encrypteds.push(encrypted);
                    ivs.push(iv);
                    orderIndices.push(nextOrder++);
                    plainValues.push(value);
                }

                if (itemTypes.length > 0) {
                    const insertResult = await client.query(
                        `INSERT INTO vault_items (vault_id, item_type, label, encrypted_value, iv, order_index)
                         SELECT $1, u.item_type, u.label, u.encrypted, u.iv, u.order_index
                         FROM UNNEST ($2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
                         AS u(item_type, label, encrypted, iv, order_index) RETURNING ${vaultItemColumns()}`,
                        [vaultId, itemTypes, labels, encrypteds, ivs, orderIndices]
                    );

                    for (let i = 0; i < insertResult.rows.length; i++) {
                        const createdItem = insertResult.rows[i];
                        createdItems.push({
                            id: createdItem.id,
                            vault_id: createdItem.vault_id,
                            item_type: createdItem.item_type,
                            label: createdItem.label,
                            value: plainValues[i],
                            order_index: createdItem.order_index,
                            created_at: createdItem.created_at,
                            updated_at: createdItem.updated_at
                        });
                    }
                }

                await client.query(
                    'UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [vaultId]
                );

                return { status: 'ok', items: createdItems };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Vault');
            }

            sendCreated(res, {
                items: result.items,
                count: result.items.length
            });
        } catch (error) {
            logger.error('Error bulk adding vault items:', { error: error.message });
            return sendError(res, 'Internal server error while adding vault items');
        }
    }));

    // Update a vault item
    router.put('/vaults/:vaultId/items/:itemId', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId, itemId } = req.params;
            const { label, value } = req.body;

            const result = await withDbClient(pool, async (client) => {
                const vaultCheck = await client.query(
                    'SELECT id FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultCheck.rows.length === 0) {
                    return { status: 'vault_not_found' };
                }

                const currentItemResult = await client.query(
                    `SELECT ${vaultItemColumns()} FROM vault_items WHERE id = $1 AND vault_id = $2`,
                    [itemId, vaultId]
                );

                if (currentItemResult.rows.length === 0) {
                    return { status: 'item_not_found' };
                }

                const currentItem = currentItemResult.rows[0];
                const newLabel = label !== undefined ? label.trim() : currentItem.label;

                let newEncryptedValue = currentItem.encrypted_value;
                let newIv = currentItem.iv;
                let returnValue;

                if (value !== undefined) {
                    const encrypted = encrypt(value);
                    newEncryptedValue = encrypted.encrypted;
                    newIv = encrypted.iv;
                    returnValue = value;
                } else {
                    returnValue = decrypt(currentItem.encrypted_value, currentItem.iv);
                }

                const updateResult = await client.query(
                    `UPDATE vault_items SET label = $1, encrypted_value = $2, iv = $3, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $4 AND vault_id = $5 RETURNING ${vaultItemColumns()}`,
                    [newLabel, newEncryptedValue, newIv, itemId, vaultId]
                );

                await client.query(
                    'UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [vaultId]
                );

                return { status: 'ok', item: updateResult.rows[0], value: returnValue };
            });

            if (result.status === 'vault_not_found') {
                return sendNotFound(res, 'Vault');
            }
            if (result.status === 'item_not_found') {
                return sendNotFound(res, 'Item');
            }

            sendSuccess(res, {
                id: result.item.id,
                vault_id: result.item.vault_id,
                item_type: result.item.item_type,
                label: result.item.label,
                value: result.value,
                order_index: result.item.order_index,
                created_at: result.item.created_at,
                updated_at: result.item.updated_at
            });
        } catch (error) {
            logger.error('Error updating vault item:', { error: error.message });
            return sendError(res, 'Internal server error while updating vault item');
        }
    }));

    // Delete a vault item
    router.delete('/vaults/:vaultId/items/:itemId', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId, itemId } = req.params;

            const result = await withDbClient(pool, async (client) => {
                const vaultCheck = await client.query(
                    'SELECT id FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultCheck.rows.length === 0) {
                    return { status: 'vault_not_found' };
                }

                const deleteResult = await client.query(
                    'DELETE FROM vault_items WHERE id = $1 AND vault_id = $2 RETURNING id',
                    [itemId, vaultId]
                );

                if (deleteResult.rows.length === 0) {
                    return { status: 'item_not_found' };
                }

                await client.query(
                    'UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [vaultId]
                );

                return { status: 'ok' };
            });

            if (result.status === 'vault_not_found') {
                return sendNotFound(res, 'Vault');
            }
            if (result.status === 'item_not_found') {
                return sendNotFound(res, 'Item');
            }

            sendSuccess(res, { message: 'Item deleted successfully' });
        } catch (error) {
            logger.error('Error deleting vault item:', { error: error.message });
            return sendError(res, 'Internal server error while deleting vault item');
        }
    }));

    // =====================
    // VAULT SHARING

    return router;
};
