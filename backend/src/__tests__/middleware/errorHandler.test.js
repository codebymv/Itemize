/**
 * Error Handler Middleware Tests
 */

const { AppError, errors, errorHandler, asyncHandler } = require('../../middleware/errorHandler');

describe('AppError', () => {
    it('should create an error with default values', () => {
        const error = new AppError('Test error');
        
        expect(error.message).toBe('Test error');
        expect(error.statusCode).toBe(500);
        expect(error.code).toBe('INTERNAL_ERROR');
        expect(error.isOperational).toBe(true);
    });

    it('should create an error with custom values', () => {
        const error = new AppError('Not found', 404, 'NOT_FOUND');
        
        expect(error.message).toBe('Not found');
        expect(error.statusCode).toBe(404);
        expect(error.code).toBe('NOT_FOUND');
    });

    it('should capture stack trace', () => {
        const error = new AppError('Test error');
        
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain('Test error');
    });
});

describe('errors factory functions', () => {
    it('should create badRequest error', () => {
        const error = errors.badRequest('Invalid input');
        
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('BAD_REQUEST');
        expect(error.message).toBe('Invalid input');
    });

    it('should create unauthorized error', () => {
        const error = errors.unauthorized();
        
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('UNAUTHORIZED');
    });

    it('should create forbidden error', () => {
        const error = errors.forbidden('Access denied');
        
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe('FORBIDDEN');
    });

    it('should create notFound error', () => {
        const error = errors.notFound('User not found');
        
        expect(error.statusCode).toBe(404);
        expect(error.code).toBe('NOT_FOUND');
    });

    it('should create validationError with field', () => {
        const error = errors.validationError('Email is invalid', 'email');
        
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.field).toBe('email');
    });

    it('should create dbError with original error', () => {
        const originalError = new Error('Connection failed');
        const error = errors.dbError('Database error', originalError);
        
        expect(error.statusCode).toBe(500);
        expect(error.code).toBe('DATABASE_ERROR');
        expect(error.originalError).toBe(originalError);
    });
});

describe('errorHandler middleware', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
        mockReq = {
            path: '/api/test',
            method: 'GET'
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        mockNext = jest.fn();
    });

    it('should handle AppError correctly', () => {
        const error = new AppError('Not found', 404, 'NOT_FOUND');
        
        errorHandler(error, mockReq, mockRes, mockNext);
        
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Not found',
                    code: 'NOT_FOUND'
                })
            })
        );
    });

    it('should handle generic errors with 500 status', () => {
        const error = new Error('Something went wrong');
        
        errorHandler(error, mockReq, mockRes, mockNext);
        
        expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should handle PostgreSQL unique violation (23505)', () => {
        const error = new Error('Duplicate key');
        error.code = '23505';
        
        errorHandler(error, mockReq, mockRes, mockNext);
        
        expect(mockRes.status).toHaveBeenCalledWith(409);
        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    code: 'DUPLICATE_ENTRY'
                })
            })
        );
    });

    it('should handle PostgreSQL foreign key violation (23503)', () => {
        const error = new Error('Foreign key violation');
        error.code = '23503';
        
        errorHandler(error, mockReq, mockRes, mockNext);
        
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    code: 'REFERENCE_ERROR'
                })
            })
        );
    });

    it('should handle JWT errors', () => {
        const error = new Error('jwt malformed');
        error.name = 'JsonWebTokenError';
        
        errorHandler(error, mockReq, mockRes, mockNext);
        
        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    code: 'INVALID_TOKEN'
                })
            })
        );
    });

    it('should include field in validation errors', () => {
        const error = errors.validationError('Invalid email', 'email');
        
        errorHandler(error, mockReq, mockRes, mockNext);
        
        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    field: 'email'
                })
            })
        );
    });
});

describe('asyncHandler', () => {
    it('should pass successful result through', async () => {
        const mockFn = jest.fn().mockResolvedValue('success');
        const mockReq = {};
        const mockRes = {};
        const mockNext = jest.fn();

        const handler = asyncHandler(mockFn);
        await handler(mockReq, mockRes, mockNext);

        expect(mockFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch errors and pass to next', async () => {
        const error = new Error('Test error');
        const mockFn = jest.fn().mockRejectedValue(error);
        const mockReq = {};
        const mockRes = {};
        const mockNext = jest.fn();

        const handler = asyncHandler(mockFn);
        await handler(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(error);
    });
});
