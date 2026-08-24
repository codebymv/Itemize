import {
  csvCell,
  MAX_IMPORT_ROWS,
  protectSpreadsheetCell,
  validateImportEnvelope,
} from './contact-transfer.contract';

describe('contact transfer contract', () => {
  it.each([
    '=1+1',
    '+cmd',
    '-2+3',
    '@SUM(A1:A2)',
    '  =HYPERLINK("x")',
  ])('neutralizes spreadsheet formula prefixes: %s', (value) => {
    expect(protectSpreadsheetCell(value)).toBe(`'${value}`);
  });

  it('quotes values after formula protection', () => {
    expect(csvCell('=1+"2"')).toBe('"\'=1+""2"""');
    expect(csvCell('ordinary')).toBe('"ordinary"');
  });

  it('validates the parsed JSON import envelope before database work', () => {
    expect(validateImportEnvelope(null)).toBe('Import body must be an object');
    expect(validateImportEnvelope({ contacts: [] })).toBe(
      'No contacts data provided',
    );
    expect(
      validateImportEnvelope({
        contacts: Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({})),
      }),
    ).toContain(`limited to ${MAX_IMPORT_ROWS}`);
    expect(
      validateImportEnvelope({ contacts: [null], skipDuplicates: true }),
    ).toContain('must be an object');
    expect(
      validateImportEnvelope({ contacts: [{}], skipDuplicates: 'true' }),
    ).toContain('must be a boolean');
    expect(validateImportEnvelope({ contacts: [{}] })).toEqual({
      contacts: [{}],
      skipDuplicates: true,
    });
  });
});
