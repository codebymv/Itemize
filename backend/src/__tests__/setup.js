/**
 * Jest Test Setup
 * Runs before each test file
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';

// Suppress console.error during tests to reduce noise
// Error handler tests call console.error, which creates noisy output
const originalConsoleError = console.error;
beforeAll(() => {
    console.error = jest.fn();
});

afterAll(() => {
    console.error = originalConsoleError;
});

// Global test utilities
global.testUtils = {
    /**
     * Generate a random string for test data
     */
    randomString: (length = 8) => {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length }, () => 
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');
    },

    /**
     * Generate a random email for test data
     */
    randomEmail: () => {
        return `test-${global.testUtils.randomString(8)}@example.com`;
    },

    /**
     * Wait for a specified duration
     */
    wait: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// Clean up after all tests
afterAll(async () => {
    // Add any global cleanup here
});
