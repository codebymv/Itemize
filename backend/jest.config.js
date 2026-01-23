/**
 * Jest Configuration
 * @see https://jestjs.io/docs/configuration
 */

module.exports = {
    // Use Node.js test environment
    testEnvironment: 'node',
    
    // Test file patterns
    testMatch: [
        '**/src/__tests__/**/*.test.js',
        '**/src/**/*.spec.js'
    ],
    
    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/'
    ],
    
    // Coverage configuration
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/__tests__/**',
        '!src/index.js',
        '!src/models.js'
    ],
    
    // Coverage thresholds (can be increased over time)
    coverageThreshold: {
        global: {
            branches: 20,
            functions: 20,
            lines: 20,
            statements: 20
        }
    },
    
    // Coverage output directory
    coverageDirectory: 'coverage',
    
    // Setup files
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
    
    // Timeout for tests
    testTimeout: 10000,
    
    // Verbose output
    verbose: true,
    
    // Clear mocks between tests
    clearMocks: true,
    
    // Detect open handles
    detectOpenHandles: true,
    
    // Force exit after tests complete
    forceExit: true
};
