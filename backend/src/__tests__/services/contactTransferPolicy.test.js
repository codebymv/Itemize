const {
    MAX_IMPORT_ROWS,
    csvCell,
    protectSpreadsheetCell,
    validateImportEnvelope,
} = require('../../services/contactTransferPolicy');

describe('contact transfer policy', () => {
    test.each(['=1+1', '+cmd', '-2+3', '@SUM(A1:A2)', '  =HYPERLINK("x")'])(
        'neutralizes spreadsheet formula prefixes: %s', value => {
        expect(protectSpreadsheetCell(value)).toBe(`'${value}`);
        }
    );

    test('quotes CSV values after formula protection', () => {
        expect(csvCell('=1+"2"')).toBe('"\'=1+""2"""');
        expect(csvCell('ordinary')).toBe('"ordinary"');
    });

    test('bounds and validates the parsed import envelope', () => {
        expect(validateImportEnvelope([], true)).toMatch(/No contacts/);
        expect(validateImportEnvelope(Array(MAX_IMPORT_ROWS + 1).fill({}), true)).toMatch(/limited/);
        expect(validateImportEnvelope([null], true)).toMatch(/object/);
        expect(validateImportEnvelope([{}], 'true')).toMatch(/boolean/);
        expect(validateImportEnvelope([{}], false)).toBeNull();
    });
});
