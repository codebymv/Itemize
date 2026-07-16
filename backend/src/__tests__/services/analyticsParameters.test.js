const {
    createSerializedQueryClient,
    parseOptionalPositiveInteger,
    percentage,
    resolvePeriod,
    toInteger,
    toNumber,
} = require('../../services/analyticsParameters');

describe('analytics parameters', () => {
    test('resolves only explicitly supported periods', () => {
        expect(resolvePeriod('contacts', undefined, '6months')).toEqual({
            period: '6months', interval: '6 months', groupBy: 'month',
        });
        expect(resolvePeriod('contacts', '7days', '6months')).toEqual({
            period: '7days', interval: '7 days', groupBy: 'day',
        });
        expect(resolvePeriod('contacts', 'forever', '6months')).toBeNull();
        expect(resolvePeriod('contacts', ['7days'], '6months')).toBeNull();
    });

    test('accepts only safe positive integer identifiers', () => {
        expect(parseOptionalPositiveInteger(undefined)).toEqual({ value: undefined });
        expect(parseOptionalPositiveInteger('42')).toEqual({ value: 42 });
        expect(parseOptionalPositiveInteger('0')).toHaveProperty('error');
        expect(parseOptionalPositiveInteger('1 OR 1=1')).toHaveProperty('error');
        expect(parseOptionalPositiveInteger('9007199254740993')).toHaveProperty('error');
    });

    test('normalizes PostgreSQL numeric output and zero denominators', () => {
        expect(toInteger('12')).toBe(12);
        expect(toInteger(null)).toBe(0);
        expect(toNumber('12.50')).toBe(12.5);
        expect(toNumber(undefined)).toBe(0);
        expect(percentage(1, 4)).toBe(25);
        expect(percentage(0, 0)).toBe(0);
    });

    test('serializes queries issued together on one checked-out client', async () => {
        const releases = [];
        const rawClient = {
            query: jest.fn(label => new Promise(resolve => releases.push(() => resolve(label)))),
        };
        const client = createSerializedQueryClient(rawClient);

        const first = client.query('first');
        const second = client.query('second');
        await Promise.resolve();
        expect(rawClient.query).toHaveBeenCalledTimes(1);

        releases.shift()();
        await first;
        await Promise.resolve();
        expect(rawClient.query).toHaveBeenCalledTimes(2);

        releases.shift()();
        await expect(second).resolves.toBe('second');
    });

    test('does not start queued queries after an earlier query fails', async () => {
        const failure = new Error('database unavailable');
        const rawClient = { query: jest.fn().mockRejectedValueOnce(failure) };
        const client = createSerializedQueryClient(rawClient);

        const first = client.query('first');
        const second = client.query('second');

        await expect(first).rejects.toBe(failure);
        await expect(second).rejects.toBe(failure);
        expect(rawClient.query).toHaveBeenCalledTimes(1);
    });
});
