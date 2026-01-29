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

            const client = await pool.connect();
            
            try {
                const currentVaultResult = await client.query(
                    'SELECT * FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (currentVaultResult.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
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

                const updatedVault = updateResult.rows[0];

                res.json({
                    ...updatedVault,
                    master_password_hash: undefined
                });
            } finally {
                client.release();
            }
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
                return res.status(400).json({ error: 'position_x and position_y are required and must be numbers.' });
            }

            const client = await pool.connect();
            
            try {
                const result = await client.query(
                    `UPDATE vaults SET position_x = $1, position_y = $2, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $3 AND user_id = $4 RETURNING *`,
                    [position_x, position_y, vaultId, req.user.id]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                res.json({
                    ...result.rows[0],
                    master_password_hash: undefined
                });
            } finally {
                client.release();
            }
        } catch (error) {
            logger.error('Error updating vault position:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    // Delete a vault
    router.delete('/vaults/:vaultId', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;
            const client = await pool.connect();

            try {
                const checkResult = await client.query(
                    'SELECT id, title, share_token, is_public FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (checkResult.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                const vaultInfo = checkResult.rows[0];

                // Delete vault (cascade will delete items)
                const result = await client.query(
                    'DELETE FROM vaults WHERE id = $1 AND user_id = $2 RETURNING id',
                    [vaultId, req.user.id]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                logger.info(`Vault ${vaultId} deleted`, { title: vaultInfo.title, userId: req.user.id });
                res.status(200).json({ message: 'Vault deleted successfully' });
            } finally {
                client.release();
            }
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
                return res.status(400).json({ error: 'item_ids array is required' });
            }

            const client = await pool.connect();
            
            try {
                // Verify ownership through vault
                const vaultCheck = await client.query(
                    'SELECT id FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultCheck.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                // Update order_index for each item
                for (let i = 0; i < item_ids.length; i++) {
                    await client.query(
                        'UPDATE vault_items SET order_index = $1 WHERE id = $2 AND vault_id = $3',
                        [i, item_ids[i], vaultId]
                    );
                }

                // Update vault's updated_at
                await client.query(
                    'UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [vaultId]
                );

                res.json({ message: 'Items reordered successfully' });
            } finally {
                client.release();
            }
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
                return res.status(400).json({ error: 'item_type must be "key_value" or "secure_note"' });
            }

            if (!label || label.trim() === '') {
                return res.status(400).json({ error: 'label is required' });
            }

            if (value === undefined || value === null) {
                return res.status(400).json({ error: 'value is required' });
            }

            const client = await pool.connect();
            
            try {
                // Verify vault ownership
                const vaultCheck = await client.query(
                    'SELECT id FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultCheck.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                // Get next order_index
                const orderResult = await client.query(
                    'SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM vault_items WHERE vault_id = $1',
                    [vaultId]
                );
                const nextOrder = orderResult.rows[0].next_order;

                // Encrypt the value
                const { encrypted, iv } = encrypt(value);

                const result = await client.query(
                    `INSERT INTO vault_items (vault_id, item_type, label, encrypted_value, iv, order_index) 
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                    [vaultId, item_type, label.trim(), encrypted, iv, nextOrder]
                );

                const item = result.rows[0];

                // Update vault's updated_at
                await client.query(
                    'UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [vaultId]
                );

                res.status(201).json({
                    id: item.id,
                    vault_id: item.vault_id,
                    item_type: item.item_type,
                    label: item.label,
                    value: value, // Return unencrypted for immediate use
                    order_index: item.order_index,
                    created_at: item.created_at,
                    updated_at: item.updated_at
                });
            } finally {
                client.release();
            }
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
                return res.status(400).json({ error: 'items array is required and must not be empty' });
            }

            const client = await pool.connect();
            
            try {
                // Verify vault ownership
                const vaultCheck = await client.query(
                    'SELECT id FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultCheck.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                // Get starting order_index
                const orderResult = await client.query(
                    'SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM vault_items WHERE vault_id = $1',
                    [vaultId]
                );
                let nextOrder = orderResult.rows[0].next_order;

                const createdItems = [];

                for (const item of items) {
                    const { item_type = 'key_value', label, value } = item;

                    if (!label || !value) {
                        continue; // Skip invalid items
                    }

                    // Encrypt the value
                    const { encrypted, iv } = encrypt(value);

                    const result = await client.query(
                        `INSERT INTO vault_items (vault_id, item_type, label, encrypted_value, iv, order_index) 
                         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                        [vaultId, item_type, label.trim(), encrypted, iv, nextOrder++]
                    );

                    const createdItem = result.rows[0];
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

                // Update vault's updated_at
                await client.query(
                    'UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [vaultId]
                );

                res.status(201).json({
                    items: createdItems,
                    count: createdItems.length
                });
            } finally {
                client.release();
            }
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

            const client = await pool.connect();
            
            try {
                // Verify ownership through vault
                const vaultCheck = await client.query(
                    'SELECT id FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultCheck.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                // Get current item
                const currentItemResult = await client.query(
                    'SELECT * FROM vault_items WHERE id = $1 AND vault_id = $2',
                    [itemId, vaultId]
                );

                if (currentItemResult.rows.length === 0) {
                    return res.status(404).json({ error: 'Item not found' });
                }

                const currentItem = currentItemResult.rows[0];
                const newLabel = label !== undefined ? label.trim() : currentItem.label;
                
                let newEncryptedValue = currentItem.encrypted_value;
                let newIv = currentItem.iv;
                let returnValue;

                if (value !== undefined) {
                    // Re-encrypt with new value
                    const encrypted = encrypt(value);
                    newEncryptedValue = encrypted.encrypted;
                    newIv = encrypted.iv;
                    returnValue = value;
                } else {
                    // Decrypt existing value for response
                    returnValue = decrypt(currentItem.encrypted_value, currentItem.iv);
                }

                const result = await client.query(
                    `UPDATE vault_items SET label = $1, encrypted_value = $2, iv = $3, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $4 AND vault_id = $5 RETURNING *`,
                    [newLabel, newEncryptedValue, newIv, itemId, vaultId]
                );

                // Update vault's updated_at
                await client.query(
                    'UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [vaultId]
                );

                const item = result.rows[0];
                res.json({
                    id: item.id,
                    vault_id: item.vault_id,
                    item_type: item.item_type,
                    label: item.label,
                    value: returnValue,
                    order_index: item.order_index,
                    created_at: item.created_at,
                    updated_at: item.updated_at
                });
            } finally {
                client.release();
            }
        } catch (error) {
            logger.error('Error updating vault item:', { error: error.message });
            return sendError(res, 'Internal server error while updating vault item');
        }
    }));

    // Delete a vault item
    router.delete('/vaults/:vaultId/items/:itemId', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId, itemId } = req.params;

            const client = await pool.connect();
            
            try {
                // Verify ownership through vault
                const vaultCheck = await client.query(
                    'SELECT id FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultCheck.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                const result = await client.query(
                    'DELETE FROM vault_items WHERE id = $1 AND vault_id = $2 RETURNING id',
                    [itemId, vaultId]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({ error: 'Item not found' });
                }

                // Update vault's updated_at
                await client.query(
                    'UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [vaultId]
                );

                res.status(200).json({ message: 'Item deleted successfully' });
            } finally {
                client.release();
            }
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

            const client = await pool.connect();
            
            try {
                // Get vault
                const vaultResult = await client.query(
                    'SELECT * FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultResult.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                const vault = vaultResult.rows[0];

                // Generate share token if not exists
                let shareToken = vault.share_token;
                if (!shareToken) {
                    shareToken = crypto.randomUUID();
                }

                // Update vault to enable sharing
                await client.query(
                    `UPDATE vaults SET share_token = $1, is_public = TRUE, shared_at = CURRENT_TIMESTAMP 
                     WHERE id = $2 AND user_id = $3`,
                    [shareToken, vaultId, req.user.id]
                );

                const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/shared/vault/${shareToken}`;

                res.json({
                    shareToken,
                    shareUrl,
                    message: 'Vault sharing enabled'
                });
            } finally {
                client.release();
            }
        } catch (error) {
            logger.error('Error enabling vault sharing:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    // Disable sharing for a vault
    router.delete('/vaults/:vaultId/share', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;

            const client = await pool.connect();
            
            try {
                const result = await client.query(
                    `UPDATE vaults SET is_public = FALSE WHERE id = $1 AND user_id = $2 RETURNING id`,
                    [vaultId, req.user.id]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                res.json({ message: 'Vault sharing disabled' });
            } finally {
                client.release();
            }
        } catch (error) {
            logger.error('Error disabling vault sharing:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    // Get shared vault (public endpoint)
    router.get('/shared/vault/:token', asyncHandler(async (req, res) => {
        try {
            const { token } = req.params;

            const client = await pool.connect();
            
            try {
                // Get vault by share token
                const vaultResult = await client.query(
                    `SELECT id, title, category, color_value, is_locked, created_at, updated_at 
                     FROM vaults WHERE share_token = $1 AND is_public = TRUE`,
                    [token]
                );

                if (vaultResult.rows.length === 0) {
                    return res.status(404).json({ error: 'Shared vault not found or sharing has been disabled' });
                }

                const vault = vaultResult.rows[0];

                // Don't allow viewing locked vaults publicly
                if (vault.is_locked) {
                    return res.status(403).json({ error: 'This vault is locked and cannot be viewed publicly' });
                }

                // Get items
                const itemsResult = await client.query(
                    `SELECT id, item_type, label, encrypted_value, iv, order_index, created_at, updated_at 
                     FROM vault_items WHERE vault_id = $1 ORDER BY order_index ASC`,
                    [vault.id]
                );

                // Decrypt items
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

                res.json({
                    id: vault.id,
                    title: vault.title,
                    category: vault.category,
                    color_value: vault.color_value,
                    created_at: vault.created_at,
                    updated_at: vault.updated_at,
                    items: decryptedItems,
                    is_shared: true
                });
            } finally {
                client.release();
            }
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
                return res.status(400).json({ error: 'Master password must be at least 8 characters' });
            }

            const client = await pool.connect();
            
            try {
                const vaultResult = await client.query(
                    'SELECT * FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultResult.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                const vault = vaultResult.rows[0];

                // If vault is already locked, require current password
                if (vault.is_locked && vault.master_password_hash) {
                    if (!current_password) {
                        return res.status(400).json({ error: 'Current password is required to change master password' });
                    }
                    const isValid = await verifyMasterPassword(current_password, vault.master_password_hash);
                    if (!isValid) {
                        return res.status(401).json({ error: 'Invalid current password' });
                    }
                }

                // Set new master password
                const newSalt = generateSalt();
                const newHash = await hashMasterPassword(master_password);

                await client.query(
                    `UPDATE vaults SET is_locked = TRUE, encryption_salt = $1, master_password_hash = $2 
                     WHERE id = $3 AND user_id = $4`,
                    [newSalt, newHash, vaultId, req.user.id]
                );

                res.json({ 
                    message: 'Vault locked successfully',
                    encryption_salt: newSalt
                });
            } finally {
                client.release();
            }
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
                return res.status(400).json({ error: 'Master password is required' });
            }

            const client = await pool.connect();
            
            try {
                const vaultResult = await client.query(
                    'SELECT * FROM vaults WHERE id = $1 AND user_id = $2',
                    [vaultId, req.user.id]
                );

                if (vaultResult.rows.length === 0) {
                    return res.status(404).json({ error: 'Vault not found or access denied' });
                }

                const vault = vaultResult.rows[0];

                if (!vault.is_locked) {
                    return res.status(400).json({ error: 'Vault is not locked' });
                }

                // Verify master password
                const isValid = await verifyMasterPassword(master_password, vault.master_password_hash);
                if (!isValid) {
                    return res.status(401).json({ error: 'Invalid master password' });
                }

                // Remove lock
                await client.query(
                    `UPDATE vaults SET is_locked = FALSE, encryption_salt = NULL, master_password_hash = NULL 
                     WHERE id = $1 AND user_id = $2`,
                    [vaultId, req.user.id]
                );

                res.json({ message: 'Vault unlocked successfully' });
            } finally {
                client.release();
            }
        } catch (error) {
            logger.error('Error unlocking vault:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));

    return router;
};
