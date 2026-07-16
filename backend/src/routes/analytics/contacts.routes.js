const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendError, sendBadRequest } = require('../../utils/response');
const { resolvePeriod, toInteger } = require('../../services/analyticsParameters');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/analytics/contacts/trends
     * Returns contact trends over time (for charts)
     */
    router.get('/contacts/trends', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const periodConfig = resolvePeriod('contacts', req.query.period, '6months');
            if (!periodConfig) return sendBadRequest(res, 'Unsupported analytics period', 'period');

            const { period, interval, groupBy } = periodConfig;
            const orgId = req.organizationId;

            const data = await withDbClient(pool, async (client) => {
                const result = await client.query(`
        SELECT
          DATE_TRUNC($1, created_at) as period,
          COUNT(*) as new_contacts,
          COUNT(*) FILTER (WHERE source IS NOT NULL) as with_source
        FROM contacts
        WHERE organization_id = $2
          AND created_at >= NOW() - $3::interval
        GROUP BY DATE_TRUNC($1, created_at)
        ORDER BY period ASC
      `, [groupBy, orgId, interval]);

                return {
                    period,
                    data: result.rows.map(row => ({
                        period: row.period,
                        newContacts: toInteger(row.new_contacts),
                        withSource: toInteger(row.with_source)
                    }))
                };
            });
            return sendSuccess(res, data);
        } catch (error) {
            console.error('Error fetching contact trends:', error);
            return sendError(res, 'Internal server error');
        }
    });

    return router;
};
