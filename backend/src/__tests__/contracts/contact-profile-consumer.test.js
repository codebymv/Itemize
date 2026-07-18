const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const frontendRoot = path.join(repositoryRoot, 'frontend', 'src');
const ledgerPath = path.join(
  repositoryRoot,
  'backend',
  'docs',
  'API',
  'generated',
  'graphql-cutover-ledger.json'
);

function frontendSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return frontendSourceFiles(absolutePath);
    if (
      !entry.isFile()
      || !/\.[jt]sx?$/.test(entry.name)
      || /\.(test|spec)\.[jt]sx?$/.test(entry.name)
    ) {
      return [];
    }
    return [absolutePath];
  });
}

describe('aggregate contact-profile consumer boundary', () => {
  test('remains server-only until a real frontend consumer receives a cutover gate', () => {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const operation = ledger.operations.find(
      (entry) => entry.id === 'GET /api/contacts/:id/profile'
    );

    expect(operation).toBeDefined();
    expect(operation.consumerCallsites).toEqual([]);

    const frontendSource = frontendSourceFiles(frontendRoot)
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');
    expect(frontendSource).not.toMatch(/\bcontactProfile\b/);
    expect(frontendSource).not.toMatch(
      /\/api\/contacts\/[^'"`\s]*\/profile\b/
    );
  });
});
