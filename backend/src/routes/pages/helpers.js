const { LANDING_PAGE_LIMITS } = require('../../lib/subscription.constants');

const SALT_ROUNDS = 10;

async function checkLandingPageLimit(pool, organizationId) {
    const orgResult = await pool.query(
        'SELECT plan, landing_pages_limit FROM organizations WHERE id = $1',
        [organizationId]
    );
    const org = orgResult.rows[0];
    const plan = org?.plan || 'starter';
    const limit = org?.landing_pages_limit ?? LANDING_PAGE_LIMITS[plan] ?? 10;

    const countResult = await pool.query(
        'SELECT COUNT(*) FROM pages WHERE organization_id = $1',
        [organizationId]
    );
    const current = parseInt(countResult.rows[0].count);
    const allowed = limit === -1 || limit === Infinity || current < limit;

    return { allowed, limit, current, plan };
}

async function generateSlug(client, organizationId, name, excludeId = null) {
    const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);

    let slug = baseSlug || 'page';
    let counter = 0;

    while (true) {
        const checkSlug = counter === 0 ? slug : `${slug}-${counter}`;

        let query = 'SELECT id FROM pages WHERE organization_id = $1 AND slug = $2';
        const params = [organizationId, checkSlug];

        if (excludeId) {
            query += ' AND id != $3';
            params.push(excludeId);
        }

        const result = await client.query(query, params);

        if (result.rows.length === 0) {
            return checkSlug;
        }

        counter++;
    }
}

function parseDeviceInfo(userAgent) {
    const ua = userAgent?.toLowerCase() || '';

    let deviceType = 'desktop';
    if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)) {
        deviceType = /ipad|tablet/i.test(ua) ? 'tablet' : 'mobile';
    }

    let browser = 'unknown';
    if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('edg')) browser = 'Edge';
    else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';

    let os = 'unknown';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

    return { deviceType, browser, os };
}

module.exports = {
    SALT_ROUNDS,
    checkLandingPageLimit,
    generateSlug,
    parseDeviceInfo
};
