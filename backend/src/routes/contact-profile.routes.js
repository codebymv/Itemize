const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { fetchProfileData } = require('./contact-profile/queries');
const { buildContactProfileResponse } = require('./contact-profile/response');

/**
 * GET /api/contacts/:id/profile
 * Returns complete client profile with all cross-module data
 */
router.get('/:id/profile', async (req, res) => {
    const { id } = req.params;
    const organizationId = req.headers.organization_id;
    const pool = req.dbPool;

    try {
        logger.info('Fetching client profile', { contactId: id });

        if (!pool) {
            return res.status(503).json({ error: 'Database connection not available' });
        }

        const profileData = await fetchProfileData({
            pool,
            contactId: id,
            organizationId,
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

module.exports = router;
