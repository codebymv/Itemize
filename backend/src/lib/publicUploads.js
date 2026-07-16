const express = require('express');
const path = require('path');

function createPublicUploadsRouter(uploadsRoot) {
    const router = express.Router();
    const logoRoot = path.resolve(uploadsRoot, 'logos');

    router.use('/logos', (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        next();
    }, express.static(logoRoot, {
        fallthrough: true,
        index: false,
        redirect: false,
    }));

    return router;
}

module.exports = { createPublicUploadsRouter };
