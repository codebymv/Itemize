/**
 * Vaults Routes
 * Handles encrypted vault CRUD operations and sharing
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { encrypt, decrypt, hashMasterPassword, verifyMasterPassword, generateSalt } = require('../utils/encryption');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient } = require('../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError, sendPaginated, getPaginationParams, buildPagination } = require('../utils/response');

/**
 * Create vaults routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware  
 * @param {Object} broadcast - Broadcast functions for WebSocket updates
 */
module.exports = (pool, authenticateJWT, broadcast) => {

    // =====================
    // VAULT CRUD OPERATIONS
    // =====================

    // Get all vaults for the current user with pagination
    router.get('/vaults', authenticateJWT, asyncHandler(async (req, res) => {
        const { page, limit, offset } = getPaginationParams(req.query, { page: 1, limit: 50, maxLimit: 100 });
        const { category, search } = req.query;

        const result = await withDbClient(pool, async (client) => {
            let whereClause = 'WHERE v.user_id = $1';
            const params = [req.user.id];
            let paramIndex = 2;

            if (category) {
                whereClause += ` AND category = $${paramIndex}`;
                params.push(category);
                paramIndex++;
            }

            if (search) {
                whereClause += ` AND title ILIKE $${paramIndex}`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            const countResult = await client.query(
                `SELECT COUNT(*) FROM vaults v ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].count);

            const vaultsResult = await client.query(
                `SELECT v.id, v.user_id, v.title, v.category, v.color_value, v.position_x, v.position_y, v.width, v.height, v.z_index, 
                        v.is_locked, v.created_at, v.updated_at, v.share_token, v.is_public, v.shared_at,
                        COUNT(vi.id)::int as item_count
                 FROM vaults v
                 LEFT JOIN vault_items vi ON vi.vault_id = v.id
                 ${whereClause}
                 GROUP BY v.id, v.user_id, v.title, v.category, v.color_value, v.position_x, v.position_y, v.width, v.height, v.z_index,
                          v.is_locked, v.created_at, v.updated_at, v.share_token, v.is_public, v.shared_at
                 ORDER BY v.updated_at DESC 
                 LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                [...params, limit, offset]
            );

            return {
                vaults: vaultsResult.rows,
                total
            };
        });

        const pagination = buildPagination(page, limit, result.total);
        return sendPaginated(res, result.vaults, pagination);
    }));

    // Get a single vault with its items (decrypted)
    router.get('/vaults/:vaultId', authenticateJWT, asyncHandler(async (req, res) => {
            const { vaultId } = req.params;
            const { master_password } = req.query; // Optional for locked vaults
            const result = await withDbClient(pool, async (client) => {
                const vaultResult = await client.query(
                    `SELECT id, user_id, title, category, color_value, position_x, position_y, width, height, z_index, 
                            is_locked, encryption_salt, master_password_hash, created_at, updated_at, share_token, is_public, shared_at 
                     FROM vaults WHERE id = $1 AND user_id = $2`,
                    [vaultId, req.user.id]
                );

                if (vaultResult.rows.length === 0) {
                    return { notFound: true };
                }

                const vault = vaultResult.rows[0];

                // If vault is locked and no master password provided, return vault without items
                if (vault.is_locked && vault.master_password_hash) {
                    if (!master_password) {
                        return {
                            vault: {
                                ...vault,
                                master_password_hash: undefined,
                                encryption_salt: undefined,
                                items: [],
                                requires_unlock: true
                            }
                        };
                    }

                    // Verify master password
                    const isValid = await verifyMasterPassword(master_password, vault.master_password_hash);
                    if (!isValid) {
                        return { unauthorized: true };
                    }
                }

                // Get items
                const itemsResult = await client.query(
                    `SELECT id, vault_id, item_type, label, encrypted_value, iv, order_index, created_at, updated_at 
                     FROM vault_items WHERE vault_id = $1 ORDER BY order_index ASC`,
                    [vaultId]
                );

                // Decrypt items
                const decryptedItems = itemsResult.rows.map(item => {
                    try {
                        const decryptedValue = decrypt(item.encrypted_value, item.iv);
                        return {
                            id: item.id,
                            vault_id: item.vault_id,
                            item_type: item.item_type,
                            label: item.label,
                            value: decryptedValue,
                            order_index: item.order_index,
                            created_at: item.created_at,
                            updated_at: item.updated_at
                        };
                    } catch (decryptError) {
                        logger.error('Error decrypting vault item', { itemId: item.id, error: decryptError.message });
                        return {
                            ...item,
                            value: '[DECRYPTION_ERROR]',
                            encrypted_value: undefined,
                            iv: undefined
                        };
                    }
                });

                return {
                    vault: {
                        ...vault,
                        master_password_hash: undefined,
                        encryption_salt: vault.is_locked ? vault.encryption_salt : undefined,
                        items: decryptedItems,
                        requires_unlock: false
                    }
                };
            });

            if (result.notFound) {
                return sendNotFound(res, 'Vault');
            }
            if (result.unauthorized) {
                return sendError(res, 'Invalid master password', 401);
            }

            return sendSuccess(res, result.vault);
    }));

    // Create a new vault
    router.post('/vaults', authenticateJWT, asyncHandler(async (req, res) => {
            const {
                title = 'Untitled Vault',
                category = 'General',
                position_x,
                position_y,
                width = 400,
                height = 300,
                z_index = 0,
                color_value = '#3B82F6',
                master_password // Optional - if provided, vault will be locked
            } = req.body;

            if (typeof position_x !== 'number' || typeof position_y !== 'number') {
                return sendBadRequest(res, 'position_x and position_y are required and must be numbers.');
            }

            const vault = await withDbClient(pool, async (client) => {
                let is_locked = false;
                let encryption_salt = null;
                let master_password_hash = null;

                if (master_password && master_password.length >= 8) {
                    is_locked = true;
                    encryption_salt = generateSalt();
                    master_password_hash = await hashMasterPassword(master_password);
                }

                const result = await client.query(
                    `INSERT INTO vaults (user_id, title, category, color_value, position_x, position_y, width, height, z_index, is_locked, encryption_salt, master_password_hash) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
                    [
                        req.user.id,
                        title,
                        category,
                        color_value,
                        position_x,
                        position_y,
                        width,
                        height,
                        z_index,
                        is_locked,
                        encryption_salt,
                        master_password_hash
                    ]
                );

                return result.rows[0];
            });

            return sendCreated(res, {
                ...vault,
                master_password_hash: undefined,
                item_count: 0,
                items: []
            });
    }));

    // Update a vault
    router.put('/vaults/:vaultId', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;
            const { title, category, color_value, position_x, position_y, width, height, z_index } = req.body;

            const result = await withDbClient(pool, async (client) => {
                const currentVaultResult = await client.query(
                    'SELECT * FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (currentVaultResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const currentVault = currentVaultResult.rows[0];

                const newTitle = title !== undefined ? title : currentVault.title;
                const newCategory = category !== undefined ? category : currentVault.category;
                const newColorValue = color_value !== undefined ? color_value : currentVault.color_value;
                const newPositionX = position_x !== undefined ? position_x : currentVault.position_x;
                const newPositionY = position_y !== undefined ? position_y : currentVault.position_y;
                const newWidth = width !== undefined ? width : currentVault.width;
                const newHeight = height !== undefined ? height : currentVault.height;
                const newZIndex = z_index !== undefined ? z_index : currentVault.z_index;

                const updateResult = await client.query(
                    `UPDATE vaults
                     SET title = $1, category = $2, color_value = $3, position_x = $4, position_y = $5, width = $6, height = $7, z_index = $8
                     WHERE id = $9 AND user_id = $10 RETURNING *`,
                    [newTitle, newCategory, newColorValue, newPositionX, newPositionY, newWidth, newHeight, newZIndex, vaultId, req.user.id]
                );

                return { status: 'ok', vault: updateResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Vault');
            }

            sendSuccess(res, {
                ...result.vault,
                master_password_hash: undefined
            });
        } catch (error) {
            logger.error('Error updating vault:', { error: error.message });
            return sendError(res, 'Internal server error while updating vault');
        }
    }));

    // Update vault position only
    router.put('/vaults/:vaultId/position', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;
            const { position_x, position_y } = req.body;

            if (typeof position_x !== 'number' || typeof position_y !== 'number') {
                return sendBadRequest(res, 'position_x and position_y are required and must be numbers.');
            }

            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    `UPDATE vaults SET position_x = $1, position_y = $2, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $3 AND user_id = $4 RETURNING *`,
                    [position_x, position_y, vaultId, req.user.id]
                );
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Vault');
            }

            sendSuccess(res, {
                ...result.rows[0],
                master_password_hash: undefined
            });
        } catch (error) {
            logger.error('Error updating vault position:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    // Delete a vault
    router.delete('/vaults/:vaultId', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const checkResult = await client.query(
                    'SELECT id, title, share_token, is_public FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (checkResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const vaultInfo = checkResult.rows[0];

                const deleteResult = await client.query(
                    'DELETE FROM vaults WHERE id = $1 AND user_id = $2 RETURNING id',
                    [vaultId, req.user.id]
                );

                return { status: 'ok', info: vaultInfo, result: deleteResult };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Vault');
            }
            if (result.result.rows.length === 0) {
                return sendNotFound(res, 'Vault');
            }

            logger.info(`Vault ${vaultId} deleted`, { title: result.info.title, userId: req.user.id });
            sendSuccess(res, { message: 'Vault deleted successfully' });
        } catch (error) {
            logger.error('Error deleting vault:', { error: error.message });
            return sendError(res, 'Internal server error while deleting vault');
        }
    }));

    // =====================
    // VAULT ITEMS OPERATIONS
    // =====================

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
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
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

                for (const item of items) {
                    const { item_type = 'key_value', label, value } = item;

                    if (!label || !value) {
                        continue;
                    }

                    const { encrypted, iv } = encrypt(value);

                    const insertResult = await client.query(
                        `INSERT INTO vault_items (vault_id, item_type, label, encrypted_value, iv, order_index) 
                         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                        [vaultId, item_type, label.trim(), encrypted, iv, nextOrder++]
                    );

                    const createdItem = insertResult.rows[0];
                    createdItems.push({
                        id: createdItem.id,
                        vault_id: createdItem.vault_id,
                        item_type: createdItem.item_type,
                        label: createdItem.label,
                        value: value,
                        order_index: createdItem.order_index,
                        created_at: createdItem.created_at,
                        updated_at: createdItem.updated_at
                    });
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
                    'SELECT * FROM vault_items WHERE id = $1 AND vault_id = $2',
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
                     WHERE id = $4 AND vault_id = $5 RETURNING *`,
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
    // =====================

    // Enable sharing for a vault
    router.post('/vaults/:vaultId/share', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;

            const result = await withDbClient(pool, async (client) => {
                const vaultResult = await client.query(
                    'SELECT * FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const vault = vaultResult.rows[0];

                let shareToken = vault.share_token;
                if (!shareToken) {
                    shareToken = crypto.randomUUID();
                }

                await client.query(
                    `UPDATE vaults SET share_token = $1, is_public = TRUE, shared_at = CURRENT_TIMESTAMP 
                     WHERE id = $2 AND user_id = $3`,
                    [shareToken, vaultId, req.user.id]
                );

                return { status: 'ok', shareToken };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Vault');
            }

            const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/shared/vault/${result.shareToken}`;

            sendSuccess(res, {
                shareToken: result.shareToken,
                shareUrl,
                message: 'Vault sharing enabled'
            });
        } catch (error) {
            logger.error('Error enabling vault sharing:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    // Disable sharing for a vault
    router.delete('/vaults/:vaultId/share', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;

            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    `UPDATE vaults SET is_public = FALSE WHERE id = $1 AND user_id = $2 RETURNING id`,
                    [vaultId, req.user.id]
                );
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Vault');
            }

            sendSuccess(res, { message: 'Vault sharing disabled' });
        } catch (error) {
            logger.error('Error disabling vault sharing:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    // Get shared vault (public endpoint)
    router.get('/shared/vault/:token', asyncHandler(async (req, res) => {
        try {
            const { token } = req.params;

            const result = await withDbClient(pool, async (client) => {
                const vaultResult = await client.query(
                    `SELECT id, title, category, color_value, is_locked, created_at, updated_at 
                     FROM vaults WHERE share_token = $1 AND is_public = TRUE`,
                    [token]
                );

                if (vaultResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const vault = vaultResult.rows[0];

                if (vault.is_locked) {
                    return { status: 'locked' };
                }

                const itemsResult = await client.query(
                    `SELECT id, item_type, label, encrypted_value, iv, order_index, created_at, updated_at 
                     FROM vault_items WHERE vault_id = $1 ORDER BY order_index ASC`,
                    [vault.id]
                );

                const decryptedItems = itemsResult.rows.map(item => {
                    try {
                        const decryptedValue = decrypt(item.encrypted_value, item.iv);
                        return {
                            id: item.id,
                            item_type: item.item_type,
                            label: item.label,
                            value: decryptedValue,
                            order_index: item.order_index
                        };
                    } catch (decryptError) {
                        logger.error('Error decrypting shared vault item', { itemId: item.id });
                        return {
                            id: item.id,
                            item_type: item.item_type,
                            label: item.label,
                            value: '[DECRYPTION_ERROR]',
                            order_index: item.order_index
                        };
                    }
                });

                return { status: 'ok', vault, items: decryptedItems };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Shared vault');
            }
            if (result.status === 'locked') {
                return sendError(res, 'This vault is locked and cannot be viewed publicly', 403, 'FORBIDDEN');
            }

            sendSuccess(res, {
                id: result.vault.id,
                title: result.vault.title,
                category: result.vault.category,
                color_value: result.vault.color_value,
                created_at: result.vault.created_at,
                updated_at: result.vault.updated_at,
                items: result.items,
                is_shared: true
            });
        } catch (error) {
            logger.error('Error fetching shared vault:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    // =====================
    // MASTER PASSWORD MANAGEMENT
    // =====================

    // Set or change master password
    router.post('/vaults/:vaultId/lock', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;
            const { master_password, current_password } = req.body;

            if (!master_password || master_password.length < 8) {
                return sendBadRequest(res, 'Master password must be at least 8 characters');
            }

            const result = await withDbClient(pool, async (client) => {
                const vaultResult = await client.query(
                    'SELECT * FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const vault = vaultResult.rows[0];

                if (vault.is_locked && vault.master_password_hash) {
                    if (!current_password) {
                        return { status: 'missing_current' };
                    }
                    const isValid = await verifyMasterPassword(current_password, vault.master_password_hash);
                    if (!isValid) {
                        return { status: 'invalid_current' };
                    }
                }

                const newSalt = generateSalt();
                const newHash = await hashMasterPassword(master_password);

                await client.query(
                    `UPDATE vaults SET is_locked = TRUE, encryption_salt = $1, master_password_hash = $2 
                     WHERE id = $3 AND user_id = $4`,
                    [newSalt, newHash, vaultId, req.user.id]
                );

                return { status: 'ok', salt: newSalt };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Vault');
            }
            if (result.status === 'missing_current') {
                return sendBadRequest(res, 'Current password is required to change master password');
            }
            if (result.status === 'invalid_current') {
                return sendError(res, 'Invalid current password', 401, 'UNAUTHORIZED');
            }

            sendSuccess(res, { 
                message: 'Vault locked successfully',
                encryption_salt: result.salt
            });
        } catch (error) {
            logger.error('Error locking vault:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    // Remove master password (unlock vault)
    router.post('/vaults/:vaultId/unlock', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;
            const { master_password } = req.body;

            if (!master_password) {
                return sendBadRequest(res, 'Master password is required');
            }

            const result = await withDbClient(pool, async (client) => {
                const vaultResult = await client.query(
                    'SELECT * FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const vault = vaultResult.rows[0];

                if (!vault.is_locked) {
                    return { status: 'not_locked' };
                }

                const isValid = await verifyMasterPassword(master_password, vault.master_password_hash);
                if (!isValid) {
                    return { status: 'invalid_password' };
                }

                await client.query(
                    `UPDATE vaults SET is_locked = FALSE, encryption_salt = NULL, master_password_hash = NULL 
                     WHERE id = $1 AND user_id = $2`,
                    [vaultId, req.user.id]
                );

                return { status: 'ok' };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Vault');
            }
            if (result.status === 'not_locked') {
                return sendBadRequest(res, 'Vault is not locked');
            }
            if (result.status === 'invalid_password') {
                return sendError(res, 'Invalid master password', 401, 'UNAUTHORIZED');
            }

            sendSuccess(res, { message: 'Vault unlocked successfully' });
        } catch (error) {
            logger.error('Error unlocking vault:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    return router;
};
