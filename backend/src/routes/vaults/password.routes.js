const express = require('express');
const { hashMasterPassword, verifyMasterPassword, generateSalt } = require('../../utils/encryption');
const { logger } = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendBadRequest, sendNotFound, sendError } = require('../../utils/response');
const { vaultColumns } = require('./columns');

module.exports = (pool, authenticateJWT) => {
    const router = express.Router();


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
                    `SELECT ${vaultColumns()} FROM vaults WHERE id = $1 AND user_id = $2`,
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
                    `SELECT ${vaultColumns()} FROM vaults WHERE id = $1 AND user_id = $2`,
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
