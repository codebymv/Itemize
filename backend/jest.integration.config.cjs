module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/integration/**/*.integration-spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { ...require('./tsconfig.json').compilerOptions, allowJs: true } }],
  },
  globalSetup: '<rootDir>/test/integration/global-setup.cjs',
  transformIgnorePatterns: ['/node_modules/(?!(@scure|@noble|@otplib)/)'],
  testEnvironment: 'node',
  testTimeout: 30000,
};
