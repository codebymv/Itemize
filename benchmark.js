const { performance } = require('perf_hooks');
const mockPool = {
    connect: async () => {
        return {
            query: async (text, params) => {
                await new Promise(resolve => setTimeout(resolve, 2)); // simulate 2ms network latency
                if (text.includes('SELECT id FROM calendars')) {
                    return { rows: [{ id: 1 }] };
                }
                return { rows: [] };
            },
            release: () => {}
        };
    }
};

const authenticateJWT = (req, res, next) => next();

// Mock dependencies required by the module
jest = { mock: () => {} }; // to avoid issues if jest is used
try {
    const router = require('./backend/src/routes/calendars.routes.js')(mockPool, authenticateJWT);

    // Find the route handler for PUT /:id/availability
    // In express, routers have stack
    // Let's print the stack to see what it looks like
    const route = router.stack.find(layer => layer.route && layer.route.path === '/:id/availability');

    // We need to bypass authenticateJWT and requireOrganization, which are prepended to the route stack or inside the route.
    // The handler is the last one in the route.stack
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    const req = {
        params: { id: 1 },
        organizationId: 1,
        body: {
            availability_windows: Array.from({ length: 50 }, (_, i) => ({
                day_of_week: i % 7,
                start_time: '09:00',
                end_time: '17:00',
                is_active: true
            }))
        }
    };

    const res = {
        json: (data) => {},
        status: (code) => res,
        send: () => res
    };

    async function runBenchmark() {
        const start = performance.now();
        await handler(req, res);
        const end = performance.now();

        console.log(`Baseline Execution time for 50 windows: ${end - start} ms`);
    }

    runBenchmark().catch(console.error);

} catch (e) {
    console.error(e);
}
