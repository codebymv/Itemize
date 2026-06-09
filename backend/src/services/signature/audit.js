const { withDbClient } = require('../../utils/db');

async function logAuditEvent(pool, documentId, recipientId, eventType, description, metadata = {}, audit = {}) {
    return withDbClient(pool, async (client) => {
        await client.query(`
            INSERT INTO signature_audit_log (
                document_id,
                recipient_id,
                event_type,
                description,
                ip_address,
                user_agent,
                metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            documentId,
            recipientId || null,
            eventType,
            description || null,
            audit.ip_address || null,
            audit.user_agent || null,
            metadata || {}
        ]);
    });
}

module.exports = {
    logAuditEvent
};
