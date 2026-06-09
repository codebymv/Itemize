const express = require('express');
const { decrypt, hashMasterPassword, verifyMasterPassword, generateSalt } = require('../../utils/encryption');
const { logger } = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError, sendPaginated, getPaginationParams, buildPagination } = require('../../utils/response');
const { vaultColumns } = require('./columns');

module.exports = (pool, authenticateJWT) => {
    const router = express.Router();

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
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING ${vaultColumns()}`,
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
                    `SELECT ${vaultColumns()} FROM vaults WHERE id = $1 AND user_id = $2`,
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
                     WHERE id = $9 AND user_id = $10 RETURNING ${vaultColumns()}`,
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
                     WHERE id = $3 AND user_id = $4 RETURNING ${vaultColumns()}`,
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

    return router;
};
