async function replaceRecipients(pool, organizationId, documentId, recipients) {
    return withTransaction(pool, async (client) => {
        await client.query(
            'DELETE FROM signature_recipients WHERE document_id = $1 AND organization_id = $2',
            [documentId, organizationId]
        );

        const inserted = [];
        for (const recipient of recipients) {
            const result = await client.query(`
                INSERT INTO signature_recipients (
                    document_id,
                    organization_id,
                    contact_id,
                    name,
                    email,
                    signing_order,
                    identity_method,
                    role_name,
                    routing_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [
                documentId,
                organizationId,
                recipient.contact_id || null,
                recipient.name || null,
                recipient.email,
                recipient.signing_order || 1,
                recipient.identity_method || 'none',
                recipient.role_name || null,
                recipient.routing_status || 'locked'
            ]);
            inserted.push(result.rows[0]);
        }

        // Map fields to recipients by role name if present
        const roleMap = new Map(inserted.map((rec) => [rec.role_name, rec.id]).filter(([role]) => role));
        for (const [roleName, recipientId] of roleMap.entries()) {
            await client.query(`
                UPDATE signature_fields
                SET recipient_id = $1
                WHERE document_id = $2 AND role_name = $3
            `, [recipientId, documentId, roleName]);
        }

        return inserted;
    });
}
