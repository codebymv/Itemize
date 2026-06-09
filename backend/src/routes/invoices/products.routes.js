const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound } = require('../../utils/response');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

    // ======================
    // Products CRUD
    // ======================

    /**
     * GET /api/invoices/products - List products
     */
    router.get('/products', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { is_active, search } = req.query;

            let query = `
                SELECT * FROM products WHERE organization_id = $1
            `;
            const params = [req.organizationId];
            let paramIndex = 2;

            if (is_active !== undefined) {
                query += ` AND is_active = $${paramIndex}`;
                params.push(is_active === 'true');
                paramIndex++;
            }

            if (search) {
                query += ` AND (name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
            }

            query += ' ORDER BY name ASC';

            const result = await withDbClient(pool, async (client) => {
                return client.query(query, params);
            });

            return sendSuccess(res, result.rows);
    }));

    /**
     * POST /api/invoices/products - Create product
     */
    router.post('/products', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { name, description, sku, price, currency, product_type, billing_period, tax_rate, taxable } = req.body;

            if (!name || price === undefined) {
                return sendBadRequest(res, 'Name and price are required');
            }

            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                INSERT INTO products (
                    organization_id, name, description, sku, price, currency,
                    product_type, billing_period, tax_rate, taxable, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
            `, [
                req.organizationId,
                name,
                description || null,
                sku || null,
                price,
                currency || 'USD',
                product_type || 'one_time',
                billing_period || null,
                tax_rate || 0,
                taxable !== false,
                req.user.id
            ]);
            });

            return sendCreated(res, result.rows[0]);
    }));

    /**
     * PUT /api/invoices/products/:id - Update product
     */
    router.put('/products/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { id } = req.params;
            const { name, description, sku, price, currency, product_type, billing_period, tax_rate, taxable, is_active } = req.body;

            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                UPDATE products SET
                    name = COALESCE($1, name),
                    description = $2,
                    sku = $3,
                    price = COALESCE($4, price),
                    currency = COALESCE($5, currency),
                    product_type = COALESCE($6, product_type),
                    billing_period = $7,
                    tax_rate = COALESCE($8, tax_rate),
                    taxable = COALESCE($9, taxable),
                    is_active = COALESCE($10, is_active),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $11 AND organization_id = $12
                RETURNING *
            `, [name, description, sku, price, currency, product_type, billing_period, tax_rate, taxable, is_active, id, req.organizationId]);
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Product');
            }

            return sendSuccess(res, result.rows[0]);
    }));

    /**
     * DELETE /api/invoices/products/:id - Delete product
     */
    router.delete('/products/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    'DELETE FROM products WHERE id = $1 AND organization_id = $2 RETURNING id',
                    [id, req.organizationId]
                );
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Product');
            }

            return sendSuccess(res, { success: true });
    }));

    return router;
};
