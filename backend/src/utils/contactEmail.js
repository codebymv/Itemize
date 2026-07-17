/**
 * Canonical contact-email representation.
 *
 * Email is not a universal contact key: organizations may intentionally keep
 * duplicate contacts. Any feature that resolves an email to one contact must
 * additionally scope by organization and choose a deterministic row.
 */
function normalizeContactEmail(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    return normalized || null;
}

module.exports = {
    normalizeContactEmail,
};
