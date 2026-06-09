const js = require('@eslint/js');
const globals = require('globals');

const recommendedWarnings = Object.fromEntries(
  Object.keys(js.configs.recommended.rules).map((ruleName) => [ruleName, 'warn'])
);

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'output.log']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'warn'
    },
    rules: {
      ...recommendedWarnings,
      'no-console': 'off',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ]
    }
  }
];
