import {
    MAX_CONTACT_CSV_BYTES,
    MAX_CONTACT_CSV_COLUMNS,
    MAX_CONTACT_CSV_ROWS,
    parseContactCsv,
} from './contactCsv';

describe('contact CSV parser', () => {
    it('parses aliases, CRLF, escaped quotes, commas, and quoted newlines', () => {
        const parsed = parseContactCsv(
            '\uFEFFFirst Name,Email Address,Company,Tags\r\n'
            + '"Ada","ADA@EXAMPLE.TEST","Analytical, Inc.","vip;lead"\r\n'
            + '"Grace ""Amazing""","grace@example.test","Line one\nLine two",""\r\n',
        );

        expect(parsed).toEqual([
            {
                first_name: 'Ada',
                email: 'ADA@EXAMPLE.TEST',
                company: 'Analytical, Inc.',
                tags: 'vip;lead',
            },
            {
                first_name: 'Grace "Amazing"',
                email: 'grace@example.test',
                company: 'Line one\nLine two',
            },
        ]);
    });

    it('ignores unknown source columns but rejects ambiguous mapped headers', () => {
        expect(parseContactCsv(
            'First Name,Favorite Color,Email\nAda,Blue,ada@example.test\n',
        )).toEqual([
            { first_name: 'Ada', email: 'ada@example.test' },
        ]);
        expect(() => parseContactCsv(
            'Email,Email Address\none@example.test,two@example.test\n',
        )).toThrow('duplicate contact columns');
    });

    it('rejects malformed records and rows wider than the header', () => {
        expect(() => parseContactCsv(
            'First Name,Email\n"Unclosed,person@example.test\n',
        )).toThrow('unclosed quoted value');
        expect(() => parseContactCsv(
            'First Name\nAda,extra\n',
        )).toThrow('more values than the header');
    });

    it('enforces byte, row, and column limits', () => {
        expect(() => parseContactCsv(
            `First Name\n${'x'.repeat(MAX_CONTACT_CSV_BYTES)}\n`,
        )).toThrow('limited to 1 MB');
        expect(() => parseContactCsv(
            `${Array.from({ length: MAX_CONTACT_CSV_COLUMNS + 1 }, (_, index) => `Column ${index}`).join(',')}\nvalue\n`,
        )).toThrow(`limited to ${MAX_CONTACT_CSV_COLUMNS} columns`);
        expect(() => parseContactCsv(
            `First Name\n${Array.from({ length: MAX_CONTACT_CSV_ROWS + 1 }, () => 'Ada').join('\n')}`,
        )).toThrow(`limited to ${MAX_CONTACT_CSV_ROWS} rows`);
    });
});
