import { InvoicePdfBrandAssets } from './invoice-pdf-brand-assets';

const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.alloc(24),
]);

describe('InvoicePdfBrandAssets', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });

  it('loads the bundled Raleway weights used by the invoice renderer', async () => {
    const fonts = await new InvoicePdfBrandAssets().fonts();

    expect(fonts.regular.length).toBeGreaterThan(10_000);
    expect(fonts.semibold.length).toBeGreaterThan(10_000);
    expect(fonts.bold.length).toBeGreaterThan(10_000);
  });

  it('fetches only an owned S3 business logo path', async () => {
    process.env.AWS_S3_BUCKET = 'itemize-test';
    process.env.AWS_REGION = 'us-west-2';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(PNG, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }));
    const assets = new InvoicePdfBrandAssets();

    await expect(assets.businessLogo(
      'https://itemize-test.s3.us-west-2.amazonaws.com/logos/customer.png',
    )).resolves.toMatchObject({ format: 'png' });
    for (const url of [
      'http://itemize-test.s3.us-west-2.amazonaws.com/logos/customer.png',
      'https://attacker.invalid/logos/customer.png',
      'https://itemize-test.s3.us-west-2.amazonaws.com/private/customer.png',
      'https://itemize-test.s3.us-west-2.amazonaws.com/logos/../customer.png',
    ]) {
      await expect(assets.businessLogo(url)).resolves.toBeNull();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized and unsupported image responses', async () => {
    process.env.AWS_S3_BUCKET = 'itemize-test';
    process.env.AWS_REGION = 'us-west-2';
    const fetchMock = jest.spyOn(global, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response(Buffer.from('not an image'), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(PNG, {
      status: 200,
      headers: { 'content-length': String(3 * 1024 * 1024) },
    }));
    const assets = new InvoicePdfBrandAssets();
    const url = 'https://itemize-test.s3.us-west-2.amazonaws.com/logos/customer.png';

    await expect(assets.businessLogo(url)).resolves.toBeNull();
    await expect(assets.businessLogo(url)).resolves.toBeNull();
  });
});
