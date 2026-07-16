const {
    assertLogoUpload,
    detectLogoType,
    resolveLocalLogoPath,
} = require('../../routes/invoices/logo-upload');

describe('logo upload policy', () => {
    test.each([
        [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png', '.png'],
        [Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg', '.jpg'],
        [Buffer.from('GIF89a'), 'image/gif', '.gif'],
        [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]), 'image/webp', '.webp'],
    ])('detects supported image bytes independently of client MIME', (buffer, mimetype, extension) => {
        expect(detectLogoType(buffer)).toEqual({ mimetype, extension });
    });

    test('rejects executable or unknown bytes even when labeled as an image', async () => {
        await expect(assertLogoUpload({
            buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
            mimetype: 'image/png',
        })).rejects.toMatchObject({ code: 'INVALID_FILE_CONTENT' });
    });

    test('resolves only one safe filename inside the public logo directory', () => {
        expect(resolveLocalLogoPath('/uploads/logos/logo-7.png')).toMatch(/uploads[\\/]logos[\\/]logo-7\.png$/);
        expect(resolveLocalLogoPath('/uploads/logos/../../secrets.env')).toBeNull();
        expect(resolveLocalLogoPath('/uploads/signatures/contract.pdf')).toBeNull();
    });
});
