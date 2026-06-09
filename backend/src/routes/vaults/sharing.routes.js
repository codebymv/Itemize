const express = require('express');
const crypto = require('crypto');
const { decrypt } = require('../../utils/encryption');
const { logger } = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendNotFound, sendError } = require('../../utils/response');
const { vaultColumns } = require('./columns');

module.exports = (pool, authenticateJWT) => {
    const router = express.Router();

    // =====================

    // Enable sharing for a vault
    router.post('/vaults/:vaultId/share', authenticateJWT, asyncHandler(async (req, res) => {
        try {
            const { vaultId } = req.params;

            const result = await withDbClient(pool, async (client) => {
                const vaultResult = await client.query(
                    `SELECT ${vaultColumns()} FROM vaults WHERE id = $1 AND user_id = $2`,
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
                    } catch (_decryptError) {
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

    return router;
};
