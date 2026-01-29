/**
 * Categories Routes - Extracted from index.js
 * Handles all category CRUD operations
 */
const express = require('express');
const router = express.Router();
const { withDbClient } = require('../utils/db');
const { sendError } = require('../utils/response');

/**
 * Create categories routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {

    // Get all categories for the current user
    router.get('/categories', authenticateJWT, async (req, res) => {
        try {
            // Check if categories table exists
            const tableExists = await withDbClient(pool, async (client) => client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'categories'
        );
      `));

            if (!tableExists.rows[0].exists) {
                // Return legacy categories if new table doesn't exist
                return res.json([
                    { id: 'general', name: 'General', color_value: '#6B7280' },
                    { id: 'work', name: 'Work', color_value: '#EF4444' },
                    { id: 'personal', name: 'Personal', color_value: '#8B5CF6' }
                ]);
            }

            const result = await withDbClient(pool, async (client) => client.query(
                'SELECT id, name, color_value, created_at, updated_at FROM categories WHERE user_id = $1 ORDER BY name ASC',
                [req.user.id]
            ));
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching categories:', error);
            // Fallback to basic categories if there's an error
            res.json([
                { id: 'general', name: 'General', color_value: '#6B7280' },
                { id: 'work', name: 'Work', color_value: '#EF4444' },
                { id: 'personal', name: 'Personal', color_value: '#8B5CF6' }
            ]);
        }
    });

    // Create a new category
    router.post('/categories', authenticateJWT, async (req, res) => {
        try {
            const { name, color_value = '#3B82F6' } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Category name is required' });
            }

            const result = await withDbClient(pool, async (client) => client.query(
                'INSERT INTO categories (user_id, name, color_value) VALUES ($1, $2, $3) RETURNING *',
                [req.user.id, name.trim(), color_value]
            ));

            res.status(201).json(result.rows[0]);
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Category name already exists' });
            }
            console.error('Error creating category:', error);
            return sendError(res, 'Internal server error while creating category');
        }
    });

    // Update a category
    router.put('/categories/:id', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;
            const { name, color_value } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Category name is required' });
            }

            const result = await withDbClient(pool, async (client) => client.query(
                'UPDATE categories SET name = $1, color_value = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
                [name.trim(), color_value, id, req.user.id]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Category not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Category name already exists' });
            }
            console.error('Error updating category:', error);
            return sendError(res, 'Internal server error while updating category');
        }
    });

    // Delete a category
    router.delete('/categories/:id', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;

            const result = await withDbClient(pool, async (client) => {
                // Get General category for this user to reassign orphaned items
                const generalCategoryResult = await client.query(
                    'SELECT id FROM categories WHERE user_id = $1 AND name = $2',
                    [req.user.id, 'General']
                );

                if (generalCategoryResult.rows.length === 0) {
                    return { error: 'Cannot delete category: General category not found', result: null };
                }

                const generalCategoryId = generalCategoryResult.rows[0].id;

                // Don't allow deleting the General category
                if (parseInt(id) === generalCategoryId) {
                    return { error: 'Cannot delete the General category', result: null };
                }

                // Reassign lists and notes to General category
                await client.query(
                    'UPDATE lists SET category_id = $1 WHERE category_id = $2 AND user_id = $3',
                    [generalCategoryId, id, req.user.id]
                );

                await client.query(
                    'UPDATE notes SET category_id = $1 WHERE category_id = $2 AND user_id = $3',
                    [generalCategoryId, id, req.user.id]
                );

                // Delete the category
                const deleteResult = await client.query(
                    'DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING id',
                    [id, req.user.id]
                );

                return { error: null, result: deleteResult };
            });

            if (result.error) {
                return res.status(400).json({ error: result.error });
            }

            if (result.result.rows.length === 0) {
                return res.status(404).json({ error: 'Category not found' });
            }

            res.status(200).json({ message: 'Category deleted successfully' });
        } catch (error) {
            console.error('Error deleting category:', error);
            return sendError(res, 'Internal server error while deleting category');
        }
    });

    return router;
};
