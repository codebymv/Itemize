const crypto = require('crypto');

function generateWidgetKey() {
    return 'cw_' + crypto.randomBytes(16).toString('hex');
}

function generateSessionToken() {
    return 'cs_' + crypto.randomBytes(24).toString('hex');
}

module.exports = {
    generateWidgetKey,
    generateSessionToken
};
