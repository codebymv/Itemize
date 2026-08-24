// Minimal console logger shim replacing the legacy winston logger so the
// ported PDF service stays dependency-free inside backend-v2.
const format = (level, args) =>
    console[level === 'error' ? 'error' : 'log'](
        `[pdf-service] ${level}:`,
        ...args,
    );
module.exports = {
    logger: {
        info: (...args) => format('info', args),
        warn: (...args) => format('warn', args),
        error: (...args) => format('error', args),
        debug: () => {},
    },
};
