module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/integration/'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { ...require('./tsconfig.json').compilerOptions, allowJs: true } }],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  transformIgnorePatterns: ['/node_modules/(?!(@scure|@noble|@otplib)/)'],
  testEnvironment: 'node',
};
