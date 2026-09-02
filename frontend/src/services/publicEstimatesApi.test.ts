import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptPublicEstimate,
  declinePublicEstimate,
  getPublicEstimate,
} from './publicEstimatesApi';

vi.mock('@/lib/api', () => ({ getApiUrl: () => 'https://api.itemize.test' }));

const data = {
  estimate: {
    number: 'EST-00001', status: 'sent', issue_date: '2026-08-20',
    valid_until: '2026-09-20', currency: 'USD', subtotal: '10.00',
    tax_amount: '0.00', discount_amount: '0.00', total: '10.00',
    notes: null, terms_and_conditions: null, sent_at: null, viewed_at: null,
    accepted_at: null, declined_at: null,
  },
  customer: { name: 'Customer' },
  business: { name: 'Studio', email: null },
  items: [],
} as const;

describe('public estimate API', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses credential-free capability requests for reads and terminal actions', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));
    vi.stubGlobal('fetch', fetchMock);

    await getPublicEstimate('public_token_value_abcdefghijklmnopqrstuvwxyz');
    await acceptPublicEstimate('public_token_value_abcdefghijklmnopqrstuvwxyz');
    await declinePublicEstimate('public_token_value_abcdefghijklmnopqrstuvwxyz');

    expect(fetchMock.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      ['https://api.itemize.test/api/public/estimates/public_token_value_abcdefghijklmnopqrstuvwxyz', 'GET'],
      ['https://api.itemize.test/api/public/estimates/public_token_value_abcdefghijklmnopqrstuvwxyz/accept', 'POST'],
      ['https://api.itemize.test/api/public/estimates/public_token_value_abcdefghijklmnopqrstuvwxyz/decline', 'POST'],
    ]);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    }
  });

  it('surfaces the non-enumerating server message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        success: false,
        error: { message: 'Estimate link is invalid or expired' },
      }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )));
    await expect(getPublicEstimate('missing')).rejects.toThrow(
      'Estimate link is invalid or expired',
    );
  });

  it('retries an ambiguous terminal transport failure with the same capability action', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    vi.stubGlobal('fetch', fetchMock);

    const pending = acceptPublicEstimate('public_token_value_abcdefghijklmnopqrstuvwxyz');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]).toEqual(fetchMock.mock.calls[1]);
  });
});
