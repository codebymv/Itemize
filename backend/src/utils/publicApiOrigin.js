const FALLBACK_PRODUCTION_API_ORIGIN =
    'https://itemize-backend-production-92ad.up.railway.app';

const RAILWAY_DOMAIN = /^[a-z0-9.-]+$/i;

function getProductionApiOrigin() {
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (railwayDomain && RAILWAY_DOMAIN.test(railwayDomain)) {
        return `https://${railwayDomain}`;
    }

    return FALLBACK_PRODUCTION_API_ORIGIN;
}

module.exports = {
    FALLBACK_PRODUCTION_API_ORIGIN,
    getProductionApiOrigin,
};
