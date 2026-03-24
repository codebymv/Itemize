async function replaceRecipients(pool, organizationId, documentId, recipients) {
    return withTransaction(pool, async (client) => {
        await client.query(
            'DELETE FROM signature_recipients WHERE document_id = $1 AND organization_id = $2',
            [documentId, organizationId]
        );

        const inserted = [];
        if (recipients && recipients.length > 0) {
            const values = [];
            const args = [];
            let paramIndex = 1;

            for (const recipient of recipients) {
                values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);

                args.push(
                    documentId,
                    organizationId,
                    recipient.contact_id || null,
                    recipient.name || null,
                    recipient.email,
                    recipient.signing_order || 1,
                    recipient.identity_method || 'none',
                    recipient.role_name || null,
                    recipient.routing_status || 'locked'
                );
            }

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
                ) VALUES ${values.join(', ')}
                RETURNING *
            `, args);

            inserted.push(...result.rows);
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
