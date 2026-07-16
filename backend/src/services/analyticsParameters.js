const PERIODS = Object.freeze({
    contacts: Object.freeze({
        '7days': Object.freeze({ interval: '7 days', groupBy: 'day' }),
        '30days': Object.freeze({ interval: '30 days', groupBy: 'day' }),
        '6months': Object.freeze({ interval: '6 months', groupBy: 'month' }),
        '12months': Object.freeze({ interval: '12 months', groupBy: 'month' }),
    }),
    deals: Object.freeze({
        '30days': Object.freeze({ interval: '30 days' }),
        '6months': Object.freeze({ interval: '6 months' }),
        '12months': Object.freeze({ interval: '12 months' }),
    }),
    conversions: Object.freeze({
        '7days': Object.freeze({ interval: '7 days' }),
        '30days': Object.freeze({ interval: '30 days' }),
        '90days': Object.freeze({ interval: '90 days' }),
        '12months': Object.freeze({ interval: '12 months' }),
    }),
    revenue: Object.freeze({
        '30days': Object.freeze({ interval: '30 days', groupBy: 'day' }),
        '6months': Object.freeze({ interval: '6 months', groupBy: 'month' }),
        '12months': Object.freeze({ interval: '12 months', groupBy: 'month' }),
    }),
    communications: Object.freeze({
        '7days': Object.freeze({ interval: '7 days' }),
        '30days': Object.freeze({ interval: '30 days' }),
        '90days': Object.freeze({ interval: '90 days' }),
    }),
});

function resolvePeriod(family, value, defaultPeriod) {
    const periods = PERIODS[family];
    const period = value === undefined ? defaultPeriod : value;
    if (typeof period !== 'string' || !Object.prototype.hasOwnProperty.call(periods, period)) {
        return null;
    }

    return { period, ...periods[period] };
}

function parseOptionalPositiveInteger(value) {
    if (value === undefined) return { value: undefined };
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
        return { error: 'must be a positive integer' };
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) return { error: 'must be a safe positive integer' };
    return { value: parsed };
}

function toInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(numerator, denominator) {
    return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function createSerializedQueryClient(client) {
    let tail = Promise.resolve();
    let firstError;

    return {
        query(...args) {
            const operation = tail.then(() => {
                if (firstError) throw firstError;
                return client.query(...args);
            });
            tail = operation.then(
                () => undefined,
                error => { firstError ??= error; }
            );
            return operation;
        },
    };
}

module.exports = {
    createSerializedQueryClient,
    parseOptionalPositiveInteger,
    percentage,
    resolvePeriod,
    toInteger,
    toNumber,
};
