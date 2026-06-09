const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendError } = require('../../utils/response');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/analytics/contacts/trends
     * Returns contact trends over time (for charts)
     */
    router.get('/contacts/trends', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '6months' } = req.query;
            const orgId = req.organizationId;

            let interval;
            let groupBy;
            switch (period) {
                case '7days':
                    interval = '7 days';
                    groupBy = 'day';
                    break;
                case '30days':
                    interval = '30 days';
                    groupBy = 'day';
                    break;
                case '12months':
                    interval = '12 months';
                    groupBy = 'month';
                    break;
                default:
                    interval = '6 months';
                    groupBy = 'month';
            }

            const data = await withDbClient(pool, async (client) => {
                const result = await client.query(`
        SELECT
          DATE_TRUNC($1, created_at) as period,
          COUNT(*) as new_contacts,
          COUNT(*) FILTER (WHERE source IS NOT NULL) as with_source
        FROM contacts
        WHERE organization_id = $2
          AND created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY DATE_TRUNC($1, created_at)
        ORDER BY period ASC
      `, [groupBy, orgId]);

                return {
                    period,
                    data: result.rows.map(row => ({
                        period: row.period,
                        newContacts: parseInt(row.new_contacts),
                        withSource: parseInt(row.with_source)
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
