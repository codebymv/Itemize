const express = require('express');
const { logger } = require('../utils/logger');
const { fetchProfileData } = require('./contact-profile/queries');
const { buildContactProfileResponse } = require('./contact-profile/response');

module.exports = (pool, authenticateJWT) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    /**
     * GET /api/contacts/:id/profile
     * Returns complete client profile with all cross-module data
     */
    router.get('/:id/profile', authenticateJWT, requireOrganization, async (req, res) => {
        const { id } = req.params;

        try {
            logger.info('Fetching client profile', {
                contactId: id,
                organizationId: req.organizationId,
            });

            const profileData = await fetchProfileData({
                pool,
                contactId: id,
                organizationId: req.organizationId,
                logger
            });

            if (!profileData) {
                return res.status(404).json({ error: 'Contact not found' });
            }

            res.json(buildContactProfileResponse(profileData));
        } catch (error) {
            logger.error('Error fetching client profile', { error: error.message, stack: error.stack });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
