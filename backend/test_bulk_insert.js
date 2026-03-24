const generateBulkInsertQuery = (fields, formId) => {
    const values = [];
    const params = [];
    let paramIndex = 1;

    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];

        params.push(
            formId,
            field.field_type,
            field.label,
            field.placeholder || null,
            field.help_text || null,
            field.is_required || false,
            JSON.stringify(field.validation || {}),
            JSON.stringify(field.options || []),
            field.field_order !== undefined ? field.field_order : i, // for duplicate use field.field_order, else i
            field.width || 'full',
            JSON.stringify(field.conditions || []),
            field.map_to_contact_field || null
        );

        const rowValues = [];
        for (let j = 0; j < 12; j++) {
            rowValues.push(`$${paramIndex++}`);
        }
        values.push(`(${rowValues.join(', ')})`);
    }

    const query = `
        INSERT INTO form_fields (
            form_id, field_type, label, placeholder, help_text,
            is_required, validation, options, field_order, width,
            conditions, map_to_contact_field
        ) VALUES ${values.join(', ')}
    `;

    return { query, params };
};

const fields = [
    { field_type: 'text', label: 'First Name' },
    { field_type: 'email', label: 'Email Address', is_required: true, field_order: 1 }
];

const { query, params } = generateBulkInsertQuery(fields, 'form-123');
console.log(query);
console.log(params);
