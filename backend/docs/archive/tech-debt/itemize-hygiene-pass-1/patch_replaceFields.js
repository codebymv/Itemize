const fs = require('fs');
let code = fs.readFileSync('backend/src/services/signature.service.js', 'utf8');

const regex = /let inserted = \[\];\s+if \(fields && fields\.length > 0\) \{[\s\S]*?inserted = result\.rows;\s+\}/;

const replace = `let inserted = [];
        if (fields && fields.length > 0) {
            const documentIds = [];
            const recipientIds = [];
            const roleNames = [];
            const fieldTypes = [];
            const pageNumbers = [];
            const xPositions = [];
            const yPositions = [];
            const widths = [];
            const heights = [];
            const labels = [];
            const isRequireds = [];
            const fieldValues = [];
            const fontSizes = [];
            const fontFamilies = [];
            const textAligns = [];
            const lockeds = [];

            for (const field of fields) {
                documentIds.push(documentId);
                recipientIds.push(field.recipient_id || null);
                roleNames.push(field.role_name || null);
                fieldTypes.push(field.field_type);
                pageNumbers.push(field.page_number || 1);
                xPositions.push(field.x_position);
                yPositions.push(field.y_position);
                widths.push(field.width);
                heights.push(field.height);
                labels.push(field.label || null);
                isRequireds.push(field.is_required !== undefined ? field.is_required : true);
                fieldValues.push(field.value || null);
                fontSizes.push(field.font_size || null);
                fontFamilies.push(field.font_family || null);
                textAligns.push(field.text_align || null);
                lockeds.push(field.locked || false);
            }

            const result = await client.query(\`
                INSERT INTO signature_fields (
                    document_id, recipient_id, role_name, field_type, page_number,
                    x_position, y_position, width, height, label,
                    is_required, value, font_size, font_family, text_align, locked
                )
                SELECT * FROM UNNEST (
                    $1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::int[],
                    $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::text[],
                    $11::boolean[], $12::text[], $13::int[], $14::text[], $15::text[], $16::boolean[]
                )
                RETURNING *
            \`, [
                documentIds, recipientIds, roleNames, fieldTypes, pageNumbers,
                xPositions, yPositions, widths, heights, labels,
                isRequireds, fieldValues, fontSizes, fontFamilies, textAligns, lockeds
            ]);
            inserted = result.rows;
        }`;

if (regex.test(code)) {
    fs.writeFileSync('backend/src/services/signature.service.js', code.replace(regex, replace));
    console.log('SUCCESS');
} else {
    console.log('FAIL TO MATCH');
}
