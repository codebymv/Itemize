const express = require('express');
const crypto = require('crypto');
const { decrypt } = require('../../utils/encryption');
const { logger } = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendNotFound, sendError } = require('../../utils/response');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hashShareToken = (token) =>
    crypto.createHash('sha256').update(token, 'utf8').digest('hex');

module.exports = (pool, _authenticateJWT, publicRateLimit) => {
    const router = express.Router();

    // Get shared vault (public endpoint)
    router.get('/shared/vault/:token', publicRateLimit, asyncHandler(async (req, res) => {
        try {
            const { token } = req.params;
            res.set('Cache-Control', 'private, no-store');
            res.set('Referrer-Policy', 'no-referrer');
            res.set('X-Robots-Tag', 'noindex, nofollow');
            if (!UUID_PATTERN.test(token)) {
                return sendNotFound(res, 'Shared vault');
            }

            const result = await withDbClient(pool, async (client) => {
                const vaultResult = await client.query(
                    `SELECT id, title, category, color_value, is_locked,
                            COALESCE(crypto_version, 1) AS crypto_version,
                            share_snapshot_ciphertext, share_snapshot_iv,
                            created_at, updated_at
                     FROM vaults
                     WHERE is_public = TRUE
                       AND (share_token = $1 OR share_token_hash = $2)`,
                    [token, hashShareToken(token)]
                );

                if (vaultResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const vault = vaultResult.rows[0];
                if (Number(vault.crypto_version) >= 2) {
                    if (!vault.share_snapshot_ciphertext || !vault.share_snapshot_iv) {
                        return { status: 'decryption_failed' };
                    }
                    return {
                        status: 'ok',
                        cryptoVersion: 2,
                        vault,
                        snapshot: {
                            ciphertext: vault.share_snapshot_ciphertext,
                            iv: vault.share_snapshot_iv,
                        },
                        items: [],
                    };
                }

                if (vault.is_locked) {
                    return { status: 'locked' };
                }

                const itemsResult = await client.query(
                    `SELECT id, item_type, label, encrypted_value, iv, order_index, created_at, updated_at
                     FROM vault_items WHERE vault_id = $1 ORDER BY order_index ASC`,
                    [vault.id]
                );

                const decryptedItems = [];
                for (const item of itemsResult.rows) {
                    try {
                        const decryptedValue = decrypt(item.encrypted_value, item.iv);
                        decryptedItems.push({
                            id: item.id,
                            item_type: item.item_type,
                            label: item.label,
                            value: decryptedValue,
                            order_index: item.order_index
                        });
                    } catch (_decryptError) {
                        logger.error('Error decrypting shared vault item', { itemId: item.id });
                        return { status: 'decryption_failed' };
                    }
                }

                return { status: 'ok', cryptoVersion: 1, vault, items: decryptedItems };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Shared vault');
            }
            if (result.status === 'locked') {
                return sendError(res, 'This vault is locked and cannot be viewed publicly', 403, 'FORBIDDEN');
            }
            if (result.status === 'decryption_failed') {
                return sendError(res, 'Shared vault is temporarily unavailable', 500);
            }

            sendSuccess(res, {
                id: result.vault.id,
                title: result.vault.title,
                category: result.vault.category,
                color_value: result.vault.color_value,
                created_at: result.vault.created_at,
                updated_at: result.vault.updated_at,
                crypto_version: result.cryptoVersion,
                snapshot: result.snapshot ?? null,
                items: result.items,
                is_shared: true
            });
        } catch (error) {
            logger.error('Error fetching shared vault:', { error: error.message });
            return sendError(res, 'Internal server error');
        }
    }));
    return router;
};
