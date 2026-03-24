// Quick check of the generated SQL logic to ensure syntax is clean.

const items = [
    { product_id: 1, name: "Item 1", unit_price: 10, quantity: 2, tax_rate: 0 },
    { name: "Item 2", unit_price: 20, quantity: 1, tax_rate: 10 }
];

const id = 123;
const req = { organizationId: 456 };

let valuesClauses = [];
let insertParams = [];
let pIdx = 1;

for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
    const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

    valuesClauses.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
    insertParams.push(
        id,
        req.organizationId,
        item.product_id || null,
        item.name,
        item.description || null,
        item.quantity || 1,
        item.unit_price || 0,
        item.tax_rate || 0,
        itemTax,
        itemTotal + itemTax,
        i
    );
}

const sql = `
    INSERT INTO estimate_items (
        estimate_id, organization_id, product_id, name, description,
        quantity, unit_price, tax_rate, tax_amount, total, sort_order
    ) VALUES ${valuesClauses.join(', ')}
`;

console.log(sql);
console.log(insertParams);
