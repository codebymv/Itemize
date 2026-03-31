const { Pool } = require('pg');
function benchmark() {
  const items = Array.from({ length: 5000 }).map((_, i) => ({
    name: `Item ${i}`,
    quantity: 1,
    unit_price: 10.0,
    tax_rate: 5.0,
    description: `Description ${i}`,
  }));

  const estimateId = 1;
  const organizationId = 1;

  // Measure original construction
  const startOriginal = Date.now();
  const values = [];
  const params = [];

  for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
      const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

      const offset = i * 11;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`);

      params.push(
          estimateId,
          organizationId,
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
  const queryStr = values.join(', '); // Simulate building query string
  const endOriginal = Date.now();

  console.log(`Original Parameter count: ${params.length}`);
  console.log(`Original Time (creation only): ${endOriginal - startOriginal}ms`);

  // Measure Unnest construction
  const startUnnest = Date.now();
  const estimateIds = new Array(items.length).fill(estimateId);
  const orgIds = new Array(items.length).fill(organizationId);
  const productIds = [];
  const names = [];
  const descriptions = [];
  const quantities = [];
  const unitPrices = [];
  const taxRates = [];
  const taxAmounts = [];
  const totals = [];
  const sortOrders = [];

  for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
      const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

      productIds.push(item.product_id || null);
      names.push(item.name);
      descriptions.push(item.description || null);
      quantities.push(item.quantity || 1);
      unitPrices.push(item.unit_price || 0);
      taxRates.push(item.tax_rate || 0);
      taxAmounts.push(itemTax);
      totals.push(itemTotal + itemTax);
      sortOrders.push(i);
  }

  const endUnnest = Date.now();
  console.log(`Unnest Parameter count: 11 (arrays of length 5000)`);
  console.log(`Unnest Time (creation only): ${endUnnest - startUnnest}ms`);
}

benchmark();
