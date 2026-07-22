const publicReviewWidgetPath = /^\/api\/reputation\/public\/widget\/[a-f0-9]{32}$/i;

function createAuthenticatedCorsOptions(allowedOrigins, nodeEnv) {
    return {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            const isAllowed =
                allowedOrigins.some((allowed) => origin === allowed) ||
                origin.includes('.app.github.dev') ||
                (nodeEnv !== 'production' && origin.includes('localhost'));
            if (isAllowed) return callback(null, true);
            return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Organization-Id', 'X-Request-Id', 'X-CSRF-Token'],
        exposedHeaders: ['Content-Range', 'X-Content-Range', 'X-Request-Id', 'X-CSRF-Token']
    };
}

function createCorsOptionsDelegate(allowedOrigins, nodeEnv) {
    const authenticated = createAuthenticatedCorsOptions(allowedOrigins, nodeEnv);
    return (req, callback) => {
        if (req.method === 'GET' && publicReviewWidgetPath.test(req.path)) {
            callback(null, {
                origin: '*',
                credentials: false,
                methods: ['GET', 'OPTIONS'],
                allowedHeaders: ['Accept', 'Content-Type', 'Origin', 'X-Request-Id'],
                exposedHeaders: ['X-Request-Id']
            });
            return;
        }
        callback(null, authenticated);
    };
}

module.exports = { createCorsOptionsDelegate, publicReviewWidgetPath };
