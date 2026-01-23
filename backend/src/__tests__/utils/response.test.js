/**
 * Response Utilities Tests
 */

const {
    sendSuccess,
    sendPaginated,
    sendError,
    sendBadRequest,
    sendNotFound,
    sendUnauthorized,
    sendForbidden,
    sendCreated,
    sendNoContent,
    getPaginationParams,
    buildPagination
} = require('../../utils/response');

describe('Response utilities', () => {
    let mockRes;

    beforeEach(() => {
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            send: jest.fn()
        };
    });

    describe('sendSuccess', () => {
        it('should send success response with data', () => {
            const data = { id: 1, name: 'Test' };
            
            sendSuccess(mockRes, data);
            
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                data
            });
        });

        it('should use custom status code', () => {
            sendSuccess(mockRes, {}, 201);
            
            expect(mockRes.status).toHaveBeenCalledWith(201);
        });
    });

    describe('sendPaginated', () => {
        it('should send paginated response', () => {
            const items = [{ id: 1 }, { id: 2 }];
            const pagination = { page: 1, limit: 10, total: 2 };
            
            sendPaginated(mockRes, items, pagination);
            
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                data: items,
                pagination
            });
        });
    });

    describe('sendError', () => {
        it('should send error response', () => {
            sendError(mockRes, 'Something went wrong', 500, 'INTERNAL_ERROR');
            
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    message: 'Something went wrong',
                    code: 'INTERNAL_ERROR'
                }
            });
        });

        it('should use default values', () => {
            sendError(mockRes, 'Error');
            
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    message: 'Error',
                    code: 'ERROR'
                }
            });
        });
    });

    describe('sendBadRequest', () => {
        it('should send 400 response', () => {
            sendBadRequest(mockRes, 'Invalid input');
            
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    message: 'Invalid input',
                    code: 'BAD_REQUEST'
                }
            });
        });

        it('should include field when provided', () => {
            sendBadRequest(mockRes, 'Invalid email', 'email');
            
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    message: 'Invalid email',
                    code: 'BAD_REQUEST',
                    field: 'email'
                }
            });
        });
    });

    describe('sendNotFound', () => {
        it('should send 404 response', () => {
            sendNotFound(mockRes, 'User');
            
            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    message: 'User not found',
                    code: 'NOT_FOUND'
                }
            });
        });

        it('should use default resource name', () => {
            sendNotFound(mockRes);
            
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    message: 'Resource not found',
                    code: 'NOT_FOUND'
                }
            });
        });
    });

    describe('sendUnauthorized', () => {
        it('should send 401 response', () => {
            sendUnauthorized(mockRes, 'Invalid token');
            
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    message: 'Invalid token',
                    code: 'UNAUTHORIZED'
                }
            });
        });
    });

    describe('sendForbidden', () => {
        it('should send 403 response', () => {
            sendForbidden(mockRes, 'Access denied');
            
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    message: 'Access denied',
                    code: 'FORBIDDEN'
                }
            });
        });
    });

    describe('sendCreated', () => {
        it('should send 201 response', () => {
            const data = { id: 1 };
            
            sendCreated(mockRes, data);
            
            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                data
            });
        });
    });

    describe('sendNoContent', () => {
        it('should send 204 response', () => {
            sendNoContent(mockRes);
            
            expect(mockRes.status).toHaveBeenCalledWith(204);
            expect(mockRes.send).toHaveBeenCalled();
        });
    });
});

describe('getPaginationParams', () => {
    it('should parse valid pagination parameters', () => {
        const result = getPaginationParams({ page: '2', limit: '25' });
        
        expect(result).toEqual({
            page: 2,
            limit: 25,
            offset: 25
        });
    });

    it('should use defaults for missing parameters', () => {
        const result = getPaginationParams({});
        
        expect(result).toEqual({
            page: 1,
            limit: 50,
            offset: 0
        });
    });

    it('should enforce minimum page of 1', () => {
        const result = getPaginationParams({ page: '0' });
        
        expect(result.page).toBe(1);
    });

    it('should enforce maximum limit', () => {
        const result = getPaginationParams({ limit: '500' });
        
        expect(result.limit).toBe(100);
    });

    it('should use custom defaults', () => {
        const result = getPaginationParams({}, { page: 1, limit: 20, maxLimit: 50 });
        
        expect(result.limit).toBe(20);
    });

    it('should calculate offset correctly', () => {
        const result = getPaginationParams({ page: '3', limit: '10' });
        
        expect(result.offset).toBe(20);
    });
});

describe('buildPagination', () => {
    it('should build correct pagination metadata', () => {
        const result = buildPagination(1, 10, 100);
        
        expect(result).toEqual({
            page: 1,
            limit: 10,
            total: 100,
            totalPages: 10,
            hasNext: true,
            hasPrev: false
        });
    });

    it('should handle middle page', () => {
        const result = buildPagination(5, 10, 100);
        
        expect(result.hasNext).toBe(true);
        expect(result.hasPrev).toBe(true);
    });

    it('should handle last page', () => {
        const result = buildPagination(10, 10, 100);
        
        expect(result.hasNext).toBe(false);
        expect(result.hasPrev).toBe(true);
    });

    it('should handle single page', () => {
        const result = buildPagination(1, 10, 5);
        
        expect(result.totalPages).toBe(1);
        expect(result.hasNext).toBe(false);
        expect(result.hasPrev).toBe(false);
    });
});
