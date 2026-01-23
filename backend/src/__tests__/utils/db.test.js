/**
 * Database Utilities Tests
 */

const { 
    buildPaginatedResult, 
    buildWhereClause, 
    buildOrderByClause 
} = require('../../utils/db');

describe('buildPaginatedResult', () => {
    it('should build correct pagination metadata', () => {
        const result = buildPaginatedResult({
            page: 1,
            limit: 10,
            total: 100,
            items: [{}, {}, {}]
        });

        expect(result.data).toHaveLength(3);
        expect(result.pagination).toEqual({
            page: 1,
            limit: 10,
            total: 100,
            totalPages: 10,
            hasNext: true,
            hasPrev: false
        });
    });

    it('should correctly calculate hasNext and hasPrev', () => {
        const result = buildPaginatedResult({
            page: 5,
            limit: 10,
            total: 100,
            items: []
        });

        expect(result.pagination.hasNext).toBe(true);
        expect(result.pagination.hasPrev).toBe(true);
    });

    it('should handle last page correctly', () => {
        const result = buildPaginatedResult({
            page: 10,
            limit: 10,
            total: 100,
            items: []
        });

        expect(result.pagination.hasNext).toBe(false);
        expect(result.pagination.hasPrev).toBe(true);
    });

    it('should handle single page correctly', () => {
        const result = buildPaginatedResult({
            page: 1,
            limit: 10,
            total: 5,
            items: []
        });

        expect(result.pagination.totalPages).toBe(1);
        expect(result.pagination.hasNext).toBe(false);
        expect(result.pagination.hasPrev).toBe(false);
    });

    it('should handle empty results', () => {
        const result = buildPaginatedResult({
            page: 1,
            limit: 10,
            total: 0,
            items: []
        });

        expect(result.pagination.totalPages).toBe(0);
        expect(result.pagination.hasNext).toBe(false);
        expect(result.pagination.hasPrev).toBe(false);
    });
});

describe('buildWhereClause', () => {
    it('should build empty WHERE clause for empty filters', () => {
        const { whereClause, params, nextIndex } = buildWhereClause({}, 1);

        expect(whereClause).toBe('');
        expect(params).toEqual([]);
        expect(nextIndex).toBe(1);
    });

    it('should build WHERE clause with single filter', () => {
        const { whereClause, params, nextIndex } = buildWhereClause({
            status: 'active'
        }, 1);

        expect(whereClause).toBe('WHERE status = $1');
        expect(params).toEqual(['active']);
        expect(nextIndex).toBe(2);
    });

    it('should build WHERE clause with multiple filters', () => {
        const { whereClause, params, nextIndex } = buildWhereClause({
            status: 'active',
            organization_id: 123
        }, 1);

        expect(whereClause).toBe('WHERE status = $1 AND organization_id = $2');
        expect(params).toEqual(['active', 123]);
        expect(nextIndex).toBe(3);
    });

    it('should skip null and undefined values', () => {
        const { whereClause, params } = buildWhereClause({
            status: 'active',
            email: null,
            phone: undefined
        }, 1);

        expect(whereClause).toBe('WHERE status = $1');
        expect(params).toEqual(['active']);
    });

    it('should skip empty string values', () => {
        const { whereClause, params } = buildWhereClause({
            status: 'active',
            email: ''
        }, 1);

        expect(whereClause).toBe('WHERE status = $1');
        expect(params).toEqual(['active']);
    });

    it('should handle array values with ANY syntax', () => {
        const { whereClause, params } = buildWhereClause({
            id: [1, 2, 3]
        }, 1);

        expect(whereClause).toBe('WHERE id = ANY($1)');
        expect(params).toEqual([[1, 2, 3]]);
    });

    it('should start from custom index', () => {
        const { whereClause, params, nextIndex } = buildWhereClause({
            status: 'active'
        }, 5);

        expect(whereClause).toBe('WHERE status = $5');
        expect(params).toEqual(['active']);
        expect(nextIndex).toBe(6);
    });
});

describe('buildOrderByClause', () => {
    it('should use default column when sortBy is not allowed', () => {
        const result = buildOrderByClause('unknown', 'asc', ['name', 'created_at']);

        expect(result).toBe('ORDER BY created_at ASC');
    });

    it('should use provided column when allowed', () => {
        const result = buildOrderByClause('name', 'asc', ['name', 'created_at']);

        expect(result).toBe('ORDER BY name ASC');
    });

    it('should default to DESC when order is invalid', () => {
        const result = buildOrderByClause('name', 'invalid', ['name']);

        expect(result).toBe('ORDER BY name DESC');
    });

    it('should handle case-insensitive order', () => {
        const resultAsc = buildOrderByClause('name', 'ASC', ['name']);
        const resultDesc = buildOrderByClause('name', 'DESC', ['name']);

        expect(resultAsc).toBe('ORDER BY name ASC');
        expect(resultDesc).toBe('ORDER BY name DESC');
    });

    it('should use custom default column', () => {
        const result = buildOrderByClause('unknown', 'desc', ['name'], 'updated_at');

        expect(result).toBe('ORDER BY updated_at DESC');
    });
});
