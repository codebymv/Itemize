const { paidEntitlementSql } = require('../../lib/paid-entitlement-sql');

describe('paidEntitlementSql', () => {
    test('matches the paid-plan and live-billing contract', () => {
        const sql = paidEntitlementSql('org');
        expect(sql).toContain("org.plan IN ('starter','unlimited','pro')");
        expect(sql).toContain("org.subscription_status = 'active'");
        expect(sql).toContain("org.subscription_status = 'trialing'");
        expect(sql).toContain('org.trial_ends_at > CURRENT_TIMESTAMP');
    });

    test('rejects unsafe aliases', () => {
        expect(() => paidEntitlementSql('org; DROP TABLE users'))
            .toThrow('Unsafe organization SQL alias');
    });
});
